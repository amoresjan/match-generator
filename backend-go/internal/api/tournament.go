package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"

	"github.com/amoresjan/match-generator/backend/internal/push"
	"github.com/amoresjan/match-generator/backend/internal/store"
	"github.com/amoresjan/match-generator/backend/internal/tournament"
)

func (h *Handler) TournamentSetup(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	session, err := h.store.GetSession(r.Context(), sessionID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}
	if !requireAdmin(r, session.AdminToken) {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}

	players, err := h.store.GetPlayersForSession(r.Context(), sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error fetching players")
		return
	}
	playerNames := playerNameMap(players)

	var body struct {
		Randomize bool `json:"randomize"`
		Teams     []struct {
			PlayerIDs []string `json:"player_ids"`
		} `json:"teams"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	teamSize := 1
	if session.MatchType == "2v2" {
		teamSize = 2
	}

	var rawTeams []tournament.TeamInput
	if body.Randomize {
		activeIDs := make([]string, 0, len(players))
		for _, p := range players {
			if !p.SitOut {
				activeIDs = append(activeIDs, p.ID.String())
			}
		}
		rawTeams = tournament.RandomizeTeams(activeIDs, teamSize)
	} else {
		if len(body.Teams) == 0 {
			writeError(w, http.StatusBadRequest, "provide teams list or set randomize=true")
			return
		}
		rawTeams = make([]tournament.TeamInput, len(body.Teams))
		for i, t := range body.Teams {
			pids := make([]string, len(t.PlayerIDs))
			copy(pids, t.PlayerIDs)
			name := buildTeamName(pids, playerNames)
			rawTeams[i] = tournament.TeamInput{PlayerIDs: pids, Name: name, Seed: i + 1}
		}
	}

	// Fill in names for randomized teams.
	for i := range rawTeams {
		if rawTeams[i].Name == "" {
			rawTeams[i].Name = buildTeamName(rawTeams[i].PlayerIDs, playerNames)
		}
		if rawTeams[i].Seed == 0 {
			rawTeams[i].Seed = i + 1
		}
	}

	bracket, err := tournament.BuildBracket(rawTeams, session.NumCourts)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	data, err := json.Marshal(bracket)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "serialisation error")
		return
	}
	if err := h.store.SetTournamentData(r.Context(), sessionID, data); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save bracket")
		return
	}

	session.TournamentData = data
	rounds, _ := h.store.GetRoundsWithMatches(r.Context(), sessionID, nil)
	resp := toSessionResp(session, players, rounds)
	if resp.Players == nil {
		resp.Players = []playerResp{}
	}
	if resp.Rounds == nil {
		resp.Rounds = []roundResp{}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) TournamentAdvance(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	session, err := h.store.GetSession(r.Context(), sessionID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}
	if !requireAdmin(r, session.AdminToken) {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}
	if !session.IsActive {
		writeError(w, http.StatusForbidden, "Session is deactivated.")
		return
	}
	if len(session.TournamentData) == 0 {
		writeError(w, http.StatusBadRequest, "Tournament not initialised.")
		return
	}

	var bracket tournament.Bracket
	if err := json.Unmarshal(session.TournamentData, &bracket); err != nil {
		writeError(w, http.StatusInternalServerError, "could not parse tournament data")
		return
	}

	var body struct {
		MatchSlotID   string `json:"match_slot_id"`
		WinnerTeamID  string `json:"winner_team_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.MatchSlotID == "" || body.WinnerTeamID == "" {
		writeError(w, http.StatusBadRequest, "match_slot_id and winner_team_id required")
		return
	}

	// Find slot and validate.
	var slot *tournament.MatchSlot
	for i := range bracket.MatchSlots {
		if bracket.MatchSlots[i].ID == body.MatchSlotID {
			slot = &bracket.MatchSlots[i]
			break
		}
	}
	if slot == nil {
		writeError(w, http.StatusNotFound, "match slot not found")
		return
	}
	if slot.Status != "active" && slot.Status != "ready" {
		writeError(w, http.StatusBadRequest, "this match is not active")
		return
	}

	// Find teams.
	teamsById := make(map[string]*tournament.Team, len(bracket.Teams))
	for i := range bracket.Teams {
		teamsById[bracket.Teams[i].ID] = &bracket.Teams[i]
	}
	topTeam := teamsById[strOrEmpty(slot.TopTeamID)]
	botTeam := teamsById[strOrEmpty(slot.BottomTeamID)]

	var winnerSide string
	if ptrStr(slot.TopTeamID) == body.WinnerTeamID {
		winnerSide = "team1"
	} else if ptrStr(slot.BottomTeamID) == body.WinnerTeamID {
		winnerSide = "team2"
	} else {
		writeError(w, http.StatusBadRequest, "winner_team_id must be one of the two teams")
		return
	}

	prevActive := sliceToSet(bracket.ActiveMatchIDs)

	// Create round + match inside a transaction with SELECT FOR UPDATE.
	var dbMatchID uuid.UUID
	err = h.store.WithTx(r.Context(), func(q *store.Queries) error {
		if _, err := q.GetSessionForUpdate(r.Context(), sessionID); err != nil {
			return err
		}

		maxNum, err := q.GetMaxRoundNumber(r.Context(), sessionID)
		if err != nil {
			return err
		}
		rndID := uuid.New()
		if _, err := q.CreateRound(r.Context(), rndID, sessionID, maxNum+1); err != nil {
			return err
		}

		t1 := teamPlayerIDs(topTeam)
		t2 := teamPlayerIDs(botTeam)
		dbMatchID = uuid.New()
		_, err = q.CreateMatch(r.Context(), store.CreateMatchParams{
			ID: dbMatchID, RoundID: rndID,
			CourtNumber: 1, Team1Players: t1, Team2Players: t2,
		})
		if err != nil {
			return err
		}

		dbMatchIDStr := dbMatchID.String()
		updated, err := tournament.AdvanceBracket(&bracket, body.MatchSlotID, body.WinnerTeamID, session.NumCourts, &dbMatchIDStr)
		if err != nil {
			return err
		}
		bracket = *updated

		// Patch match winner.
		if _, err := q.SetMatchWinner(r.Context(), dbMatchID, &winnerSide); err != nil {
			return err
		}

		data, err := json.Marshal(bracket)
		if err != nil {
			return err
		}
		return q.SetTournamentData(r.Context(), sessionID, data)
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not advance bracket: "+err.Error())
		return
	}

	// Push to newly active matches.
	newlyActive := make(map[string]struct{})
	for _, id := range bracket.ActiveMatchIDs {
		if _, was := prevActive[id]; !was {
			newlyActive[id] = struct{}{}
		}
	}
	if len(newlyActive) > 0 {
		allPlayers, _ := h.store.GetPlayersForSession(r.Context(), sessionID)
		playerNames := playerNameMap(allPlayers)
		payloads := tournamentMatchPushPayloads(session.Name, sessionID.String(), bracket, newlyActive, playerNames)
		if len(payloads) > 0 {
			restricted := make(map[string]struct{}, len(payloads))
			for pid := range payloads {
				restricted[pid] = struct{}{}
			}
			go h.pushClient.SendToSession(r.Context(), sessionID, push.SendOptions{
				Payload:    map[string]any{"title": session.Name, "body": "Your match is up!", "url": "/session/" + sessionID.String()},
				PerPlayer:  payloads,
				RestrictTo: restricted,
			})
		}
	}
	if bracket.Status == "complete" && bracket.ChampionTeamID != nil {
		champName := "A team"
		for _, t := range bracket.Teams {
			if t.ID == *bracket.ChampionTeamID {
				champName = t.Name
				break
			}
		}
		go h.pushClient.SendToSession(r.Context(), sessionID, push.SendOptions{
			Payload: map[string]any{
				"title": session.Name,
				"body":  fmt.Sprintf("🏆 %s wins the tournament!", champName),
				"url":   "/session/" + sessionID.String(),
			},
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"tournament_data": bracket})
}

// ---- helpers ----------------------------------------------------------------

func buildTeamName(pids []string, names map[string]string) string {
	return joinNames(pids, names)
}

func tournamentMatchPushPayloads(sessionName, sessionID string, b tournament.Bracket, newlyActive map[string]struct{}, playerNames map[string]string) map[string]map[string]any {
	slotsByID := make(map[string]*tournament.MatchSlot, len(b.MatchSlots))
	for i := range b.MatchSlots {
		slotsByID[b.MatchSlots[i].ID] = &b.MatchSlots[i]
	}
	teamsByID := make(map[string]*tournament.Team, len(b.Teams))
	for i := range b.Teams {
		teamsByID[b.Teams[i].ID] = &b.Teams[i]
	}

	roundName := func(r int) string {
		switch r {
		case b.NumRounds:
			return "Final"
		case b.NumRounds - 1:
			return "Semifinals"
		case b.NumRounds - 2:
			return "Quarterfinals"
		default:
			return fmt.Sprintf("Round %d", r)
		}
	}

	payloads := make(map[string]map[string]any)
	url := "/session/" + sessionID
	for slotID := range newlyActive {
		slot := slotsByID[slotID]
		if slot == nil {
			continue
		}
		top := teamsByID[strOrEmpty(slot.TopTeamID)]
		bot := teamsByID[strOrEmpty(slot.BottomTeamID)]
		if top == nil || bot == nil {
			continue
		}
		rn := roundName(slot.Round)
		for _, pair := range [][2]*tournament.Team{{top, bot}, {bot, top}} {
			myTeam, oppTeam := pair[0], pair[1]
			oppNames := make([]string, len(oppTeam.PlayerIDs))
			for i, pid := range oppTeam.PlayerIDs {
				oppNames[i] = playerNames[pid]
				if oppNames[i] == "" {
					oppNames[i] = "?"
				}
			}
			oppStr := joinNames(oppTeam.PlayerIDs, playerNames)
			for _, pid := range myTeam.PlayerIDs {
				partners := without(myTeam.PlayerIDs, pid)
				var body string
				if len(partners) > 0 {
					body = fmt.Sprintf("%s — with %s vs %s", rn, joinNames(partners, playerNames), oppStr)
				} else {
					body = fmt.Sprintf("%s — vs %s", rn, oppStr)
				}
				payloads[pid] = map[string]any{"title": sessionName, "body": body, "url": url}
			}
		}
	}
	return payloads
}

func teamPlayerIDs(t *tournament.Team) []string {
	if t == nil {
		return []string{}
	}
	return t.PlayerIDs
}

func ptrStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func strOrEmpty(p *string) string { return ptrStr(p) }

func sliceToSet(s []string) map[string]struct{} {
	m := make(map[string]struct{}, len(s))
	for _, v := range s {
		m[v] = struct{}{}
	}
	return m
}

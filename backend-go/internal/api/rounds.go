package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/amoresjan/match-generator/backend/internal/generator"
	"github.com/amoresjan/match-generator/backend/internal/push"
	"github.com/amoresjan/match-generator/backend/internal/store"
)

func (h *Handler) GenerateRound(w http.ResponseWriter, r *http.Request) {
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

	players, err := h.store.GetActivePlayers(r.Context(), sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error fetching players")
		return
	}
	hist, err := h.store.GetFullHistory(r.Context(), sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error fetching history")
		return
	}

	var wins map[string]int
	if session.GenerationMode == "competitive" {
		wins, err = h.store.GetWinCountsForSession(r.Context(), sessionID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "error fetching wins")
			return
		}
	}

	generated, err := generator.GenerateRound(session, players, hist, wins)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	rnd, err := generator.CommitRound(r.Context(), h.store, sessionID, generated)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not commit round")
		return
	}

	matches, _ := h.store.GetMatchesForRound(r.Context(), rnd.ID)
	allPlayers, _ := h.store.GetPlayersForSession(r.Context(), sessionID)
	playerNames := playerNameMap(allPlayers)

	go h.pushClient.SendToSession(r.Context(), sessionID, push.SendOptions{
		Payload:   map[string]any{"title": session.Name, "body": fmt.Sprintf("Round %d is ready!", rnd.Number), "url": "/session/" + sessionID.String()},
		PerPlayer: roundPushPayloads(session.Name, rnd.Number, sessionID.String(), matches, playerNames),
	})

	writeJSON(w, http.StatusCreated, roundResp{
		ID:        rnd.ID,
		Number:    rnd.Number,
		CreatedAt: rnd.CreatedAt,
		Matches:   matchRespSlice(matches),
	})
}

func (h *Handler) OverrideMatch(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	matchID, err := uuidParam(r, "matchID")
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

	match, err := h.store.GetMatchByIDAndSession(r.Context(), matchID, sessionID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}

	var body struct {
		Team1Players []string `json:"team1_players"`
		Team2Players []string `json:"team2_players"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	players, _ := h.store.GetPlayersForSession(r.Context(), sessionID)
	validIDs := make(map[string]bool, len(players))
	for _, p := range players {
		validIDs[p.ID.String()] = true
	}
	for _, pid := range append(body.Team1Players, body.Team2Players...) {
		if !validIDs[pid] {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("player %s not in this session", pid))
			return
		}
	}

	var updatedMatch store.Match
	err = h.store.WithTx(r.Context(), func(q *store.Queries) error {
		var txErr error
		updatedMatch, txErr = q.OverrideMatch(r.Context(), store.UpdateMatchParams{
			ID:           matchID,
			Team1Players: body.Team1Players,
			Team2Players: body.Team2Players,
		})
		if txErr != nil {
			return txErr
		}
		return generator.ReconcileRoundHistory(r.Context(), q, store.Round{ID: match.RoundID}, sessionID)
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not override match")
		return
	}

	playerNames := playerNameMap(players)
	affected := make(map[string]struct{})
	for _, pid := range append(updatedMatch.Team1Players, updatedMatch.Team2Players...) {
		affected[pid] = struct{}{}
	}
	go h.pushClient.SendToSession(r.Context(), sessionID, push.SendOptions{
		Payload:    map[string]any{"title": session.Name, "body": "A match was updated.", "url": "/session/" + sessionID.String()},
		PerPlayer:  overridePushPayloads(session.Name, sessionID.String(), updatedMatch.CourtNumber, updatedMatch.Team1Players, updatedMatch.Team2Players, playerNames),
		RestrictTo: affected,
	})

	writeJSON(w, http.StatusOK, toMatchResp(updatedMatch))
}

func (h *Handler) SetMatchResult(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	matchID, err := uuidParam(r, "matchID")
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

	if _, err := h.store.GetMatchByIDAndSession(r.Context(), matchID, sessionID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}

	var body struct {
		Winner *string `json:"winner"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Winner != nil && *body.Winner != "team1" && *body.Winner != "team2" {
		writeError(w, http.StatusBadRequest, `winner must be "team1", "team2", or null`)
		return
	}

	updated, err := h.store.SetMatchWinner(r.Context(), matchID, body.Winner)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not set result")
		return
	}
	writeJSON(w, http.StatusOK, toMatchResp(updated))
}

func (h *Handler) PreviewRounds(w http.ResponseWriter, r *http.Request) {
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

	count := 5
	if s := r.URL.Query().Get("count"); s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			count = clamp(n, 1, 10)
		}
	}

	players, _ := h.store.GetActivePlayers(r.Context(), sessionID)
	hist, _ := h.store.GetFullHistory(r.Context(), sessionID)
	var wins map[string]int
	if session.GenerationMode == "competitive" {
		wins, _ = h.store.GetWinCountsForSession(r.Context(), sessionID)
	}

	rounds, err := generator.PreviewRounds(session, players, hist, wins, count)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rounds)
}

// ---- push payload builders --------------------------------------------------

func roundPushPayloads(sessionName string, roundNum int, sessionID string, matches []store.Match, names map[string]string) map[string]map[string]any {
	type info struct{ court int; myTeam, oppTeam []string }
	playerToMatch := make(map[string]info)
	for _, m := range matches {
		for _, pid := range m.Team1Players {
			playerToMatch[pid] = info{m.CourtNumber, m.Team1Players, m.Team2Players}
		}
		for _, pid := range m.Team2Players {
			playerToMatch[pid] = info{m.CourtNumber, m.Team2Players, m.Team1Players}
		}
	}

	url := "/session/" + sessionID
	payloads := make(map[string]map[string]any, len(names))
	for pid, name := range names {
		_ = name
		var body string
		if mi, ok := playerToMatch[pid]; ok {
			partners := without(mi.myTeam, pid)
			if len(partners) > 0 {
				body = fmt.Sprintf("Court %d — with %s vs %s", mi.court, joinNames(partners, names), joinNames(mi.oppTeam, names))
			} else {
				body = fmt.Sprintf("Court %d — vs %s", mi.court, joinNames(mi.oppTeam, names))
			}
		} else {
			body = fmt.Sprintf("Round %d — you're sitting out", roundNum)
		}
		payloads[pid] = map[string]any{"title": sessionName, "body": body, "url": url}
	}
	return payloads
}

func overridePushPayloads(sessionName, sessionID string, courtNum int, t1, t2 []string, names map[string]string) map[string]map[string]any {
	url := "/session/" + sessionID
	payloads := make(map[string]map[string]any)
	for _, pid := range t1 {
		partners := without(t1, pid)
		var body string
		if len(partners) > 0 {
			body = fmt.Sprintf("Court %d updated — with %s vs %s", courtNum, joinNames(partners, names), joinNames(t2, names))
		} else {
			body = fmt.Sprintf("Court %d updated — vs %s", courtNum, joinNames(t2, names))
		}
		payloads[pid] = map[string]any{"title": sessionName, "body": body, "url": url}
	}
	for _, pid := range t2 {
		partners := without(t2, pid)
		var body string
		if len(partners) > 0 {
			body = fmt.Sprintf("Court %d updated — with %s vs %s", courtNum, joinNames(partners, names), joinNames(t1, names))
		} else {
			body = fmt.Sprintf("Court %d updated — vs %s", courtNum, joinNames(t1, names))
		}
		payloads[pid] = map[string]any{"title": sessionName, "body": body, "url": url}
	}
	return payloads
}

// ---- small helpers ----------------------------------------------------------

func without(ids []string, exclude string) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != exclude {
			out = append(out, id)
		}
	}
	return out
}

func joinNames(ids []string, names map[string]string) string {
	parts := make([]string, len(ids))
	for i, id := range ids {
		if n, ok := names[id]; ok {
			parts[i] = n
		} else {
			parts[i] = "?"
		}
	}
	return strings.Join(parts, " & ")
}

func playerNameMap(players []store.PlayerWithPartner) map[string]string {
	m := make(map[string]string, len(players))
	for _, p := range players {
		m[p.ID.String()] = p.Name
	}
	return m
}

func matchRespSlice(matches []store.Match) []matchResp {
	out := make([]matchResp, len(matches))
	for i, m := range matches {
		out[i] = toMatchResp(m)
	}
	return out
}

func clamp(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

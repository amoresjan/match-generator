package tournament

import (
	"fmt"
	"math/rand"
	"sort"

	"github.com/google/uuid"
)

// Team represents a tournament participant.
type Team struct {
	ID        string   `json:"id"`
	Seed      int      `json:"seed"`
	Name      string   `json:"name"`
	PlayerIDs []string `json:"player_ids"`
}

// MatchSlot is one node in the bracket tree.
type MatchSlot struct {
	ID           string   `json:"id"`
	Round        int      `json:"round"`
	Position     int      `json:"position"`
	TopTeamID    *string  `json:"top_team_id"`
	BottomTeamID *string  `json:"bottom_team_id"`
	IsBye        bool     `json:"is_bye"`
	WinnerID     *string  `json:"winner_id"`
	DBMatchID    *string  `json:"db_match_id"`
	Status       string   `json:"status"` // pending | ready | active | done
	Feeds        []string `json:"feeds"`
}

// Bracket is the full tournament state stored in sessions.tournament_data.
type Bracket struct {
	Teams          []Team      `json:"teams"`
	MatchSlots     []MatchSlot `json:"match_slots"`
	ActiveMatchIDs []string    `json:"active_match_ids"`
	CurrentMatchID *string     `json:"current_match_id"`
	ChampionTeamID *string     `json:"champion_team_id"`
	Status         string      `json:"status"` // in_progress | complete
	NumTeams       int         `json:"num_teams"`
	BracketSize    int         `json:"bracket_size"`
	NumRounds      int         `json:"num_rounds"`
}

// TeamInput is the caller-supplied team definition.
type TeamInput struct {
	PlayerIDs []string
	Name      string
	Seed      int
}

// BuildBracket constructs a single-elimination bracket.
func BuildBracket(teams []TeamInput, numCourts int) (*Bracket, error) {
	n := len(teams)
	if n < 2 {
		return nil, fmt.Errorf("need at least 2 teams")
	}

	bracketSize := nextPowerOf2(n)
	numRounds := log2(bracketSize)

	builtTeams := make([]Team, n)
	for i, t := range teams {
		builtTeams[i] = Team{
			ID:        uuid.New().String(),
			Seed:      t.Seed,
			Name:      t.Name,
			PlayerIDs: t.PlayerIDs,
		}
	}
	sort.Slice(builtTeams, func(i, j int) bool { return builtTeams[i].Seed < builtTeams[j].Seed })

	seedToTeam := make(map[int]*Team, n)
	for i := range builtTeams {
		seedToTeam[builtTeams[i].Seed] = &builtTeams[i]
	}

	seedings := generateSeedings(bracketSize)
	r1Pairs := make([][2]int, len(seedings)/2)
	for i := 0; i < len(seedings); i += 2 {
		r1Pairs[i/2] = [2]int{seedings[i], seedings[i+1]}
	}

	var slots []MatchSlot
	counter := 0
	newID := func() string {
		counter++
		return fmt.Sprintf("m%d", counter)
	}

	r1Slots := make([]*MatchSlot, len(r1Pairs))
	for pos, pair := range r1Pairs {
		topTeam := seedToTeam[pair[0]]
		botTeam := seedToTeam[pair[1]]
		isBye := topTeam == nil || botTeam == nil

		var topID, botID, winnerID *string
		status := "ready"
		if topTeam != nil {
			topID = &topTeam.ID
		}
		if botTeam != nil {
			botID = &botTeam.ID
		}
		if isBye {
			status = "done"
			surviving := topTeam
			if surviving == nil {
				surviving = botTeam
			}
			winnerID = &surviving.ID
		}

		s := MatchSlot{
			ID: newID(), Round: 1, Position: pos,
			TopTeamID: topID, BottomTeamID: botID,
			IsBye: isBye, WinnerID: winnerID,
			Status: status, Feeds: []string{},
		}
		slots = append(slots, s)
		r1Slots[pos] = &slots[len(slots)-1]
	}

	prevRound := r1Slots
	for rnd := 2; rnd <= numRounds; rnd++ {
		currRound := make([]*MatchSlot, 0, len(prevRound)/2)
		for i := 0; i+1 < len(prevRound); i += 2 {
			fa, fb := prevRound[i], prevRound[i+1]
			var topID, botID *string
			if fa.Status == "done" {
				topID = fa.WinnerID
			}
			if fb.Status == "done" {
				botID = fb.WinnerID
			}

			slotStatus := "pending"
			if topID != nil && botID != nil {
				slotStatus = "ready"
			}

			s := MatchSlot{
				ID: newID(), Round: rnd, Position: i / 2,
				TopTeamID: topID, BottomTeamID: botID,
				Status: slotStatus, Feeds: []string{fa.ID, fb.ID},
			}
			slots = append(slots, s)
			currRound = append(currRound, &slots[len(slots)-1])
		}
		prevRound = currRound
	}

	activeIDs := activateReady(slots, nil, numCourts)

	var currMatchID *string
	if len(activeIDs) > 0 {
		currMatchID = &activeIDs[0]
	}

	return &Bracket{
		Teams:          builtTeams,
		MatchSlots:     slots,
		ActiveMatchIDs: activeIDs,
		CurrentMatchID: currMatchID,
		ChampionTeamID: nil,
		Status:         "in_progress",
		NumTeams:       n,
		BracketSize:    bracketSize,
		NumRounds:      numRounds,
	}, nil
}

// AdvanceBracket records a result, propagates the winner, and activates more matches.
func AdvanceBracket(b *Bracket, matchSlotID, winnerID string, numCourts int, dbMatchID *string) (*Bracket, error) {
	slotMap := make(map[string]*MatchSlot, len(b.MatchSlots))
	for i := range b.MatchSlots {
		slotMap[b.MatchSlots[i].ID] = &b.MatchSlots[i]
	}

	slot := slotMap[matchSlotID]
	if slot == nil {
		return nil, fmt.Errorf("match slot %q not found", matchSlotID)
	}
	if !ptrEq(slot.TopTeamID, winnerID) && !ptrEq(slot.BottomTeamID, winnerID) {
		return nil, fmt.Errorf("winner_id must be one of the two teams in this slot")
	}

	slot.WinnerID = &winnerID
	slot.DBMatchID = dbMatchID
	slot.Status = "done"

	activeIDs := filterOut(b.ActiveMatchIDs, matchSlotID)

	for i := range b.MatchSlots {
		s := &b.MatchSlots[i]
		for idx, feed := range s.Feeds {
			if feed == matchSlotID {
				if idx == 0 {
					s.TopTeamID = &winnerID
				} else {
					s.BottomTeamID = &winnerID
				}
				if s.TopTeamID != nil && s.BottomTeamID != nil && s.Status == "pending" {
					s.Status = "ready"
				}
			}
		}
	}

	activeIDs = activateReady(b.MatchSlots, activeIDs, numCourts)
	b.ActiveMatchIDs = activeIDs

	var curr *string
	if len(activeIDs) > 0 {
		curr = &activeIDs[0]
	}
	b.CurrentMatchID = curr

	// Check for champion.
	finals := make([]MatchSlot, 0)
	for _, s := range b.MatchSlots {
		if s.Round == b.NumRounds {
			finals = append(finals, s)
		}
	}
	if len(finals) > 0 {
		allDone := true
		for _, f := range finals {
			if f.Status != "done" {
				allDone = false
				break
			}
		}
		if allDone {
			b.ChampionTeamID = finals[0].WinnerID
			b.Status = "complete"
		}
	}

	return b, nil
}

// RandomizeTeams shuffles players and groups them into teams of teamSize.
func RandomizeTeams(playerIDs []string, teamSize int) []TeamInput {
	ids := make([]string, len(playerIDs))
	copy(ids, playerIDs)
	rand.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })

	var teams []TeamInput
	for i := 0; i+teamSize-1 < len(ids); i += teamSize {
		teams = append(teams, TeamInput{PlayerIDs: ids[i : i+teamSize]})
	}
	return teams
}

// ---- helpers ----------------------------------------------------------------

func activateReady(slots []MatchSlot, current []string, numCourts int) []string {
	active := make([]string, len(current))
	copy(active, current)
	for i := range slots {
		if len(active) >= numCourts {
			break
		}
		if slots[i].Status == "ready" {
			slots[i].Status = "active"
			active = append(active, slots[i].ID)
		}
	}
	return active
}

func generateSeedings(size int) []int {
	if size == 1 {
		return []int{1}
	}
	top := generateSeedings(size / 2)
	result := make([]int, 0, size)
	for _, s := range top {
		result = append(result, s, size+1-s)
	}
	return result
}

func nextPowerOf2(n int) int {
	p := 1
	for p < n {
		p *= 2
	}
	return p
}

// log2 returns log2 of a power-of-2 integer.
func log2(n int) int {
	count := 0
	for n > 1 {
		n >>= 1
		count++
	}
	return count
}

func ptrEq(p *string, s string) bool {
	return p != nil && *p == s
}

func filterOut(ids []string, exclude string) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != exclude {
			out = append(out, id)
		}
	}
	return out
}

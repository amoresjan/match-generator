package generator

import (
	"github.com/amoresjan/match-generator/backend/internal/store"
)

// getInt safely reads from a nested map, returning 0 for missing keys.
func getInt(m map[string]map[string]int, a, b string) int {
	if inner, ok := m[a]; ok {
		return inner[b]
	}
	return 0
}

func getIntFlat(m map[string]int, k string) int {
	return m[k]
}

// BuildHistory constructs the History struct from stored PlayerRoundHistory rows.
func BuildHistory(rows []store.HistoryRow) History {
	h := History{
		Partner:    make(map[string]map[string]int),
		Opponent:   make(map[string]map[string]int),
		LastOppRnd: make(map[string]map[string]int),
		Wait:       make(map[string]int),
		LastSatOut: make(map[string]int),
		LastPlayed: make(map[string]int),
	}

	for _, row := range rows {
		pid := row.PlayerID.String()
		if row.SatOut {
			h.Wait[pid]++
			if row.RoundNumber > h.LastSatOut[pid] {
				h.LastSatOut[pid] = row.RoundNumber
			}
			continue
		}

		if row.RoundNumber > h.LastPlayed[pid] {
			h.LastPlayed[pid] = row.RoundNumber
		}
		for _, partner := range row.PartnerIDs {
			if h.Partner[pid] == nil {
				h.Partner[pid] = make(map[string]int)
			}
			h.Partner[pid][partner]++
		}
		for _, opp := range row.OpponentIDs {
			if h.Opponent[pid] == nil {
				h.Opponent[pid] = make(map[string]int)
			}
			h.Opponent[pid][opp]++

			if h.LastOppRnd[pid] == nil {
				h.LastOppRnd[pid] = make(map[string]int)
			}
			if row.RoundNumber > h.LastOppRnd[pid][opp] {
				h.LastOppRnd[pid][opp] = row.RoundNumber
			}
		}
	}
	return h
}

// SimulateHistoryUpdate returns a new History as if the generated round had been committed.
// Used by PreviewRounds to chain previews without touching the database.
func SimulateHistoryUpdate(h History, gen GeneratedRound) History {
	next := copyHistory(h)
	rn := gen.RoundNumber

	for _, court := range gen.Courts {
		t1, t2 := court.Team1, court.Team2
		updateTeam(next, t1, t2, rn)
		updateTeam(next, t2, t1, rn)
	}
	for _, pid := range gen.ByePlayers {
		next.Wait[pid]++
		if rn > next.LastSatOut[pid] {
			next.LastSatOut[pid] = rn
		}
	}
	for _, court := range gen.Courts {
		for _, pid := range append(court.Team1, court.Team2...) {
			if rn > next.LastPlayed[pid] {
				next.LastPlayed[pid] = rn
			}
		}
	}
	return next
}

func updateTeam(h History, myTeam, oppTeam []string, rn int) {
	for _, pid := range myTeam {
		for _, partner := range myTeam {
			if partner == pid {
				continue
			}
			if h.Partner[pid] == nil {
				h.Partner[pid] = make(map[string]int)
			}
			h.Partner[pid][partner]++
		}
		for _, opp := range oppTeam {
			if h.Opponent[pid] == nil {
				h.Opponent[pid] = make(map[string]int)
			}
			h.Opponent[pid][opp]++

			if h.LastOppRnd[pid] == nil {
				h.LastOppRnd[pid] = make(map[string]int)
			}
			if rn > h.LastOppRnd[pid][opp] {
				h.LastOppRnd[pid][opp] = rn
			}
		}
	}
}

func copyHistory(h History) History {
	c := History{
		Partner:    make(map[string]map[string]int, len(h.Partner)),
		Opponent:   make(map[string]map[string]int, len(h.Opponent)),
		LastOppRnd: make(map[string]map[string]int, len(h.LastOppRnd)),
		Wait:       make(map[string]int, len(h.Wait)),
		LastSatOut: make(map[string]int, len(h.LastSatOut)),
		LastPlayed: make(map[string]int, len(h.LastPlayed)),
	}
	for k, v := range h.Partner {
		m := make(map[string]int, len(v))
		for kk, vv := range v {
			m[kk] = vv
		}
		c.Partner[k] = m
	}
	for k, v := range h.Opponent {
		m := make(map[string]int, len(v))
		for kk, vv := range v {
			m[kk] = vv
		}
		c.Opponent[k] = m
	}
	for k, v := range h.LastOppRnd {
		m := make(map[string]int, len(v))
		for kk, vv := range v {
			m[kk] = vv
		}
		c.LastOppRnd[k] = m
	}
	for k, v := range h.Wait {
		c.Wait[k] = v
	}
	for k, v := range h.LastSatOut {
		c.LastSatOut[k] = v
	}
	for k, v := range h.LastPlayed {
		c.LastPlayed[k] = v
	}
	return c
}

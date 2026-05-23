package generator

import (
	"math"
	"math/rand"
	"sort"
)

// ---- partner grouping -------------------------------------------------------

func groupPermanentPartners(players []historyPlayer) (pairs [][]string, singles []string) {
	seen := make(map[string]bool)
	playerByID := make(map[string]historyPlayer, len(players))
	for _, p := range players {
		playerByID[p.id] = p
	}

	for _, p := range players {
		if seen[p.id] {
			continue
		}
		if p.permanentPartnerID != nil {
			pid2 := *p.permanentPartnerID
			if _, ok := playerByID[pid2]; ok {
				pairs = append(pairs, []string{p.id, pid2})
				seen[p.id] = true
				seen[pid2] = true
				continue
			}
		}
		singles = append(singles, p.id)
	}
	return
}

// ---- sit-out (bye) selection for 2v2 ----------------------------------------

func pairWaitScore(pair []string, h History) float64 {
	total := 0.0
	for _, p := range pair {
		total += float64(h.Wait[p])
	}
	return total / float64(len(pair))
}

type unit struct {
	ids        []string
	cost       int // 1 for single, 2 for pair
	wait       float64
	lastPlayed int
	jitter     float64
}

// selectByes2v2 picks who sits out and returns active pairs, active singles, and byes.
func selectByes2v2(players []historyPlayer, numCourts int, h History, rng *rand.Rand) activeSet {
	pairs, singles := groupPermanentPartners(players)
	total := len(players)
	playersNeeded := numCourts * 4
	if playersNeeded > total {
		playersNeeded = total - (total % 4)
	}
	remainingByes := total - playersNeeded

	units := make([]unit, 0, len(pairs)+len(singles))
	for _, pair := range pairs {
		units = append(units, unit{
			ids:        pair,
			cost:       2,
			wait:       pairWaitScore(pair, h),
			lastPlayed: maxLastPlayed(pair, h),
			jitter:     rng.Float64(),
		})
	}
	for _, s := range singles {
		units = append(units, unit{
			ids:        []string{s},
			cost:       1,
			wait:       float64(h.Wait[s]),
			lastPlayed: h.LastPlayed[s],
			jitter:     rng.Float64(),
		})
	}

	sort.Slice(units, func(i, j int) bool {
		if units[i].wait != units[j].wait {
			return units[i].wait < units[j].wait
		}
		return units[i].jitter < units[j].jitter
	})

	byeSet := make(map[string]bool)
	var byes []string
	for _, u := range units {
		if remainingByes <= 0 {
			break
		}
		if u.cost > remainingByes {
			continue
		}
		byes = append(byes, u.ids...)
		for _, id := range u.ids {
			byeSet[id] = true
		}
		remainingByes -= u.cost
	}

	var activePairs [][]string
	for _, pair := range pairs {
		if !byeSet[pair[0]] {
			activePairs = append(activePairs, pair)
		}
	}
	var activeSingles []string
	for _, s := range singles {
		if !byeSet[s] {
			activeSingles = append(activeSingles, s)
		}
	}

	return activeSet{pairs: activePairs, singles: activeSingles, byes: byes}
}

func maxLastPlayed(ids []string, h History) int {
	m := 0
	for _, id := range ids {
		if v := h.LastPlayed[id]; v > m {
			m = v
		}
	}
	return m
}

// ---- pairing enumeration ----------------------------------------------------

// enumeratePairings returns all perfect pairings of items as pairs of indices.
// items must have even length.
func enumeratePairings(items []int) [][][2]int {
	if len(items) == 0 {
		return [][][2]int{{}}
	}
	first := items[0]
	rest := items[1:]
	var result [][][2]int
	for i, partner := range rest {
		remaining := make([]int, 0, len(rest)-1)
		remaining = append(remaining, rest[:i]...)
		remaining = append(remaining, rest[i+1:]...)
		for _, sub := range enumeratePairings(remaining) {
			pairing := make([][2]int, 0, 1+len(sub))
			pairing = append(pairing, [2]int{first, partner})
			pairing = append(pairing, sub...)
			result = append(result, pairing)
		}
	}
	return result
}

// pairSingles matches solo players by minimising partner-repeat cost.
func pairSingles(singles []string, h History, rng *rand.Rand) [][]string {
	if len(singles) < 2 {
		result := make([][]string, len(singles))
		for i, s := range singles {
			result[i] = []string{s}
		}
		return result
	}

	shuffled := make([]string, len(singles))
	copy(shuffled, singles)
	rng.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })

	if len(shuffled) <= pairingEnumLimit {
		indices := make([]int, len(shuffled))
		for i := range indices {
			indices[i] = i
		}
		bestCost := math.Inf(1)
		var best [][]string
		for _, pairing := range enumeratePairings(indices) {
			cost := 0.0
			for _, p := range pairing {
				cost += teamPairCost([]string{shuffled[p[0]], shuffled[p[1]]}, h)
			}
			if cost < bestCost {
				bestCost = cost
				best = make([][]string, len(pairing))
				for k, p := range pairing {
					best[k] = []string{shuffled[p[0]], shuffled[p[1]]}
				}
			}
		}
		return best
	}

	// Greedy fallback for large groups.
	type candidate struct {
		i, j int
		cost float64
	}
	candidates := make([]candidate, 0, len(shuffled)*(len(shuffled)-1)/2)
	for i := 0; i < len(shuffled); i++ {
		for j := i + 1; j < len(shuffled); j++ {
			candidates = append(candidates, candidate{
				i:    i,
				j:    j,
				cost: teamPairCost([]string{shuffled[i], shuffled[j]}, h),
			})
		}
	}
	sort.Slice(candidates, func(a, b int) bool {
		return candidates[a].cost < candidates[b].cost
	})

	paired := make(map[int]bool)
	var result [][]string
	for _, c := range candidates {
		if !paired[c.i] && !paired[c.j] {
			result = append(result, []string{shuffled[c.i], shuffled[c.j]})
			paired[c.i] = true
			paired[c.j] = true
		}
	}
	return result
}

// ---- court assignment -------------------------------------------------------

// assignCourts picks the best matchup arrangement across courts.
// pool is a list of teams (each team = []string of player IDs).
func assignCourts(pool [][]string, numCourts int, h History, roundNumber int, rng *rand.Rand) []CourtAssignment {
	if len(pool) < 2 {
		return nil
	}
	rng.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })

	if len(pool) <= pairingEnumLimit {
		indices := make([]int, len(pool))
		for i := range indices {
			indices[i] = i
		}
		bestCost := math.Inf(1)
		var bestPairing [][2]int
		for _, pairing := range enumeratePairings(indices) {
			cost := 0.0
			for _, p := range pairing {
				cost += matchCost(pool[p[0]], pool[p[1]], h, roundNumber)
			}
			if cost < bestCost {
				bestCost = cost
				bestPairing = pairing
			}
		}
		courts := make([]CourtAssignment, 0, len(bestPairing))
		for i, p := range bestPairing {
			courts = append(courts, CourtAssignment{
				Court: i + 1,
				Team1: pool[p[0]],
				Team2: pool[p[1]],
			})
		}
		return courts
	}

	// Greedy fallback.
	type candidate struct {
		i, j int
		cost float64
	}
	candidates := make([]candidate, 0, len(pool)*(len(pool)-1)/2)
	for i := 0; i < len(pool); i++ {
		for j := i + 1; j < len(pool); j++ {
			candidates = append(candidates, candidate{
				i:    i,
				j:    j,
				cost: matchCost(pool[i], pool[j], h, roundNumber),
			})
		}
	}
	sort.Slice(candidates, func(a, b int) bool {
		return candidates[a].cost < candidates[b].cost
	})

	used := make(map[int]bool)
	var courts []CourtAssignment
	for _, c := range candidates {
		if len(courts) >= numCourts {
			break
		}
		if !used[c.i] && !used[c.j] {
			courts = append(courts, CourtAssignment{
				Court: len(courts) + 1,
				Team1: pool[c.i],
				Team2: pool[c.j],
			})
			used[c.i] = true
			used[c.j] = true
		}
	}
	return courts
}

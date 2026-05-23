package generator

// Cost weights — must match the Python values exactly so algorithm behaviour is identical.
const (
	partnerRepeatW  = 5.0
	opponentRepeatW = 2.0
	waitAdvantageW  = 3.0
	byePenaltyW     = 1.0
	recencyW        = 3.0

	pairingEnumLimit = 12 // above this, use greedy O(n²) instead of O(n!!) enumeration
)

// teamPairCost penalises players being paired on the same team again.
func teamPairCost(team []string, h History) float64 {
	cost := 0.0
	for i := 0; i < len(team); i++ {
		for j := i + 1; j < len(team); j++ {
			cost += partnerRepeatW * float64(getInt(h.Partner, team[i], team[j]))
		}
	}
	return cost
}

// matchupCost penalises two teams meeting again, boosted by recency.
func matchupCost(t1, t2 []string, h History, roundNumber int) float64 {
	cost := 0.0
	for _, a := range t1 {
		for _, b := range t2 {
			cost += opponentRepeatW * float64(getInt(h.Opponent, a, b))
			last := getInt(h.LastOppRnd, a, b)
			if last > 0 && roundNumber > last {
				cost += recencyW / float64(roundNumber-last)
			}
		}
	}
	return cost
}

// waitBonus is a negative cost rewarding long-waiting players getting a game.
func waitBonus(players []string, h History) float64 {
	bonus := 0.0
	for _, p := range players {
		bonus -= waitAdvantageW * float64(h.Wait[p])
	}
	return bonus
}

// matchCost is the total cost for placing t1 against t2.
func matchCost(t1, t2 []string, h History, roundNumber int) float64 {
	combined := make([]string, 0, len(t1)+len(t2))
	combined = append(combined, t1...)
	combined = append(combined, t2...)
	return teamPairCost(t1, h) +
		teamPairCost(t2, h) +
		matchupCost(t1, t2, h, roundNumber) +
		waitBonus(combined, h)
}

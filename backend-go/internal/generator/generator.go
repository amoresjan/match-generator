package generator

import (
	"context"
	"fmt"
	"math/rand"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/amoresjan/match-generator/backend/internal/store"
)

// GenerateRound computes the next round without writing anything to the database.
func GenerateRound(session store.Session, players []store.PlayerWithPartner, hist []store.HistoryRow, wins map[string]int) (GeneratedRound, error) {
	active := filterActive(players)
	if len(active) == 0 {
		return GeneratedRound{}, fmt.Errorf("session has no active players")
	}

	h := BuildHistory(hist)
	nextNum := nextRoundNumber(hist)
	rng := newSeededRNG(session.ID, nextNum)

	return dispatch(session, active, h, wins, nextNum, rng)
}

// PreviewRounds generates count future rounds without any DB writes.
func PreviewRounds(session store.Session, players []store.PlayerWithPartner, hist []store.HistoryRow, wins map[string]int, count int) ([]GeneratedRound, error) {
	active := filterActive(players)
	if len(active) == 0 {
		return nil, fmt.Errorf("session has no active players")
	}

	h := BuildHistory(hist)
	nextNum := nextRoundNumber(hist)
	results := make([]GeneratedRound, 0, count)

	for i := 0; i < count; i++ {
		rn := nextNum + i
		rng := newSeededRNG(session.ID, rn)
		gen, err := dispatch(session, active, h, wins, rn, rng)
		if err != nil {
			return nil, err
		}
		results = append(results, gen)
		h = SimulateHistoryUpdate(h, gen)
	}
	return results, nil
}

// CommitRound persists a generated round inside a transaction. It uses
// SELECT FOR UPDATE on the session row to prevent duplicate round numbers
// under concurrent /generate calls.
func CommitRound(ctx context.Context, s *store.Store, sessionID uuid.UUID, generated GeneratedRound) (store.Round, error) {
	var committed store.Round

	err := s.WithTx(ctx, func(q *store.Queries) error {
		// Lock session row to serialise concurrent generate calls.
		if _, err := q.GetSessionForUpdate(ctx, sessionID); err != nil {
			return err
		}

		// Re-derive round number inside the lock to prevent races.
		maxNum, err := q.GetMaxRoundNumber(ctx, sessionID)
		if err != nil {
			return err
		}
		roundNumber := maxNum + 1
		roundID := uuid.New()

		rnd, err := q.CreateRound(ctx, roundID, sessionID, roundNumber)
		if err != nil {
			return err
		}
		committed = rnd

		for _, court := range generated.Courts {
			if _, err := q.CreateMatch(ctx, store.CreateMatchParams{
				ID:           uuid.New(),
				RoundID:      roundID,
				CourtNumber:  court.Court,
				Team1Players: court.Team1,
				Team2Players: court.Team2,
			}); err != nil {
				return err
			}
		}

		histRows := make([]store.HistoryInput, 0)
		waitDeltas := make(map[uuid.UUID]int)

		for _, court := range generated.Courts {
			t1, t2 := court.Team1, court.Team2
			for _, pid := range t1 {
				uid, _ := uuid.Parse(pid)
				histRows = append(histRows, store.HistoryInput{
					PlayerID: uid, RoundID: roundID,
					PartnerIDs: withoutSelf(t1, pid), OpponentIDs: t2,
				})
			}
			for _, pid := range t2 {
				uid, _ := uuid.Parse(pid)
				histRows = append(histRows, store.HistoryInput{
					PlayerID: uid, RoundID: roundID,
					PartnerIDs: withoutSelf(t2, pid), OpponentIDs: t1,
				})
			}
		}
		for _, pid := range generated.ByePlayers {
			uid, _ := uuid.Parse(pid)
			histRows = append(histRows, store.HistoryInput{PlayerID: uid, RoundID: roundID, SatOut: true})
			waitDeltas[uid]++
		}

		if err := q.BulkCreateHistory(ctx, histRows); err != nil {
			return err
		}
		if err := q.BulkIncrementWaitRounds(ctx, waitDeltas); err != nil {
			return err
		}
		return q.SetLastRoundAt(ctx, sessionID, time.Now())
	})

	return committed, err
}

// ReconcileRoundHistory rewrites PlayerRoundHistory from current Match rows after
// a manual override. Also adjusts total_wait_rounds when sit-out status changes.
func ReconcileRoundHistory(ctx context.Context, q *store.Queries, rnd store.Round, sessionID uuid.UUID) error {
	matches, err := q.GetMatchesForRound(ctx, rnd.ID)
	if err != nil {
		return err
	}

	playing := make(map[string]bool)
	for _, m := range matches {
		for _, pid := range m.Team1Players {
			playing[pid] = true
		}
		for _, pid := range m.Team2Players {
			playing[pid] = true
		}
	}

	players, err := q.GetActivePlayers(ctx, sessionID)
	if err != nil {
		return err
	}
	playerMap := make(map[string]store.PlayerWithPartner, len(players))
	for _, p := range players {
		playerMap[p.ID.String()] = p
	}

	oldHistory, err := q.GetRoundHistory(ctx, rnd.ID)
	if err != nil {
		return err
	}
	oldSatOut := make(map[string]bool, len(oldHistory))
	for _, h := range oldHistory {
		oldSatOut[h.PlayerID.String()] = h.SatOut
	}

	if err := q.DeleteRoundHistory(ctx, rnd.ID); err != nil {
		return err
	}

	newRows := make([]store.HistoryInput, 0, len(players))
	seen := make(map[string]bool)
	for _, m := range matches {
		t1, t2 := m.Team1Players, m.Team2Players
		for _, pid := range t1 {
			if _, ok := playerMap[pid]; ok && !seen[pid] {
				seen[pid] = true
				uid, _ := uuid.Parse(pid)
				newRows = append(newRows, store.HistoryInput{
					PlayerID: uid, RoundID: rnd.ID,
					PartnerIDs: withoutSelf(t1, pid), OpponentIDs: t2,
				})
			}
		}
		for _, pid := range t2 {
			if _, ok := playerMap[pid]; ok && !seen[pid] {
				seen[pid] = true
				uid, _ := uuid.Parse(pid)
				newRows = append(newRows, store.HistoryInput{
					PlayerID: uid, RoundID: rnd.ID,
					PartnerIDs: withoutSelf(t2, pid), OpponentIDs: t1,
				})
			}
		}
	}
	for pid := range playerMap {
		if !seen[pid] {
			uid, _ := uuid.Parse(pid)
			newRows = append(newRows, store.HistoryInput{PlayerID: uid, RoundID: rnd.ID, SatOut: true})
		}
	}

	if err := q.BulkCreateHistory(ctx, newRows); err != nil {
		return err
	}

	deltas := make(map[uuid.UUID]int)
	for pid := range playerMap {
		wasOut := oldSatOut[pid]
		isOut := !playing[pid]
		if wasOut == isOut {
			continue
		}
		uid, _ := uuid.Parse(pid)
		if isOut {
			deltas[uid] = 1
		} else {
			deltas[uid] = -1
		}
	}
	return q.BulkIncrementWaitRounds(ctx, deltas)
}

// ---- mode dispatch ----------------------------------------------------------

func dispatch(session store.Session, active []historyPlayer, h History, wins map[string]int, roundNum int, rng *rand.Rand) (GeneratedRound, error) {
	switch session.MatchType {
	case "1v1":
		if session.GenerationMode == "competitive" {
			return generate1v1Competitive(active, session.NumCourts, h, wins, roundNum, rng)
		}
		return generate1v1(active, session.NumCourts, h, roundNum, rng)
	default: // "2v2"
		if session.GenerationMode == "competitive" {
			return generate2v2Competitive(active, session.NumCourts, h, wins, roundNum, rng)
		}
		return generate2v2(active, session.NumCourts, h, roundNum, rng)
	}
}

// ---- 2v2 --------------------------------------------------------------------

func generate2v2(players []historyPlayer, numCourts int, h History, roundNum int, rng *rand.Rand) (GeneratedRound, error) {
	as := selectByes2v2(players, numCourts, h, rng)
	pool := append(as.pairs, pairSingles(as.singles, h, rng)...)
	courts := assignCourts(pool, numCourts, h, roundNum, rng)
	g := GeneratedRound{RoundNumber: roundNum, Courts: courts, ByePlayers: as.byes}; g.Normalize(); return g, nil
}

func generate2v2Competitive(players []historyPlayer, numCourts int, h History, wins map[string]int, roundNum int, rng *rand.Rand) (GeneratedRound, error) {
	as := selectByes2v2(players, numCourts, h, rng)
	pool := append(as.pairs, pairSingles(as.singles, h, rng)...)

	type ranked struct {
		team   []string
		score  float64
		jitter float64
	}
	r := make([]ranked, len(pool))
	for i, team := range pool {
		avg := 0.0
		for _, pid := range team {
			avg += float64(wins[pid])
		}
		if len(team) > 0 {
			avg /= float64(len(team))
		}
		r[i] = ranked{team: team, score: avg, jitter: rng.Float64()}
	}
	sort.Slice(r, func(a, b int) bool {
		if r[a].score != r[b].score {
			return r[a].score > r[b].score
		}
		return r[a].jitter < r[b].jitter
	})

	byes := as.byes
	var courts []CourtAssignment
	for i := 0; i+1 < len(r) && len(courts) < numCourts; i += 2 {
		courts = append(courts, CourtAssignment{Court: len(courts) + 1, Team1: r[i].team, Team2: r[i+1].team})
	}
	for i := len(courts) * 2; i < len(r); i++ {
		byes = append(byes, r[i].team...)
	}
	g := GeneratedRound{RoundNumber: roundNum, Courts: courts, ByePlayers: byes}; g.Normalize(); return g, nil
}

// ---- 1v1 --------------------------------------------------------------------

func generate1v1(players []historyPlayer, numCourts int, h History, roundNum int, rng *rand.Rand) (GeneratedRound, error) {
	allIDs := playerIDs(players)
	total := len(allIDs)
	playersNeeded := numCourts * 2
	if playersNeeded > total {
		playersNeeded = total - (total % 2)
	}
	byeCount := total - playersNeeded

	jitter := makeJitter(allIDs, rng)
	sorted := sortByWait(allIDs, h, jitter)
	byes, active := sorted[:byeCount], sorted[byeCount:]

	rng.Shuffle(len(active), func(i, j int) { active[i], active[j] = active[j], active[i] })
	pool := singletonPool(active)
	courts := assignCourts(pool, numCourts, h, roundNum, rng)

	g := GeneratedRound{RoundNumber: roundNum, Courts: courts, ByePlayers: byes}; g.Normalize(); return g, nil
}

func generate1v1Competitive(players []historyPlayer, numCourts int, h History, wins map[string]int, roundNum int, rng *rand.Rand) (GeneratedRound, error) {
	allIDs := playerIDs(players)
	total := len(allIDs)
	playersNeeded := numCourts * 2
	if playersNeeded > total {
		playersNeeded = total - (total % 2)
	}
	byeCount := total - playersNeeded

	jitter := makeJitter(allIDs, rng)
	sorted := sortByWaitAndLastSatOut(allIDs, h, jitter)
	byes := make([]string, byeCount)
	copy(byes, sorted[:byeCount])
	active := sorted[byeCount:]

	sort.Slice(active, func(i, j int) bool {
		if wins[active[i]] != wins[active[j]] {
			return wins[active[i]] > wins[active[j]]
		}
		return rng.Float64() < 0.5
	})

	var courts []CourtAssignment
	for i := 0; i+1 < len(active) && len(courts) < numCourts; i += 2 {
		courts = append(courts, CourtAssignment{Court: len(courts) + 1, Team1: []string{active[i]}, Team2: []string{active[i+1]}})
	}
	for i := len(courts) * 2; i < len(active); i++ {
		byes = append(byes, active[i])
	}
	g := GeneratedRound{RoundNumber: roundNum, Courts: courts, ByePlayers: byes}; g.Normalize(); return g, nil
}

// ---- helpers ----------------------------------------------------------------

func filterActive(players []store.PlayerWithPartner) []historyPlayer {
	out := make([]historyPlayer, 0, len(players))
	for _, p := range players {
		if !p.SitOut {
			out = append(out, storePlayerToHistoryPlayer(p))
		}
	}
	return out
}

func nextRoundNumber(rows []store.HistoryRow) int {
	max := 0
	for _, r := range rows {
		if r.RoundNumber > max {
			max = r.RoundNumber
		}
	}
	return max + 1
}

func withoutSelf(ids []string, self string) []string {
	out := make([]string, 0, len(ids)-1)
	for _, id := range ids {
		if id != self {
			out = append(out, id)
		}
	}
	return out
}

func playerIDs(players []historyPlayer) []string {
	ids := make([]string, len(players))
	for i, p := range players {
		ids[i] = p.id
	}
	return ids
}

func makeJitter(ids []string, rng *rand.Rand) map[string]float64 {
	j := make(map[string]float64, len(ids))
	for _, id := range ids {
		j[id] = rng.Float64()
	}
	return j
}

func sortByWait(ids []string, h History, jitter map[string]float64) []string {
	out := make([]string, len(ids))
	copy(out, ids)
	sort.Slice(out, func(i, j int) bool {
		wi, wj := float64(h.Wait[out[i]]), float64(h.Wait[out[j]])
		if wi != wj {
			return wi < wj
		}
		return jitter[out[i]] < jitter[out[j]]
	})
	return out
}

func sortByWaitAndLastSatOut(ids []string, h History, jitter map[string]float64) []string {
	out := make([]string, len(ids))
	copy(out, ids)
	sort.Slice(out, func(i, j int) bool {
		ai, aj := h.Wait[out[i]], h.Wait[out[j]]
		if ai != aj {
			return ai < aj
		}
		li, lj := h.LastSatOut[out[i]], h.LastSatOut[out[j]]
		if li != lj {
			return li < lj
		}
		return jitter[out[i]] < jitter[out[j]]
	})
	return out
}

func singletonPool(ids []string) [][]string {
	pool := make([][]string, len(ids))
	for i, id := range ids {
		pool[i] = []string{id}
	}
	return pool
}

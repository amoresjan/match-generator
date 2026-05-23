package generator_test

import (
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/amoresjan/match-generator/backend/internal/generator"
	"github.com/amoresjan/match-generator/backend/internal/store"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func makeSession(matchType string, numCourts int, mode string) store.Session {
	return store.Session{
		ID:             uuid.New(),
		MatchType:      matchType,
		NumCourts:      numCourts,
		GenerationMode: mode,
	}
}

func makePlayers(n int) []store.PlayerWithPartner {
	ps := make([]store.PlayerWithPartner, n)
	for i := range ps {
		ps[i] = store.PlayerWithPartner{Player: store.Player{ID: uuid.New()}}
	}
	return ps
}

// makeNPartnerPairs creates n permanent-partner pairs (2n players total).
func makeNPartnerPairs(n int) ([]store.PlayerWithPartner, [][2]string) {
	ps := make([]store.PlayerWithPartner, 0, n*2)
	pairs := make([][2]string, 0, n)
	for range n {
		id1, id2 := uuid.New(), uuid.New()
		id1ptr, id2ptr := new(uuid.UUID), new(uuid.UUID)
		*id1ptr, *id2ptr = id1, id2
		p1 := store.PlayerWithPartner{Player: store.Player{ID: id1, PermanentPartnerID: id2ptr}}
		p2 := store.PlayerWithPartner{Player: store.Player{ID: id2, PermanentPartnerID: id1ptr}}
		ps = append(ps, p1, p2)
		pairs = append(pairs, [2]string{id1.String(), id2.String()})
	}
	return ps, pairs
}

func activeSet(gen generator.GeneratedRound) map[string]bool {
	s := make(map[string]bool)
	for _, c := range gen.Courts {
		for _, p := range c.Team1 {
			s[p] = true
		}
		for _, p := range c.Team2 {
			s[p] = true
		}
	}
	return s
}

func byeSet(gen generator.GeneratedRound) map[string]bool {
	s := make(map[string]bool)
	for _, p := range gen.ByePlayers {
		s[p] = true
	}
	return s
}

func allPIDs(gen generator.GeneratedRound) map[string]bool {
	s := activeSet(gen)
	for p := range byeSet(gen) {
		s[p] = true
	}
	return s
}

func mapsEqual(a, b map[string]bool) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if !b[k] {
			return false
		}
	}
	return true
}

func courtKey(c generator.CourtAssignment) string {
	t1 := append([]string(nil), c.Team1...)
	t2 := append([]string(nil), c.Team2...)
	sort.Strings(t1)
	sort.Strings(t2)
	s1, s2 := strings.Join(t1, ","), strings.Join(t2, ",")
	if s1 > s2 {
		s1, s2 = s2, s1
	}
	return s1 + "|" + s2
}

func courtsMatch(a, b []generator.CourtAssignment) bool {
	if len(a) != len(b) {
		return false
	}
	keys := make(map[string]int)
	for _, c := range a {
		keys[courtKey(c)]++
	}
	for _, c := range b {
		k := courtKey(c)
		keys[k]--
		if keys[k] < 0 {
			return false
		}
	}
	return true
}

func roundsMatch(a, b generator.GeneratedRound) bool {
	return mapsEqual(activeSet(a), activeSet(b)) &&
		mapsEqual(byeSet(a), byeSet(b)) &&
		courtsMatch(a.Courts, b.Courts)
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

// simulateCommit appends HistoryRow entries for a generated round without touching the DB.
// This mirrors what CommitRound writes so that GenerateRound and PreviewRounds see
// the same history state at each step of a multi-round scenario.
func simulateCommit(hist []store.HistoryRow, gen generator.GeneratedRound) []store.HistoryRow {
	rn := gen.RoundNumber
	for _, court := range gen.Courts {
		t1, t2 := court.Team1, court.Team2
		for _, pid := range t1 {
			uid, _ := uuid.Parse(pid)
			hist = append(hist, store.HistoryRow{
				PlayerID:    uid,
				PartnerIDs:  withoutSelf(t1, pid),
				OpponentIDs: t2,
				RoundNumber: rn,
			})
		}
		for _, pid := range t2 {
			uid, _ := uuid.Parse(pid)
			hist = append(hist, store.HistoryRow{
				PlayerID:    uid,
				PartnerIDs:  withoutSelf(t2, pid),
				OpponentIDs: t1,
				RoundNumber: rn,
			})
		}
	}
	for _, pid := range gen.ByePlayers {
		uid, _ := uuid.Parse(pid)
		hist = append(hist, store.HistoryRow{PlayerID: uid, SatOut: true, RoundNumber: rn})
	}
	return hist
}

func initSitOut(players []store.PlayerWithPartner) map[string]int {
	m := make(map[string]int, len(players))
	for _, p := range players {
		m[p.ID.String()] = 0
	}
	return m
}

func maxInt(m map[string]int) int {
	var max int
	first := true
	for _, v := range m {
		if first || v > max {
			max = v
			first = false
		}
	}
	return max
}

func minInt(m map[string]int) int {
	var min int
	first := true
	for _, v := range m {
		if first || v < min {
			min = v
			first = false
		}
	}
	return min
}

func contains(slice []string, val string) bool {
	for _, s := range slice {
		if s == val {
			return true
		}
	}
	return false
}

// playerNames builds a UUID→label map (P01, P02 …) ordered by the players slice.
func playerNames(players []store.PlayerWithPartner) map[string]string {
	m := make(map[string]string, len(players))
	for i, p := range players {
		m[p.ID.String()] = fmt.Sprintf("P%02d", i+1)
	}
	return m
}

// fmtTeam returns "[P01 & P02]" (2v2) or "[P01]" (1v1).
func fmtTeam(pids []string, names map[string]string) string {
	parts := make([]string, len(pids))
	for i, p := range pids {
		parts[i] = names[p]
	}
	return "[" + strings.Join(parts, " & ") + "]"
}

// logRound emits a one-line round summary via t.Log (visible with go test -v).
func logRound(t *testing.T, rn, slot, previewSize int, gen generator.GeneratedRound, match bool, names map[string]string) {
	t.Helper()
	courtParts := make([]string, len(gen.Courts))
	for i, c := range gen.Courts {
		courtParts[i] = fmtTeam(c.Team1, names) + " vs " + fmtTeam(c.Team2, names)
	}
	byeNames := make([]string, len(gen.ByePlayers))
	for i, p := range gen.ByePlayers {
		byeNames[i] = names[p]
	}
	sort.Strings(byeNames)
	bye := "-"
	if len(byeNames) > 0 {
		bye = strings.Join(byeNames, ", ")
	}
	status := "ok"
	if !match {
		status = "MISMATCH"
	}
	t.Logf("  Round %2d [slot %d/%d]  %s  |  bye: %s  |  %s",
		rn, slot+1, previewSize, strings.Join(courtParts, "  "), bye, status)
}

// maxConsecutiveSitOuts computes the worst-case consecutive sit-out streak across all players.
func maxConsecutiveSitOuts(playHistory map[string][]bool) int {
	worst := 0
	for _, history := range playHistory {
		cur := 0
		for _, played := range history {
			if !played {
				cur++
				if cur > worst {
					worst = cur
				}
			} else {
				cur = 0
			}
		}
	}
	return worst
}

// runFairScenario is the shared loop for fair-mode accuracy + sit-out evenness tests.
// Returns the number of preview mismatches (callers assert == 0).
func runFairScenario(t *testing.T, sess store.Session, players []store.PlayerWithPartner, numRounds int) (mismatches int, sitOut map[string]int) {
	t.Helper()
	const previewSize = 5

	names := playerNames(players)
	sitOut = initSitOut(players)
	playHistory := make(map[string][]bool, len(players))
	var hist []store.HistoryRow
	var preview []generator.GeneratedRound
	blockStart := 1

	for rn := 1; rn <= numRounds; rn++ {
		if (rn-1)%previewSize == 0 {
			var err error
			preview, err = generator.PreviewRounds(sess, players, hist, nil, previewSize)
			require.NoError(t, err)
			blockStart = rn
		}

		slot := rn - blockStart
		gen, err := generator.GenerateRound(sess, players, hist, nil)
		require.NoError(t, err)

		matched := roundsMatch(gen, preview[slot])
		if !matched {
			mismatches++
		}
		logRound(t, rn, slot, previewSize, gen, matched, names)

		active := activeSet(gen)
		hist = simulateCommit(hist, gen)
		for _, p := range players {
			pid := p.ID.String()
			played := active[pid]
			playHistory[pid] = append(playHistory[pid], played)
			if !played {
				sitOut[pid]++
			}
		}
	}

	maxStreak := maxConsecutiveSitOuts(playHistory)
	t.Logf("  Preview accuracy: %d/%d", numRounds-mismatches, numRounds)
	t.Logf("  Sit-out range: %d–%d", minInt(sitOut), maxInt(sitOut))
	t.Logf("  Max consecutive sit-outs: %d", maxStreak)

	return mismatches, sitOut
}

func assertPartnersNeverSplit(t *testing.T, gen generator.GeneratedRound, pairs [][2]string, rn int) {
	t.Helper()
	for _, pair := range pairs {
		p1, p2 := pair[0], pair[1]
		for _, court := range gen.Courts {
			p1InT1 := contains(court.Team1, p1)
			p1InT2 := contains(court.Team2, p1)
			p2InT1 := contains(court.Team1, p2)
			p2InT2 := contains(court.Team2, p2)
			p1Here := p1InT1 || p1InT2
			p2Here := p2InT1 || p2InT2
			if p1Here || p2Here {
				assert.True(t, p1Here && p2Here,
					"round %d: one partner is on court but not the other", rn)
				assert.True(t, (p1InT1 && p2InT1) || (p1InT2 && p2InT2),
					"round %d: partners are on opposite teams", rn)
			}
		}
	}
}

func assertAtomicSitOut(t *testing.T, gen generator.GeneratedRound, pairs [][2]string, rn int) {
	t.Helper()
	byes := byeSet(gen)
	for _, pair := range pairs {
		assert.Equal(t, byes[pair[0]], byes[pair[1]],
			"round %d: partners must sit out together", rn)
	}
}

// ── fair rotation tests ───────────────────────────────────────────────────────

func TestFair1v1(t *testing.T) {
	scenarios := []struct {
		name      string
		numP      int
		numCourts int
	}{
		{"6p_1c", 6, 1},
		{"8p_2c", 8, 2},
		{"10p_3c", 10, 3},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			sess := makeSession("1v1", sc.numCourts, "fair")
			players := makePlayers(sc.numP)

			mismatches, sitOut := runFairScenario(t, sess, players, 15)

			assert.Equal(t, 0, mismatches, "preview accuracy: %d mismatches", mismatches)
			assert.LessOrEqual(t, maxInt(sitOut)-minInt(sitOut), 1, "uneven sit-outs: %v", sitOut)
		})
	}
}

func TestFair2v2(t *testing.T) {
	scenarios := []struct {
		name      string
		numP      int
		numCourts int
	}{
		{"12p_1c", 12, 1},
		{"12p_2c", 12, 2},
		{"8p_2c_no_byes", 8, 2},
		{"16p_2c", 16, 2},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			sess := makeSession("2v2", sc.numCourts, "fair")
			players := makePlayers(sc.numP)

			mismatches, sitOut := runFairScenario(t, sess, players, 15)

			assert.Equal(t, 0, mismatches, "preview accuracy: %d mismatches", mismatches)
			assert.LessOrEqual(t, maxInt(sitOut)-minInt(sitOut), 1, "uneven sit-outs: %v", sitOut)
		})
	}
}

// ── sit-out flag tests ────────────────────────────────────────────────────────

func TestSitOut(t *testing.T) {
	t.Run("excluded_never_appear", func(t *testing.T) {
		sess := makeSession("2v2", 2, "fair")
		players := makePlayers(8)

		excluded := map[string]bool{
			players[6].ID.String(): true,
			players[7].ID.String(): true,
		}
		players[6].SitOut = true
		players[7].SitOut = true

		var hist []store.HistoryRow
		for rn := 1; rn <= 5; rn++ {
			gen, err := generator.GenerateRound(sess, players, hist, nil)
			require.NoError(t, err)
			hist = simulateCommit(hist, gen)

			for pid := range allPIDs(gen) {
				assert.False(t, excluded[pid], "excluded player appeared in round %d", rn)
			}
		}
	})

	t.Run("toggle_back_in", func(t *testing.T) {
		sess := makeSession("2v2", 2, "fair")
		players := makePlayers(8)
		players[6].SitOut = true
		players[7].SitOut = true

		var hist []store.HistoryRow
		for rn := 1; rn <= 5; rn++ {
			gen, err := generator.GenerateRound(sess, players, hist, nil)
			require.NoError(t, err)
			hist = simulateCommit(hist, gen)
		}

		toggledID := players[6].ID.String()
		players[6].SitOut = false

		appeared := false
		for rn := 6; rn <= 10; rn++ {
			gen, err := generator.GenerateRound(sess, players, hist, nil)
			require.NoError(t, err)
			hist = simulateCommit(hist, gen)
			if allPIDs(gen)[toggledID] {
				appeared = true
			}
		}
		assert.True(t, appeared, "re-enabled player never appeared in rounds 6-10")
	})

	t.Run("toggle_out_mid_session", func(t *testing.T) {
		sess := makeSession("2v2", 2, "fair")
		players := makePlayers(8)

		var hist []store.HistoryRow
		for rn := 1; rn <= 3; rn++ {
			gen, err := generator.GenerateRound(sess, players, hist, nil)
			require.NoError(t, err)
			hist = simulateCommit(hist, gen)
		}

		toggledID := players[0].ID.String()
		players[0].SitOut = true

		for rn := 4; rn <= 8; rn++ {
			gen, err := generator.GenerateRound(sess, players, hist, nil)
			require.NoError(t, err)
			hist = simulateCommit(hist, gen)
			assert.False(t, allPIDs(gen)[toggledID], "toggled-out player appeared in round %d", rn)
		}
	})

	t.Run("preview_reflects_state", func(t *testing.T) {
		sess := makeSession("2v2", 2, "fair")
		players := makePlayers(8)
		targetID := players[3].ID.String()

		// Sit-out=true: all preview slots must exclude the player.
		players[3].SitOut = true
		preview, err := generator.PreviewRounds(sess, players, nil, nil, 5)
		require.NoError(t, err)
		for i, pr := range preview {
			assert.False(t, allPIDs(pr)[targetID], "sit_out player in preview slot %d", i+1)
		}

		// Sit-out=false: player must appear in at least one preview slot.
		players[3].SitOut = false
		preview, err = generator.PreviewRounds(sess, players, nil, nil, 5)
		require.NoError(t, err)
		pool := make(map[string]bool)
		for _, pr := range preview {
			for pid := range allPIDs(pr) {
				pool[pid] = true
			}
		}
		assert.True(t, pool[targetID], "re-enabled player absent from all 5 preview slots")
	})
}

// ── permanent partner tests ───────────────────────────────────────────────────

func TestPermanentPartners(t *testing.T) {
	scenarios := []struct {
		name      string
		numPairs  int
		numSingle int
		numCourts int
	}{
		{"A_4pairs_no_singles", 4, 0, 2},
		{"B_2pairs_4singles", 2, 4, 2},
		{"C_2pairs_8singles", 2, 8, 2},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			const numRounds = 10
			const previewSize = 5

			sess := makeSession("2v2", sc.numCourts, "fair")
			pairPlayers, pairs := makeNPartnerPairs(sc.numPairs)
			singles := makePlayers(sc.numSingle)
			players := append(pairPlayers, singles...)

			names := playerNames(players)
			sitOut := initSitOut(players)
			playHistory := make(map[string][]bool, len(players))
			var hist []store.HistoryRow
			var preview []generator.GeneratedRound
			blockStart := 1
			mismatches := 0

			for rn := 1; rn <= numRounds; rn++ {
				if (rn-1)%previewSize == 0 {
					var err error
					preview, err = generator.PreviewRounds(sess, players, hist, nil, previewSize)
					require.NoError(t, err)
					blockStart = rn
				}

				slot := rn - blockStart
				gen, err := generator.GenerateRound(sess, players, hist, nil)
				require.NoError(t, err)

				assertPartnersNeverSplit(t, gen, pairs, rn)
				assertAtomicSitOut(t, gen, pairs, rn)

				matched := roundsMatch(gen, preview[slot])
				if !matched {
					mismatches++
				}
				logRound(t, rn, slot, previewSize, gen, matched, names)

				active := activeSet(gen)
				hist = simulateCommit(hist, gen)
				for _, p := range players {
					pid := p.ID.String()
					played := active[pid]
					playHistory[pid] = append(playHistory[pid], played)
					if !played {
						sitOut[pid]++
					}
				}
			}

			maxStreak := maxConsecutiveSitOuts(playHistory)
			t.Logf("  Preview accuracy: %d/%d", numRounds-mismatches, numRounds)
			t.Logf("  Max consecutive sit-outs: %d", maxStreak)
			assert.Equal(t, 0, mismatches, "preview accuracy: %d mismatches", mismatches)

			// Sit-out evenness for pairs (counted per pair, not per player).
			if len(pairs) > 0 {
				pairSitOuts := make(map[string]int, len(pairs))
				for _, pair := range pairs {
					pairSitOuts[pair[0]] = sitOut[pair[0]]
				}
				assert.LessOrEqual(t, maxInt(pairSitOuts)-minInt(pairSitOuts), 2,
					"uneven pair sit-outs")
			}

			// Sit-out evenness for singles.
			if len(singles) > 0 {
				singleSitOuts := make(map[string]int, len(singles))
				for _, p := range singles {
					singleSitOuts[p.ID.String()] = sitOut[p.ID.String()]
				}
				assert.LessOrEqual(t, maxInt(singleSitOuts)-minInt(singleSitOuts), 2,
					"uneven single sit-outs")
			}
		})
	}
}

// ── competitive mode tests ────────────────────────────────────────────────────

func TestCompetitive_PreviewAccuracy(t *testing.T) {
	scenarios := []struct {
		name      string
		matchType string
		numP      int
		numCourts int
	}{
		{"8p_2c_2v2", "2v2", 8, 2},
		{"12p_2c_2v2", "2v2", 12, 2},
		{"6p_2c_1v1", "1v1", 6, 2},
		{"10p_2c_1v1", "1v1", 10, 2},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			const numRounds = 10
			const previewSize = 5

			sess := makeSession(sc.matchType, sc.numCourts, "competitive")
			players := makePlayers(sc.numP)
			names := playerNames(players)
			wins := make(map[string]int) // no winners recorded throughout

			var hist []store.HistoryRow
			var preview []generator.GeneratedRound
			blockStart := 1
			mismatches := 0

			for rn := 1; rn <= numRounds; rn++ {
				if (rn-1)%previewSize == 0 {
					var err error
					preview, err = generator.PreviewRounds(sess, players, hist, wins, previewSize)
					require.NoError(t, err)
					blockStart = rn
				}

				slot := rn - blockStart
				gen, err := generator.GenerateRound(sess, players, hist, wins)
				require.NoError(t, err)

				matched := roundsMatch(gen, preview[slot])
				if !matched {
					mismatches++
				}
				logRound(t, rn, slot, previewSize, gen, matched, names)

				hist = simulateCommit(hist, gen)
				// Wins intentionally left empty to keep preview deterministic.
			}

			t.Logf("  Preview accuracy: %d/%d", numRounds-mismatches, numRounds)
			assert.Equal(t, 0, mismatches, "preview accuracy: %d mismatches", mismatches)
		})
	}
}

func TestCompetitive_WinMatching1v1(t *testing.T) {
	// 4 players, 2 courts, 1v1. After round 1 the 2 winners should face each
	// other on court 1 in round 2 (sorted by descending win count).
	sess := makeSession("1v1", 2, "competitive")
	players := makePlayers(4)
	wins := make(map[string]int)

	gen1, err := generator.GenerateRound(sess, players, nil, wins)
	require.NoError(t, err)
	require.Len(t, gen1.Courts, 2)

	hist := simulateCommit(nil, gen1)

	winners := make(map[string]bool)
	for _, court := range gen1.Courts {
		for _, pid := range court.Team1 {
			wins[pid]++
			winners[pid] = true
		}
	}

	gen2, err := generator.GenerateRound(sess, players, hist, wins)
	require.NoError(t, err)
	require.NotEmpty(t, gen2.Courts)

	court1Players := make(map[string]bool)
	for _, pid := range append(gen2.Courts[0].Team1, gen2.Courts[0].Team2...) {
		court1Players[pid] = true
	}

	assert.True(t, mapsEqual(winners, court1Players),
		"round 2 court 1 should be the 2 winners from round 1")
}

func TestCompetitive_WinMatching2v2(t *testing.T) {
	// 8 players, 2 courts, 2v2. After round 1 court 1 in round 2 should have
	// a higher (or equal) average win count than court 2.
	sess := makeSession("2v2", 2, "competitive")
	players := makePlayers(8)
	wins := make(map[string]int)

	gen1, err := generator.GenerateRound(sess, players, nil, wins)
	require.NoError(t, err)
	require.Len(t, gen1.Courts, 2)

	hist := simulateCommit(nil, gen1)

	for _, court := range gen1.Courts {
		for _, pid := range court.Team1 {
			wins[pid]++
		}
	}

	gen2, err := generator.GenerateRound(sess, players, hist, wins)
	require.NoError(t, err)
	require.Len(t, gen2.Courts, 2)

	avgWins := func(court generator.CourtAssignment) float64 {
		all := append(court.Team1, court.Team2...)
		total := 0
		for _, pid := range all {
			total += wins[pid]
		}
		return float64(total) / float64(len(all))
	}

	avg1 := avgWins(gen2.Courts[0])
	avg2 := avgWins(gen2.Courts[1])

	assert.GreaterOrEqual(t, avg1, avg2,
		"court 1 avg wins (%.2f) should be >= court 2 avg wins (%.2f) in competitive mode", avg1, avg2)
}

// ── override history test (pure) ──────────────────────────────────────────────

func TestOverride_FutureRoundsPenalty(t *testing.T) {
	// Manually build a round-1 history where A+C were partners.
	// Round 2 must not re-pair them (PARTNER_REPEAT_W = 5.0).
	sess := makeSession("2v2", 1, "fair")

	A, B, C, D := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	pA, pB, pC, pD := A.String(), B.String(), C.String(), D.String()

	players := []store.PlayerWithPartner{
		{Player: store.Player{ID: A}},
		{Player: store.Player{ID: B}},
		{Player: store.Player{ID: C}},
		{Player: store.Player{ID: D}},
	}

	// Simulate: round 1 was [A,C] vs [B,D] (as if reconciled after an override).
	hist := []store.HistoryRow{
		{PlayerID: A, PartnerIDs: []string{pC}, OpponentIDs: []string{pB, pD}, RoundNumber: 1},
		{PlayerID: C, PartnerIDs: []string{pA}, OpponentIDs: []string{pB, pD}, RoundNumber: 1},
		{PlayerID: B, PartnerIDs: []string{pD}, OpponentIDs: []string{pA, pC}, RoundNumber: 1},
		{PlayerID: D, PartnerIDs: []string{pB}, OpponentIDs: []string{pA, pC}, RoundNumber: 1},
	}

	gen2, err := generator.GenerateRound(sess, players, hist, nil)
	require.NoError(t, err)
	require.Len(t, gen2.Courts, 1)

	court := gen2.Courts[0]
	acInT1 := contains(court.Team1, pA) && contains(court.Team1, pC)
	acInT2 := contains(court.Team2, pA) && contains(court.Team2, pC)

	assert.False(t, acInT1 || acInT2,
		"A and C should not be re-paired in round 2 (PARTNER_REPEAT_W=5.0 penalty)")
}

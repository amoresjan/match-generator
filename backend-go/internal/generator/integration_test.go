package generator_test

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/amoresjan/match-generator/backend/internal/generator"
	"github.com/amoresjan/match-generator/backend/internal/store"
)

// ── DB setup ──────────────────────────────────────────────────────────────────

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("pgxpool.New: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func newTestSession(t *testing.T, pool *pgxpool.Pool, matchType string, numCourts int, mode string) store.Session {
	t.Helper()
	q := store.New(pool)
	sess, err := q.CreateSession(context.Background(), store.CreateSessionParams{
		ID:             uuid.New(),
		AdminToken:     uuid.New(),
		Name:           t.Name(),
		MatchType:      matchType,
		NumCourts:      numCourts,
		GenerationMode: mode,
		SportType:      "pickleball",
		SessionMode:    "rotation",
	})
	require.NoError(t, err)
	t.Cleanup(func() {
		pool.Exec(context.Background(),
			"DELETE FROM sessions_app_session WHERE id = $1", sess.ID)
	})
	return sess
}

func newTestPlayer(t *testing.T, pool *pgxpool.Pool, sessionID uuid.UUID) store.PlayerWithPartner {
	t.Helper()
	q := store.New(pool)
	p, err := q.CreatePlayer(context.Background(), sessionID, uuid.New(), "P")
	require.NoError(t, err)
	return p
}

// ── integration tests ─────────────────────────────────────────────────────────

// TestIntegration_CommitRound verifies that CommitRound persists round, match,
// and PlayerRoundHistory rows correctly.
func TestIntegration_CommitRound(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	q := store.New(pool)
	s := store.NewStore(pool)

	sess := newTestSession(t, pool, "2v2", 1, "fair")

	var players []store.PlayerWithPartner
	for range 4 {
		players = append(players, newTestPlayer(t, pool, sess.ID))
	}

	gen, err := generator.GenerateRound(sess, players, nil, nil)
	require.NoError(t, err)

	rnd, err := generator.CommitRound(ctx, s, sess.ID, gen)
	require.NoError(t, err)
	assert.Equal(t, 1, rnd.Number)

	// Verify match row created with correct teams.
	matches, err := q.GetMatchesForRound(ctx, rnd.ID)
	require.NoError(t, err)
	require.Len(t, matches, 1)
	assert.Len(t, matches[0].Team1Players, 2)
	assert.Len(t, matches[0].Team2Players, 2)

	// 4 playing players → 4 history rows, none sat out.
	hist, err := q.GetRoundHistory(ctx, rnd.ID)
	require.NoError(t, err)
	assert.Len(t, hist, 4)
	for _, h := range hist {
		assert.False(t, h.SatOut)
	}

	// Second CommitRound gets round number 2.
	gen2, err := generator.GenerateRound(sess, players, nil, nil)
	require.NoError(t, err)
	rnd2, err := generator.CommitRound(ctx, s, sess.ID, gen2)
	require.NoError(t, err)
	assert.Equal(t, 2, rnd2.Number)
}

// TestIntegration_ReconcilePartnerHistory verifies that ReconcileRoundHistory
// rewrites PlayerRoundHistory to reflect a manual match override.
func TestIntegration_ReconcilePartnerHistory(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	q := store.New(pool)
	s := store.NewStore(pool)

	sess := newTestSession(t, pool, "2v2", 1, "fair")

	A := newTestPlayer(t, pool, sess.ID)
	B := newTestPlayer(t, pool, sess.ID)
	C := newTestPlayer(t, pool, sess.ID)
	D := newTestPlayer(t, pool, sess.ID)

	pA, pB, pC, pD := A.ID.String(), B.ID.String(), C.ID.String(), D.ID.String()
	players := []store.PlayerWithPartner{A, B, C, D}

	gen, err := generator.GenerateRound(sess, players, nil, nil)
	require.NoError(t, err)
	rnd, err := generator.CommitRound(ctx, s, sess.ID, gen)
	require.NoError(t, err)

	// Override match → [A,C] vs [B,D].
	matches, err := q.GetMatchesForRound(ctx, rnd.ID)
	require.NoError(t, err)
	require.Len(t, matches, 1)

	_, err = q.OverrideMatch(ctx, store.UpdateMatchParams{
		ID:           matches[0].ID,
		Team1Players: []string{pA, pC},
		Team2Players: []string{pB, pD},
	})
	require.NoError(t, err)

	err = generator.ReconcileRoundHistory(ctx, q, rnd, sess.ID)
	require.NoError(t, err)

	hist, err := q.GetRoundHistory(ctx, rnd.ID)
	require.NoError(t, err)

	byPlayer := make(map[string]store.PlayerRoundHistory, len(hist))
	for _, h := range hist {
		byPlayer[h.PlayerID.String()] = h
	}

	// A's partner must be C, opponents B and D.
	assert.Contains(t, byPlayer[pA].PartnerIDs, pC, "A.partner should be C after override")
	assert.NotContains(t, byPlayer[pA].PartnerIDs, pB, "A.partner should NOT be B after override")
	assert.Contains(t, byPlayer[pA].OpponentIDs, pB)
	assert.Contains(t, byPlayer[pA].OpponentIDs, pD)

	// B's partner must be D.
	assert.Contains(t, byPlayer[pB].PartnerIDs, pD, "B.partner should be D after override")
	assert.NotContains(t, byPlayer[pB].PartnerIDs, pA, "B.partner should NOT be A after override")

	// C's opponents must be B and D.
	assert.Contains(t, byPlayer[pC].OpponentIDs, pB)
	assert.Contains(t, byPlayer[pC].OpponentIDs, pD)
}

// TestIntegration_ReconcileSitOutCount verifies that ReconcileRoundHistory
// correctly adjusts total_wait_rounds when a player's sit-out status changes.
func TestIntegration_ReconcileSitOutCount(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	q := store.New(pool)
	s := store.NewStore(pool)

	// 5 players, 1 court → exactly 1 bye per round.
	sess := newTestSession(t, pool, "2v2", 1, "fair")

	var players []store.PlayerWithPartner
	for range 5 {
		players = append(players, newTestPlayer(t, pool, sess.ID))
	}

	gen, err := generator.GenerateRound(sess, players, nil, nil)
	require.NoError(t, err)
	require.Len(t, gen.ByePlayers, 1, "5 players, 1 court: expected exactly 1 bye")

	rnd, err := generator.CommitRound(ctx, s, sess.ID, gen)
	require.NoError(t, err)

	byeID := gen.ByePlayers[0]
	activeID := gen.Courts[0].Team2[0]

	// Sanity: bye player has wait_rounds=1, active player has 0.
	byeP, err := q.GetPlayer(ctx, uuid.MustParse(byeID))
	require.NoError(t, err)
	assert.Equal(t, 1, byeP.TotalWaitRounds, "bye player should have wait_rounds=1")

	activeP, err := q.GetPlayer(ctx, uuid.MustParse(activeID))
	require.NoError(t, err)
	assert.Equal(t, 0, activeP.TotalWaitRounds, "active player should have wait_rounds=0")

	// Override: swap the bye player into team2, the active player out.
	matches, err := q.GetMatchesForRound(ctx, rnd.ID)
	require.NoError(t, err)

	newT2 := make([]string, 0, len(matches[0].Team2Players))
	for _, pid := range matches[0].Team2Players {
		if pid != activeID {
			newT2 = append(newT2, pid)
		}
	}
	newT2 = append(newT2, byeID)

	_, err = q.OverrideMatch(ctx, store.UpdateMatchParams{
		ID:           matches[0].ID,
		Team1Players: matches[0].Team1Players,
		Team2Players: newT2,
	})
	require.NoError(t, err)

	err = generator.ReconcileRoundHistory(ctx, q, rnd, sess.ID)
	require.NoError(t, err)

	// Former bye is now playing → wait_rounds must drop to 0.
	byeP, err = q.GetPlayer(ctx, uuid.MustParse(byeID))
	require.NoError(t, err)
	assert.Equal(t, 0, byeP.TotalWaitRounds,
		"former bye (now playing) should have wait_rounds=0 after reconcile")

	// Former active is now bye → wait_rounds must rise to 1.
	activeP, err = q.GetPlayer(ctx, uuid.MustParse(activeID))
	require.NoError(t, err)
	assert.Equal(t, 1, activeP.TotalWaitRounds,
		"former active (now bye) should have wait_rounds=1 after reconcile")
}

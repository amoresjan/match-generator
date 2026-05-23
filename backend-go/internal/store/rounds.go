package store

import (
	"context"

	"github.com/google/uuid"
)

func (q *Queries) GetRoundCount(ctx context.Context, sessionID uuid.UUID) (int, error) {
	var n int
	err := q.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM sessions_app_round WHERE session_id = $1`,
		sessionID,
	).Scan(&n)
	return n, err
}

func (q *Queries) GetMaxRoundNumber(ctx context.Context, sessionID uuid.UUID) (int, error) {
	var n int
	err := q.db.QueryRow(ctx,
		`SELECT COALESCE(MAX(number), 0) FROM sessions_app_round WHERE session_id = $1`,
		sessionID,
	).Scan(&n)
	return n, err
}

func (q *Queries) CreateRound(ctx context.Context, id uuid.UUID, sessionID uuid.UUID, number int) (Round, error) {
	const sql = `
		INSERT INTO sessions_app_round (id, session_id, number)
		VALUES ($1, $2, $3)
		RETURNING id, session_id, number, created_at`

	var r Round
	err := q.db.QueryRow(ctx, sql, id, sessionID, number).Scan(
		&r.ID, &r.SessionID, &r.Number, &r.CreatedAt,
	)
	return r, err
}

// GetRoundsWithMatches fetches rounds (optionally filtered to number > sinceRound)
// along with their matches. Uses two queries to avoid N+1.
func (q *Queries) GetRoundsWithMatches(ctx context.Context, sessionID uuid.UUID, sinceRound *int) ([]RoundWithMatches, error) {
	since := 0
	if sinceRound != nil {
		since = *sinceRound
	}

	rows, err := q.db.Query(ctx, `
		SELECT id, session_id, number, created_at
		FROM sessions_app_round
		WHERE session_id = $1 AND number > $2
		ORDER BY number`,
		sessionID, since,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rounds []Round
	var roundIDs []uuid.UUID
	for rows.Next() {
		var r Round
		if err := rows.Scan(&r.ID, &r.SessionID, &r.Number, &r.CreatedAt); err != nil {
			return nil, err
		}
		rounds = append(rounds, r)
		roundIDs = append(roundIDs, r.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(rounds) == 0 {
		return nil, nil
	}

	matchRows, err := q.db.Query(ctx, `
		SELECT id, round_id, court_number, team1_players, team2_players, winner
		FROM sessions_app_match
		WHERE round_id = ANY($1)
		ORDER BY round_id, court_number`,
		roundIDs,
	)
	if err != nil {
		return nil, err
	}
	defer matchRows.Close()

	matchesByRound := make(map[uuid.UUID][]Match)
	for matchRows.Next() {
		m, err := scanMatch(matchRows)
		if err != nil {
			return nil, err
		}
		matchesByRound[m.RoundID] = append(matchesByRound[m.RoundID], m)
	}
	if err := matchRows.Err(); err != nil {
		return nil, err
	}

	out := make([]RoundWithMatches, len(rounds))
	for i, r := range rounds {
		out[i] = RoundWithMatches{
			Round:   r,
			Matches: matchesByRound[r.ID],
		}
		if out[i].Matches == nil {
			out[i].Matches = []Match{}
		}
	}
	return out, nil
}

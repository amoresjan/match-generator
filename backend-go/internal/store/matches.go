package store

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
)

type CreateMatchParams struct {
	ID           uuid.UUID
	RoundID      uuid.UUID
	CourtNumber  int
	Team1Players []string
	Team2Players []string
}

func (q *Queries) CreateMatch(ctx context.Context, p CreateMatchParams) (Match, error) {
	t1, _ := json.Marshal(p.Team1Players)
	t2, _ := json.Marshal(p.Team2Players)

	const sql = `
		INSERT INTO sessions_app_match (id, round_id, court_number, team1_players, team2_players)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, round_id, court_number, team1_players, team2_players, winner`

	return scanMatch(q.db.QueryRow(ctx, sql, p.ID, p.RoundID, p.CourtNumber, t1, t2))
}

func (q *Queries) GetMatch(ctx context.Context, id uuid.UUID) (Match, error) {
	const sql = `
		SELECT id, round_id, court_number, team1_players, team2_players, winner
		FROM sessions_app_match WHERE id = $1`

	return scanMatch(q.db.QueryRow(ctx, sql, id))
}

// GetMatchByIDAndSession checks that the match's round belongs to the given session.
func (q *Queries) GetMatchByIDAndSession(ctx context.Context, id uuid.UUID, sessionID uuid.UUID) (Match, error) {
	const sql = `
		SELECT m.id, m.round_id, m.court_number, m.team1_players, m.team2_players, m.winner
		FROM sessions_app_match m
		JOIN sessions_app_round r ON m.round_id = r.id
		WHERE m.id = $1 AND r.session_id = $2`

	return scanMatch(q.db.QueryRow(ctx, sql, id, sessionID))
}

func (q *Queries) GetMatchesForRound(ctx context.Context, roundID uuid.UUID) ([]Match, error) {
	rows, err := q.db.Query(ctx, `
		SELECT id, round_id, court_number, team1_players, team2_players, winner
		FROM sessions_app_match WHERE round_id = $1
		ORDER BY court_number`,
		roundID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Match
	for rows.Next() {
		m, err := scanMatch(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

type UpdateMatchParams struct {
	ID           uuid.UUID
	Team1Players []string
	Team2Players []string
}

func (q *Queries) OverrideMatch(ctx context.Context, p UpdateMatchParams) (Match, error) {
	t1, _ := json.Marshal(p.Team1Players)
	t2, _ := json.Marshal(p.Team2Players)

	const sql = `
		UPDATE sessions_app_match
		SET team1_players = $2, team2_players = $3, winner = NULL
		WHERE id = $1
		RETURNING id, round_id, court_number, team1_players, team2_players, winner`

	return scanMatch(q.db.QueryRow(ctx, sql, p.ID, t1, t2))
}

func (q *Queries) SetMatchWinner(ctx context.Context, id uuid.UUID, winner *string) (Match, error) {
	const sql = `
		UPDATE sessions_app_match SET winner = $2 WHERE id = $1
		RETURNING id, round_id, court_number, team1_players, team2_players, winner`

	return scanMatch(q.db.QueryRow(ctx, sql, id, winner))
}

// GetWinCountsForSession returns a map of playerID → win count across all matches.
func (q *Queries) GetWinCountsForSession(ctx context.Context, sessionID uuid.UUID) (map[string]int, error) {
	const sql = `
		SELECT m.team1_players, m.team2_players, m.winner
		FROM sessions_app_match m
		JOIN sessions_app_round r ON m.round_id = r.id
		WHERE r.session_id = $1 AND m.winner IS NOT NULL`

	rows, err := q.db.Query(ctx, sql, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	wins := make(map[string]int)
	for rows.Next() {
		var t1, t2 json.RawMessage
		var winner string
		if err := rows.Scan(&t1, &t2, &winner); err != nil {
			return nil, err
		}
		var t1ids, t2ids []string
		json.Unmarshal(t1, &t1ids)
		json.Unmarshal(t2, &t2ids)
		var winnerIDs []string
		if winner == "team1" {
			winnerIDs = t1ids
		} else {
			winnerIDs = t2ids
		}
		for _, pid := range winnerIDs {
			wins[pid]++
		}
	}
	return wins, rows.Err()
}

// ---- helpers ----------------------------------------------------------------

func scanMatch(row interface{ Scan(...any) error }) (Match, error) {
	var m Match
	var t1, t2 json.RawMessage
	err := row.Scan(&m.ID, &m.RoundID, &m.CourtNumber, &t1, &t2, &m.Winner)
	if err != nil {
		return m, err
	}
	json.Unmarshal(t1, &m.Team1Players)
	json.Unmarshal(t2, &m.Team2Players)
	if m.Team1Players == nil {
		m.Team1Players = []string{}
	}
	if m.Team2Players == nil {
		m.Team2Players = []string{}
	}
	return m, nil
}

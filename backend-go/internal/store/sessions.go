package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type CreateSessionParams struct {
	ID             uuid.UUID
	AdminToken     uuid.UUID
	Name           string
	MatchType      string
	NumCourts      int
	GenerationMode string
	SportType      string
	SessionMode    string
}

func (q *Queries) CreateSession(ctx context.Context, p CreateSessionParams) (Session, error) {
	const sql = `
		INSERT INTO sessions_app_session
			(id, admin_token, name, match_type, num_courts, generation_mode, sport_type, session_mode)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, admin_token, name, match_type, num_courts, generation_mode, sport_type,
		          session_mode, tournament_data, created_at, is_active, auto_deactivated,
		          last_round_at, removed_players`

	return scanSession(q.db.QueryRow(ctx, sql,
		p.ID, p.AdminToken, p.Name, p.MatchType, p.NumCourts,
		p.GenerationMode, p.SportType, p.SessionMode,
	))
}

func (q *Queries) GetSession(ctx context.Context, id uuid.UUID) (Session, error) {
	const sql = `
		SELECT id, admin_token, name, match_type, num_courts, generation_mode, sport_type,
		       session_mode, tournament_data, created_at, is_active, auto_deactivated,
		       last_round_at, removed_players
		FROM sessions_app_session WHERE id = $1`

	return scanSession(q.db.QueryRow(ctx, sql, id))
}

func (q *Queries) GetSessionForUpdate(ctx context.Context, id uuid.UUID) (Session, error) {
	const sql = `
		SELECT id, admin_token, name, match_type, num_courts, generation_mode, sport_type,
		       session_mode, tournament_data, created_at, is_active, auto_deactivated,
		       last_round_at, removed_players
		FROM sessions_app_session WHERE id = $1 FOR UPDATE`

	return scanSession(q.db.QueryRow(ctx, sql, id))
}

type UpdateSessionParams struct {
	ID             uuid.UUID
	Name           *string
	MatchType      *string
	NumCourts      *int
	GenerationMode *string
	SportType      *string
	SessionMode    *string
}

func (q *Queries) UpdateSession(ctx context.Context, p UpdateSessionParams) (Session, error) {
	const sql = `
		UPDATE sessions_app_session SET
			name            = COALESCE($2, name),
			match_type      = COALESCE($3, match_type),
			num_courts      = COALESCE($4, num_courts),
			generation_mode = COALESCE($5, generation_mode),
			sport_type      = COALESCE($6, sport_type),
			session_mode    = COALESCE($7, session_mode)
		WHERE id = $1
		RETURNING id, admin_token, name, match_type, num_courts, generation_mode, sport_type,
		          session_mode, tournament_data, created_at, is_active, auto_deactivated,
		          last_round_at, removed_players`

	return scanSession(q.db.QueryRow(ctx, sql,
		p.ID, p.Name, p.MatchType, p.NumCourts, p.GenerationMode, p.SportType, p.SessionMode,
	))
}

func (q *Queries) SetSessionActive(ctx context.Context, id uuid.UUID, isActive bool) error {
	_, err := q.db.Exec(ctx,
		`UPDATE sessions_app_session SET is_active = $2 WHERE id = $1`,
		id, isActive,
	)
	return err
}

func (q *Queries) SetSessionAutoDeactivated(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`UPDATE sessions_app_session SET is_active = FALSE, auto_deactivated = TRUE WHERE id = $1`,
		id,
	)
	return err
}

func (q *Queries) SetLastRoundAt(ctx context.Context, id uuid.UUID, t time.Time) error {
	_, err := q.db.Exec(ctx,
		`UPDATE sessions_app_session SET last_round_at = $2 WHERE id = $1`,
		id, t,
	)
	return err
}

func (q *Queries) SetTournamentData(ctx context.Context, id uuid.UUID, data json.RawMessage) error {
	_, err := q.db.Exec(ctx,
		`UPDATE sessions_app_session SET tournament_data = $2 WHERE id = $1`,
		id, data,
	)
	return err
}

func (q *Queries) SetRemovedPlayers(ctx context.Context, id uuid.UUID, removed json.RawMessage) error {
	_, err := q.db.Exec(ctx,
		`UPDATE sessions_app_session SET removed_players = $2 WHERE id = $1`,
		id, removed,
	)
	return err
}

// GetStaleSessions returns active sessions whose last activity is older than cutoff.
// Sessions that never generated a round use created_at as the activity timestamp.
func (q *Queries) GetStaleSessions(ctx context.Context, cutoff time.Time) ([]Session, error) {
	const sql = `
		SELECT id, admin_token, name, match_type, num_courts, generation_mode, sport_type,
		       session_mode, tournament_data, created_at, is_active, auto_deactivated,
		       last_round_at, removed_players
		FROM sessions_app_session
		WHERE is_active = TRUE
		  AND (
		    (last_round_at IS NOT NULL AND last_round_at < $1)
		    OR  (last_round_at IS NULL  AND created_at    < $1)
		  )`

	rows, err := q.db.Query(ctx, sql, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

// DeactivateSessionsBatch marks the given sessions as auto-deactivated in one statement.
func (q *Queries) DeactivateSessionsBatch(ctx context.Context, ids []uuid.UUID) (int64, error) {
	tag, err := q.db.Exec(ctx,
		`UPDATE sessions_app_session SET is_active = FALSE, auto_deactivated = TRUE WHERE id = ANY($1)`,
		ids,
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func scanSession(row interface{ Scan(...any) error }) (Session, error) {
	var s Session
	err := row.Scan(
		&s.ID, &s.AdminToken, &s.Name, &s.MatchType, &s.NumCourts,
		&s.GenerationMode, &s.SportType, &s.SessionMode,
		&s.TournamentData, &s.CreatedAt, &s.IsActive, &s.AutoDeactivated,
		&s.LastRoundAt, &s.RemovedPlayers,
	)
	return s, err
}

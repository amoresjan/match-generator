package store

import (
	"context"

	"github.com/google/uuid"
)

func (q *Queries) CreatePlayer(ctx context.Context, sessionID uuid.UUID, id uuid.UUID, name string) (PlayerWithPartner, error) {
	const sql = `
		INSERT INTO sessions_app_player (id, session_id, name)
		VALUES ($1, $2, $3)
		RETURNING id, session_id, name, permanent_partner_id, total_wait_rounds, sit_out, created_at`

	row := q.db.QueryRow(ctx, sql, id, sessionID, name)
	p, err := scanPlayer(row)
	if err != nil {
		return PlayerWithPartner{}, err
	}
	return PlayerWithPartner{Player: p}, nil
}

func (q *Queries) GetPlayer(ctx context.Context, id uuid.UUID) (PlayerWithPartner, error) {
	const sql = `
		SELECT p.id, p.session_id, p.name, p.permanent_partner_id,
		       p.total_wait_rounds, p.sit_out, p.created_at,
		       pp.name AS partner_name
		FROM sessions_app_player p
		LEFT JOIN sessions_app_player pp ON p.permanent_partner_id = pp.id
		WHERE p.id = $1`

	return scanPlayerWithPartner(q.db.QueryRow(ctx, sql, id))
}

func (q *Queries) GetPlayersForSession(ctx context.Context, sessionID uuid.UUID) ([]PlayerWithPartner, error) {
	const sql = `
		SELECT p.id, p.session_id, p.name, p.permanent_partner_id,
		       p.total_wait_rounds, p.sit_out, p.created_at,
		       pp.name AS partner_name
		FROM sessions_app_player p
		LEFT JOIN sessions_app_player pp ON p.permanent_partner_id = pp.id
		WHERE p.session_id = $1
		ORDER BY p.created_at`

	return queryPlayers(ctx, q.db, sql, sessionID)
}

func (q *Queries) GetActivePlayers(ctx context.Context, sessionID uuid.UUID) ([]PlayerWithPartner, error) {
	const sql = `
		SELECT p.id, p.session_id, p.name, p.permanent_partner_id,
		       p.total_wait_rounds, p.sit_out, p.created_at,
		       pp.name AS partner_name
		FROM sessions_app_player p
		LEFT JOIN sessions_app_player pp ON p.permanent_partner_id = pp.id
		WHERE p.session_id = $1 AND p.sit_out = FALSE
		ORDER BY p.id`

	return queryPlayers(ctx, q.db, sql, sessionID)
}

type UpdatePlayerParams struct {
	ID     uuid.UUID
	Name   *string
	SitOut *bool
}

func (q *Queries) UpdatePlayer(ctx context.Context, p UpdatePlayerParams) (PlayerWithPartner, error) {
	const sql = `
		UPDATE sessions_app_player SET
			name    = COALESCE($2, name),
			sit_out = COALESCE($3, sit_out)
		WHERE id = $1
		RETURNING id, session_id, name, permanent_partner_id, total_wait_rounds, sit_out, created_at`

	player, err := scanPlayer(q.db.QueryRow(ctx, sql, p.ID, p.Name, p.SitOut))
	if err != nil {
		return PlayerWithPartner{}, err
	}
	// Reload with partner join so the response is complete.
	return q.GetPlayer(ctx, player.ID)
}

func (q *Queries) DeletePlayer(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM sessions_app_player WHERE id = $1`, id)
	return err
}

// ClearPartner removes a player's permanent_partner_id (one side only).
func (q *Queries) ClearPartner(ctx context.Context, playerID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`UPDATE sessions_app_player SET permanent_partner_id = NULL WHERE id = $1`,
		playerID,
	)
	return err
}

// SetPartner sets permanent_partner_id for one player (one side only).
func (q *Queries) SetPartner(ctx context.Context, playerID, partnerID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`UPDATE sessions_app_player SET permanent_partner_id = $2 WHERE id = $1`,
		playerID, partnerID,
	)
	return err
}

// IncrementWaitRounds adds delta to total_wait_rounds, clamping at 0.
func (q *Queries) IncrementWaitRounds(ctx context.Context, playerID uuid.UUID, delta int) error {
	_, err := q.db.Exec(ctx,
		`UPDATE sessions_app_player
		 SET total_wait_rounds = GREATEST(0, total_wait_rounds + $2)
		 WHERE id = $1`,
		playerID, delta,
	)
	return err
}

// BulkIncrementWaitRounds applies per-player deltas in a single unnested update.
func (q *Queries) BulkIncrementWaitRounds(ctx context.Context, deltas map[uuid.UUID]int) error {
	if len(deltas) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, 0, len(deltas))
	ds := make([]int, 0, len(deltas))
	for id, d := range deltas {
		ids = append(ids, id)
		ds = append(ds, d)
	}
	_, err := q.db.Exec(ctx, `
		UPDATE sessions_app_player p
		SET total_wait_rounds = GREATEST(0, p.total_wait_rounds + u.delta)
		FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS delta) AS u
		WHERE p.id = u.id`,
		ids, ds,
	)
	return err
}

// ---- helpers ----------------------------------------------------------------

func scanPlayer(row interface{ Scan(...any) error }) (Player, error) {
	var p Player
	err := row.Scan(&p.ID, &p.SessionID, &p.Name, &p.PermanentPartnerID,
		&p.TotalWaitRounds, &p.SitOut, &p.CreatedAt)
	return p, err
}

func scanPlayerWithPartner(row interface{ Scan(...any) error }) (PlayerWithPartner, error) {
	var p PlayerWithPartner
	err := row.Scan(&p.ID, &p.SessionID, &p.Name, &p.PermanentPartnerID,
		&p.TotalWaitRounds, &p.SitOut, &p.CreatedAt, &p.PartnerName)
	return p, err
}

func queryPlayers(ctx context.Context, db DBTX, sql string, args ...any) ([]PlayerWithPartner, error) {
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PlayerWithPartner
	for rows.Next() {
		p, err := scanPlayerWithPartner(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

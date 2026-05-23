package store

import (
	"context"

	"github.com/google/uuid"
)

type UpsertPushSubParams struct {
	SessionID uuid.UUID
	Endpoint  string
	P256DH    string
	Auth      string
	PlayerID  *uuid.UUID
}

func (q *Queries) UpsertPushSub(ctx context.Context, p UpsertPushSubParams) error {
	_, err := q.db.Exec(ctx, `
		INSERT INTO sessions_app_pushsubscription (session_id, endpoint, p256dh, auth, player_id)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (endpoint) DO UPDATE SET
			session_id = EXCLUDED.session_id,
			p256dh     = EXCLUDED.p256dh,
			auth       = EXCLUDED.auth,
			player_id  = EXCLUDED.player_id`,
		p.SessionID, p.Endpoint, p.P256DH, p.Auth, p.PlayerID,
	)
	return err
}

func (q *Queries) DeletePushSubByEndpoint(ctx context.Context, endpoint string) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM sessions_app_pushsubscription WHERE endpoint = $1`,
		endpoint,
	)
	return err
}

func (q *Queries) DeletePushSubByID(ctx context.Context, id int64) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM sessions_app_pushsubscription WHERE id = $1`,
		id,
	)
	return err
}

func (q *Queries) GetPushSubsForSession(ctx context.Context, sessionID uuid.UUID) ([]PushSubscription, error) {
	rows, err := q.db.Query(ctx, `
		SELECT id, session_id, endpoint, p256dh, auth, player_id, created_at
		FROM sessions_app_pushsubscription WHERE session_id = $1`,
		sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PushSubscription
	for rows.Next() {
		var s PushSubscription
		if err := rows.Scan(&s.ID, &s.SessionID, &s.Endpoint, &s.P256DH, &s.Auth, &s.PlayerID, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

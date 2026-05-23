package store

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
)

type HistoryInput struct {
	PlayerID    uuid.UUID
	RoundID     uuid.UUID
	PartnerIDs  []string
	OpponentIDs []string
	SatOut      bool
}

// BulkCreateHistory inserts multiple PlayerRoundHistory rows in a single batch.
func (q *Queries) BulkCreateHistory(ctx context.Context, rows []HistoryInput) error {
	if len(rows) == 0 {
		return nil
	}
	for _, h := range rows {
		partners, _ := json.Marshal(h.PartnerIDs)
		opponents, _ := json.Marshal(h.OpponentIDs)
		if partners == nil {
			partners = []byte("[]")
		}
		if opponents == nil {
			opponents = []byte("[]")
		}
		_, err := q.db.Exec(ctx, `
			INSERT INTO sessions_app_playerroundhistory
				(player_id, round_id, partner_ids, opponent_ids, sat_out)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (player_id, round_id) DO UPDATE SET
				partner_ids  = EXCLUDED.partner_ids,
				opponent_ids = EXCLUDED.opponent_ids,
				sat_out      = EXCLUDED.sat_out`,
			h.PlayerID, h.RoundID, partners, opponents, h.SatOut,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (q *Queries) DeleteRoundHistory(ctx context.Context, roundID uuid.UUID) error {
	_, err := q.db.Exec(ctx,
		`DELETE FROM sessions_app_playerroundhistory WHERE round_id = $1`,
		roundID,
	)
	return err
}

func (q *Queries) GetRoundHistory(ctx context.Context, roundID uuid.UUID) ([]PlayerRoundHistory, error) {
	rows, err := q.db.Query(ctx, `
		SELECT id, player_id, round_id, partner_ids, opponent_ids, sat_out
		FROM sessions_app_playerroundhistory WHERE round_id = $1`,
		roundID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PlayerRoundHistory
	for rows.Next() {
		h, err := scanHistory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// GetFullHistory returns all PlayerRoundHistory rows for a session, joined to round number.
func (q *Queries) GetFullHistory(ctx context.Context, sessionID uuid.UUID) ([]HistoryRow, error) {
	const sql = `
		SELECT h.player_id, h.partner_ids, h.opponent_ids, h.sat_out, r.number
		FROM sessions_app_playerroundhistory h
		JOIN sessions_app_round r ON h.round_id = r.id
		WHERE r.session_id = $1
		ORDER BY r.number`

	rows, err := q.db.Query(ctx, sql, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []HistoryRow
	for rows.Next() {
		var h HistoryRow
		var partners, opponents json.RawMessage
		if err := rows.Scan(&h.PlayerID, &partners, &opponents, &h.SatOut, &h.RoundNumber); err != nil {
			return nil, err
		}
		json.Unmarshal(partners, &h.PartnerIDs)
		json.Unmarshal(opponents, &h.OpponentIDs)
		out = append(out, h)
	}
	return out, rows.Err()
}

// ---- helpers ----------------------------------------------------------------

func scanHistory(row interface{ Scan(...any) error }) (PlayerRoundHistory, error) {
	var h PlayerRoundHistory
	var partners, opponents json.RawMessage
	err := row.Scan(&h.ID, &h.PlayerID, &h.RoundID, &partners, &opponents, &h.SatOut)
	if err != nil {
		return h, err
	}
	json.Unmarshal(partners, &h.PartnerIDs)
	json.Unmarshal(opponents, &h.OpponentIDs)
	return h, nil
}

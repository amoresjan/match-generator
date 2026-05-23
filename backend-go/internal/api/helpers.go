package api

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("writeJSON encode error", "err", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"detail": msg})
}

// writeServerError logs err and writes a 500 response. Use this instead of
// writeError(w, 500, ...) so every internal failure is visible in logs.
func writeServerError(w http.ResponseWriter, msg string, err error) {
	slog.Error(msg, "err", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"detail": msg})
}

func uuidParam(r *http.Request, key string) (uuid.UUID, error) {
	return uuid.Parse(chi.URLParam(r, key))
}

func requireAdmin(r *http.Request, adminToken uuid.UUID) bool {
	got := r.Header.Get("X-Admin-Token")
	want := adminToken.String()
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

func isNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

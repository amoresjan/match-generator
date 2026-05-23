package api

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/amoresjan/match-generator/backend/internal/store"
)

func (h *Handler) VapidPublicKey(w http.ResponseWriter, r *http.Request) {
	if h.vapidPub == "" {
		writeError(w, http.StatusServiceUnavailable, "Push notifications not configured.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"public_key": h.vapidPub})
}

func (h *Handler) PushSubscribe(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if _, err := h.store.GetSession(r.Context(), sessionID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}

	var body struct {
		Endpoint string  `json:"endpoint"`
		P256DH   string  `json:"p256dh"`
		Auth     string  `json:"auth"`
		PlayerID *string `json:"player_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Endpoint == "" || body.P256DH == "" || body.Auth == "" {
		writeError(w, http.StatusBadRequest, "endpoint, p256dh, and auth are required")
		return
	}

	var playerID *uuid.UUID
	if body.PlayerID != nil && *body.PlayerID != "" {
		pid, err := uuid.Parse(*body.PlayerID)
		if err == nil {
			playerID = &pid
		}
	}

	if err := h.store.UpsertPushSub(r.Context(), store.UpsertPushSubParams{
		SessionID: sessionID,
		Endpoint:  body.Endpoint,
		P256DH:    body.P256DH,
		Auth:      body.Auth,
		PlayerID:  playerID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save subscription")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) PushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if _, err := h.store.GetSession(r.Context(), sessionID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}

	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "endpoint is required")
		return
	}

	if err := h.store.DeletePushSubByEndpoint(r.Context(), body.Endpoint); err != nil {
		writeError(w, http.StatusInternalServerError, "error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

package api

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/amoresjan/match-generator/backend/internal/push"
	"github.com/amoresjan/match-generator/backend/internal/store"
)

func (h *Handler) AddPlayer(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	session, err := h.store.GetSession(r.Context(), sessionID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}
	if !requireAdmin(r, session.AdminToken) {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}
	if !session.IsActive {
		writeError(w, http.StatusForbidden, "Session is deactivated.")
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	player, err := h.store.CreatePlayer(r.Context(), sessionID, uuid.New(), body.Name)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusBadRequest, "a player with that name already exists")
		} else {
			writeError(w, http.StatusInternalServerError, "could not add player")
		}
		return
	}
	writeJSON(w, http.StatusCreated, toPlayerResp(player))
}

func (h *Handler) GetPlayer(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	playerID, err := uuidParam(r, "playerID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	player, err := h.store.GetPlayer(r.Context(), playerID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}
	if player.SessionID != sessionID {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, toPlayerResp(player))
}

func (h *Handler) UpdatePlayer(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	playerID, err := uuidParam(r, "playerID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	session, err := h.store.GetSession(r.Context(), sessionID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}
	if !requireAdmin(r, session.AdminToken) {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}
	if !session.IsActive {
		writeError(w, http.StatusForbidden, "Session is deactivated.")
		return
	}

	var body struct {
		Name   *string `json:"name"`
		SitOut *bool   `json:"sit_out"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	player, err := h.store.UpdatePlayer(r.Context(), store.UpdatePlayerParams{
		ID:     playerID,
		Name:   body.Name,
		SitOut: body.SitOut,
	})
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not update player")
		}
		return
	}
	if player.SessionID != sessionID {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	// Notify the specific player when they're set to sit out.
	if body.SitOut != nil && *body.SitOut {
		go h.pushClient.SendToSession(r.Context(), sessionID, push.SendOptions{
			Payload: map[string]any{},
			PerPlayer: map[string]map[string]any{
				playerID.String(): {
					"title": session.Name,
					"body":  "You're sitting out. Let the host know when you're ready to re-join!",
					"url":   "/session/" + sessionID.String(),
				},
			},
			RestrictTo: map[string]struct{}{playerID.String(): {}},
		})
	}

	writeJSON(w, http.StatusOK, toPlayerResp(player))
}

func (h *Handler) DeletePlayer(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	playerID, err := uuidParam(r, "playerID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	session, err := h.store.GetSession(r.Context(), sessionID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}
	if !requireAdmin(r, session.AdminToken) {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}
	if !session.IsActive {
		writeError(w, http.StatusForbidden, "Session is deactivated.")
		return
	}

	player, err := h.store.GetPlayer(r.Context(), playerID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}
	if player.SessionID != sessionID {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	// Append to removed_players before deleting.
	var removed map[string]string
	if len(session.RemovedPlayers) > 0 {
		json.Unmarshal(session.RemovedPlayers, &removed)
	}
	if removed == nil {
		removed = make(map[string]string)
	}
	removed[playerID.String()] = player.Name
	newRemovedJSON, _ := json.Marshal(removed)
	if err := h.store.SetRemovedPlayers(r.Context(), sessionID, newRemovedJSON); err != nil {
		writeError(w, http.StatusInternalServerError, "error updating session")
		return
	}

	if err := h.store.DeletePlayer(r.Context(), playerID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete player")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SetPartner(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	playerID, err := uuidParam(r, "playerID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	session, err := h.store.GetSession(r.Context(), sessionID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}
	if !requireAdmin(r, session.AdminToken) {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}
	if !session.IsActive {
		writeError(w, http.StatusForbidden, "Session is deactivated.")
		return
	}

	var body struct {
		PartnerID *uuid.UUID `json:"partner_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	player, err := h.store.GetPlayer(r.Context(), playerID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusInternalServerError, "error")
		}
		return
	}
	if player.SessionID != sessionID {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	if body.PartnerID != nil && *body.PartnerID == playerID {
		writeError(w, http.StatusBadRequest, "Cannot partner with self.")
		return
	}

	err = h.store.WithTx(r.Context(), func(q *store.Queries) error {
		if body.PartnerID == nil {
			// Remove partnership both ways.
			if player.PermanentPartnerID != nil {
				if err := q.ClearPartner(r.Context(), *player.PermanentPartnerID); err != nil {
					return err
				}
			}
			return q.ClearPartner(r.Context(), playerID)
		}

		// Verify partner is in the same session.
		partner, err := q.GetPlayer(r.Context(), *body.PartnerID)
		if err != nil {
			return err
		}
		if partner.SessionID != sessionID {
			return errNotInSession
		}

		// Clear existing partnerships before setting new ones.
		if player.PermanentPartnerID != nil {
			if err := q.ClearPartner(r.Context(), *player.PermanentPartnerID); err != nil {
				return err
			}
		}
		if partner.PermanentPartnerID != nil {
			if err := q.ClearPartner(r.Context(), *partner.PermanentPartnerID); err != nil {
				return err
			}
		}
		if err := q.SetPartner(r.Context(), playerID, *body.PartnerID); err != nil {
			return err
		}
		return q.SetPartner(r.Context(), *body.PartnerID, playerID)
	})

	if err == errNotInSession {
		writeError(w, http.StatusBadRequest, "partner not in this session")
		return
	}
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "player not found")
		} else {
			writeError(w, http.StatusInternalServerError, "could not set partner")
		}
		return
	}

	// Reload with updated partner info.
	updated, err := h.store.GetPlayer(r.Context(), playerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error reloading player")
		return
	}
	writeJSON(w, http.StatusOK, toPlayerResp(updated))
}

var errNotInSession = &appError{"partner not in this session"}

type appError struct{ msg string }

func (e *appError) Error() string { return e.msg }

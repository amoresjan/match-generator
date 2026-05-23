package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"github.com/amoresjan/match-generator/backend/internal/push"
	"github.com/amoresjan/match-generator/backend/internal/store"
)

func (h *Handler) CreateSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name           string `json:"name"`
		MatchType      string `json:"match_type"`
		NumCourts      *int   `json:"num_courts"`
		GenerationMode string `json:"generation_mode"`
		SportType      string `json:"sport_type"`
		SessionMode    string `json:"session_mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	matchType := or(body.MatchType, "2v2")
	genMode := or(body.GenerationMode, "fair")
	sportType := or(body.SportType, "pickleball")
	sessMode := or(body.SessionMode, "rotation")
	numCourts := 1
	if body.NumCourts != nil {
		numCourts = *body.NumCourts
	}

	session, err := h.store.CreateSession(r.Context(), store.CreateSessionParams{
		ID:             uuid.New(),
		AdminToken:     uuid.New(),
		Name:           body.Name,
		MatchType:      matchType,
		NumCourts:      numCourts,
		GenerationMode: genMode,
		SportType:      sportType,
		SessionMode:    sessMode,
	})
	if err != nil {
		writeServerError(w, "could not create session", err)
		return
	}

	resp := createSessionResp{
		sessionResp: toSessionResp(session, nil, nil),
		AdminToken:  session.AdminToken,
	}
	if resp.Players == nil {
		resp.Players = []playerResp{}
	}
	if resp.Rounds == nil {
		resp.Rounds = []roundResp{}
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuidParam(r, "sessionID")
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	var sinceRound *int
	if s := r.URL.Query().Get("since_round"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil {
			writeError(w, http.StatusBadRequest, "since_round must be an integer")
			return
		}
		sinceRound = &n
	}

	session, err := h.store.GetSession(r.Context(), sessionID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeServerError(w, "error fetching session", err)
		}
		return
	}

	players, err := h.store.GetPlayersForSession(r.Context(), sessionID)
	if err != nil {
		writeServerError(w, "error fetching players", err)
		return
	}

	rounds, err := h.store.GetRoundsWithMatches(r.Context(), sessionID, sinceRound)
	if err != nil {
		writeServerError(w, "error fetching rounds", err)
		return
	}

	resp := toSessionResp(session, players, rounds)
	if resp.Players == nil {
		resp.Players = []playerResp{}
	}
	if resp.Rounds == nil {
		resp.Rounds = []roundResp{}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) UpdateSession(w http.ResponseWriter, r *http.Request) {
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
			writeServerError(w, "error fetching session", err)
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
		Name           *string `json:"name"`
		MatchType      *string `json:"match_type"`
		NumCourts      *int    `json:"num_courts"`
		GenerationMode *string `json:"generation_mode"`
		SportType      *string `json:"sport_type"`
		SessionMode    *string `json:"session_mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	updated, err := h.store.UpdateSession(r.Context(), store.UpdateSessionParams{
		ID:             sessionID,
		Name:           body.Name,
		MatchType:      body.MatchType,
		NumCourts:      body.NumCourts,
		GenerationMode: body.GenerationMode,
		SportType:      body.SportType,
		SessionMode:    body.SessionMode,
	})
	if err != nil {
		writeServerError(w, "could not update session", err)
		return
	}

	players, _ := h.store.GetPlayersForSession(r.Context(), sessionID)
	rounds, _ := h.store.GetRoundsWithMatches(r.Context(), sessionID, nil)
	resp := toSessionResp(updated, players, rounds)
	if resp.Players == nil {
		resp.Players = []playerResp{}
	}
	if resp.Rounds == nil {
		resp.Rounds = []roundResp{}
	}
	h.hub.Notify(sessionID)
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) SetSessionActive(w http.ResponseWriter, r *http.Request) {
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
			writeServerError(w, "error", err)
		}
		return
	}
	if !requireAdmin(r, session.AdminToken) {
		writeError(w, http.StatusForbidden, "Forbidden")
		return
	}

	var body struct {
		IsActive *bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.IsActive == nil {
		writeError(w, http.StatusBadRequest, "is_active must be a boolean")
		return
	}

	if *body.IsActive && session.AutoDeactivated {
		writeError(w, http.StatusForbidden, "Cannot reactivate an auto-deactivated session.")
		return
	}

	if err := h.store.SetSessionActive(r.Context(), sessionID, *body.IsActive); err != nil {
		writeServerError(w, "could not update session", err)
		return
	}

	if !*body.IsActive {
		go h.pushClient.SendToSession(r.Context(), sessionID, push.SendOptions{
			Payload: map[string]any{
				"title": session.Name,
				"body":  "This session has been closed.",
				"url":   "/session/" + sessionID.String(),
			},
		})
	}

	session.IsActive = *body.IsActive
	players, _ := h.store.GetPlayersForSession(r.Context(), sessionID)
	rounds, _ := h.store.GetRoundsWithMatches(r.Context(), sessionID, nil)
	resp := toSessionResp(session, players, rounds)
	if resp.Players == nil {
		resp.Players = []playerResp{}
	}
	if resp.Rounds == nil {
		resp.Rounds = []roundResp{}
	}
	h.hub.Notify(sessionID)
	writeJSON(w, http.StatusOK, resp)
}

// ---- helpers ----------------------------------------------------------------

func or(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

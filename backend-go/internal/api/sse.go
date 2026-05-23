package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

const heartbeatInterval = 15 * time.Second

func (h *Handler) SessionEvents(w http.ResponseWriter, r *http.Request) {
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

	rc := http.NewResponseController(w)

	// Clear both deadlines: ReadTimeout fires when the client sends no more data
	// (always true for SSE), and WriteTimeout would kill the long-lived response.
	if err := rc.SetReadDeadline(time.Time{}); err != nil {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	if err := rc.SetWriteDeadline(time.Time{}); err != nil {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // prevents nginx/Railway from buffering the stream

	updates, unsub := h.hub.Subscribe(sessionID)
	defer func() {
		unsub()
		// Broadcast decremented count to remaining subscribers.
		h.hub.NotifyWithPayload(sessionID, onlinePayload(h.hub, sessionID))
	}()

	// Broadcast new count to all subscribers (including this one).
	h.hub.NotifyWithPayload(sessionID, onlinePayload(h.hub, sessionID))

	// Initial ping so the client knows the connection is established.
	fmt.Fprint(w, ": connected\n\n")
	rc.Flush()

	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-updates:
			if msg.payload != nil {
				// Carry the payload so the client can patch its cache without
				// a follow-up GET /session round-trip.
				fmt.Fprintf(w, "event: update\ndata: %s\n\n", msg.payload)
			} else {
				fmt.Fprint(w, "event: update\ndata: {}\n\n")
			}
			rc.Flush()
		case <-heartbeat.C:
			fmt.Fprint(w, ": heartbeat\n\n")
			rc.Flush()
		}
	}
}

// onlinePayload builds the {"online": N} SSE payload for a session.
func onlinePayload(h *Hub, sessionID uuid.UUID) []byte {
	count := h.ConnectedCount(sessionID)
	payload, _ := json.Marshal(map[string]any{"online": count})
	return payload
}

package api

import (
	"fmt"
	"net/http"
	"time"
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
	defer unsub()

	// Initial ping so the client knows the connection is established.
	fmt.Fprint(w, ": connected\n\n")
	rc.Flush()

	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-updates:
			fmt.Fprint(w, "event: update\ndata: {}\n\n")
			rc.Flush()
		case <-heartbeat.C:
			fmt.Fprint(w, ": heartbeat\n\n")
			rc.Flush()
		}
	}
}

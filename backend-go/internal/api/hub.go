package api

import (
	"sync"

	"github.com/google/uuid"
)

// hubMsg is the value sent through subscriber channels.
// payload is the JSON bytes to embed in the SSE data field.
// A nil payload means "something changed — refetch" (no inline data).
type hubMsg struct {
	payload []byte
}

// Hub broadcasts session-change events to connected SSE clients.
type Hub struct {
	mu   sync.RWMutex
	subs map[uuid.UUID][]chan hubMsg
}

func newHub() *Hub {
	return &Hub{subs: make(map[uuid.UUID][]chan hubMsg)}
}

// Subscribe registers a listener for the given session. Returns a receive
// channel and an unsubscribe function; the caller must call unsubscribe when done.
func (h *Hub) Subscribe(sessionID uuid.UUID) (<-chan hubMsg, func()) {
	ch := make(chan hubMsg, 1)

	h.mu.Lock()
	h.subs[sessionID] = append(h.subs[sessionID], ch)
	h.mu.Unlock()

	unsub := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		sl := h.subs[sessionID]
		for i, c := range sl {
			if c == ch {
				h.subs[sessionID] = append(sl[:i], sl[i+1:]...)
				break
			}
		}
		if len(h.subs[sessionID]) == 0 {
			delete(h.subs, sessionID)
		}
		close(ch)
	}
	return ch, unsub
}

// Notify signals all listeners that the session changed.
// The client will receive an empty payload and must do a full refetch.
func (h *Hub) Notify(sessionID uuid.UUID) {
	h.broadcast(sessionID, nil)
}

// NotifyWithPayload sends payload to all listeners for the given session.
// Clients that receive a non-nil payload can apply it directly to their local
// cache without a follow-up GET /session round-trip.
func (h *Hub) NotifyWithPayload(sessionID uuid.UUID, payload []byte) {
	h.broadcast(sessionID, payload)
}

func (h *Hub) broadcast(sessionID uuid.UUID, payload []byte) {
	msg := hubMsg{payload: payload}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.subs[sessionID] {
		select {
		case ch <- msg:
		default:
		}
	}
}

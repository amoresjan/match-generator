package api

import (
	"sync"

	"github.com/google/uuid"
)

// Hub broadcasts session-change signals to connected SSE clients.
type Hub struct {
	mu   sync.RWMutex
	subs map[uuid.UUID][]chan struct{}
}

func newHub() *Hub {
	return &Hub{subs: make(map[uuid.UUID][]chan struct{})}
}

// Subscribe registers a listener for the given session. Returns a receive
// channel and an unsubscribe function; the caller must call unsubscribe when done.
func (h *Hub) Subscribe(sessionID uuid.UUID) (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)

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

// Notify sends a signal to all listeners for the given session.
// Non-blocking: listeners that already have a pending signal are skipped.
func (h *Hub) Notify(sessionID uuid.UUID) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.subs[sessionID] {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

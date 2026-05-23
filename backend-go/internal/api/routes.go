package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/amoresjan/match-generator/backend/internal/push"
	"github.com/amoresjan/match-generator/backend/internal/store"
)

// Handler holds all handler dependencies.
type Handler struct {
	store      *store.Store
	pushClient *push.Client
	vapidPub   string
}

// NewHandler wires all dependencies.
func NewHandler(s *store.Store, p *push.Client, vapidPub string) *Handler {
	return &Handler{store: s, pushClient: p, vapidPub: vapidPub}
}

// Router builds and returns the chi router.
func (h *Handler) Router(allowedOrigins string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware(allowedOrigins))

	r.Route("/api", func(r chi.Router) {
		r.Get("/vapid-public-key/", h.VapidPublicKey)

		r.Route("/sessions", func(r chi.Router) {
			r.Post("/", h.CreateSession)
			r.Get("/{sessionID}/", h.GetSession)
			r.Patch("/{sessionID}/update/", h.UpdateSession)
			r.Patch("/{sessionID}/active/", h.SetSessionActive)
			r.Post("/{sessionID}/players/", h.AddPlayer)
			r.Get("/{sessionID}/players/{playerID}/", h.GetPlayer)
			r.Patch("/{sessionID}/players/{playerID}/", h.UpdatePlayer)
			r.Delete("/{sessionID}/players/{playerID}/", h.DeletePlayer)
			r.Post("/{sessionID}/players/{playerID}/partner/", h.SetPartner)
			r.Post("/{sessionID}/generate/", h.GenerateRound)
			r.Patch("/{sessionID}/matches/{matchID}/override/", h.OverrideMatch)
			r.Patch("/{sessionID}/matches/{matchID}/result/", h.SetMatchResult)
			r.Get("/{sessionID}/preview-rounds/", h.PreviewRounds)
			r.Post("/{sessionID}/push-subscribe/", h.PushSubscribe)
			r.Post("/{sessionID}/push-unsubscribe/", h.PushUnsubscribe)
			r.Post("/{sessionID}/tournament/setup/", h.TournamentSetup)
			r.Post("/{sessionID}/tournament/advance/", h.TournamentAdvance)
		})
	})

	return r
}

package push

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"

	"github.com/amoresjan/match-generator/backend/internal/store"
)

const sendTimeout = 10 * time.Second

// SendOptions carries the push payload and optional per-player customisation.
// This preserves Django's player_payloads / restrict_player_ids semantics.
type SendOptions struct {
	// Default payload sent to every subscription unless overridden.
	Payload map[string]any
	// Per-player overrides keyed by player UUID string.
	PerPlayer map[string]map[string]any
	// When non-nil, only subscriptions whose player_id is in this set receive a message.
	RestrictTo map[string]struct{}
}

// Client sends VAPID-signed Web Push messages.
type Client struct {
	privateKey string
	publicKey  string
	subscriber string // "mailto:..."
	store      *store.Store
}

// New creates a push client. privateKey/publicKey are raw VAPID keys.
func New(privateKey, publicKey, subscriberEmail string, s *store.Store) *Client {
	return &Client{
		privateKey: privateKey,
		publicKey:  publicKey,
		subscriber: "mailto:" + subscriberEmail,
		store:      s,
	}
}

// IsConfigured reports whether VAPID keys are present.
func (c *Client) IsConfigured() bool {
	return c.privateKey != "" && c.publicKey != ""
}

// SendToSession fans out a push message to all subscriptions for the given session.
// Stale subscriptions (HTTP 410) are deleted automatically.
// Each push fires in a goroutine; the method waits for all to finish.
// Safe to call in a goroutine — it uses its own context so the caller's request
// context being cancelled doesn't abort the DB fetch or the push sends.
func (c *Client) SendToSession(_ context.Context, sessionID uuid.UUID, opts SendOptions) {
	if !c.IsConfigured() {
		return
	}

	// Detach from the caller's context: this is typically called in a goroutine
	// that outlives the HTTP handler, so r.Context() may already be cancelled.
	ctx, cancel := context.WithTimeout(context.Background(), sendTimeout)
	defer cancel()

	subs, err := c.store.GetPushSubsForSession(ctx, sessionID)
	if err != nil {
		slog.Warn("push: failed to fetch subscriptions", "err", err)
		return
	}

	var wg sync.WaitGroup
	for _, sub := range subs {
		if opts.RestrictTo != nil {
			if sub.PlayerID == nil {
				continue
			}
			if _, ok := opts.RestrictTo[sub.PlayerID.String()]; !ok {
				continue
			}
		}

		payload := opts.Payload
		if opts.PerPlayer != nil && sub.PlayerID != nil {
			if pp, ok := opts.PerPlayer[sub.PlayerID.String()]; ok {
				payload = pp
			}
		}

		data, err := json.Marshal(payload)
		if err != nil {
			continue
		}

		sub := sub // capture loop variable
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := c.send(ctx, sub, data); err != nil {
				if isGone(err) {
					if delErr := c.store.DeletePushSubByID(context.Background(), sub.ID); delErr != nil {
						slog.Warn("push: failed to delete stale subscription", "err", delErr)
					}
				} else {
					slog.Warn("push: send failed", "endpoint", sub.Endpoint, "err", err)
				}
			}
		}()
	}
	wg.Wait()
}

func (c *Client) send(ctx context.Context, sub store.PushSubscription, data []byte) error {
	resp, err := webpush.SendNotification(data, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.P256DH,
			Auth:   sub.Auth,
		},
	}, &webpush.Options{
		VAPIDPublicKey:  c.publicKey,
		VAPIDPrivateKey: c.privateKey,
		Subscriber:      c.subscriber,
		TTL:             30,
	})
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode == http.StatusGone || resp.StatusCode == http.StatusNotFound {
		return &goneError{status: resp.StatusCode}
	}
	return nil
}

func isGone(err error) bool {
	_, ok := err.(*goneError)
	return ok
}

type goneError struct{ status int }

func (e *goneError) Error() string { return http.StatusText(e.status) }


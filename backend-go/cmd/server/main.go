package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/amoresjan/match-generator/backend/internal/api"
	"github.com/amoresjan/match-generator/backend/internal/push"
	"github.com/amoresjan/match-generator/backend/internal/store"
)

func main() {
	// Load .env in development; ignore error in production.
	_ = godotenv.Load()

	dbURL := mustEnv("DATABASE_URL")
	port := envOr("PORT", "8000")
	allowedOrigins := envOr("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
	vapidPriv := os.Getenv("VAPID_PRIVATE_KEY")
	vapidPub := os.Getenv("VAPID_PUBLIC_KEY")
	vapidEmail := os.Getenv("VAPID_CLAIMS_EMAIL")

	// Run migrations.
	if err := runMigrations(dbURL); err != nil {
		slog.Error("migration failed", "err", err)
		os.Exit(1)
	}

	// Connect.
	ctx, cancelCtx := context.WithCancel(context.Background())
	defer cancelCtx()

	poolCfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		slog.Error("db config parse failed", "err", err)
		os.Exit(1)
	}
	poolCfg.MinConns = 2  // keep warm connections; avoids TCP+TLS handshake on first request after idle
	poolCfg.MaxConns = 10 // headroom for concurrent requests

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		slog.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		slog.Error("db ping failed", "err", err)
		os.Exit(1)
	}
	slog.Info("database connected")

	s := store.NewStore(pool)
	pushClient := push.New(vapidPriv, vapidPub, vapidEmail, s)
	h := api.NewHandler(s, pushClient, vapidPub)
	router := h.Router(allowedOrigins)

	// Start background cleanup for the per-IP rate limiter store.
	api.StartLimiterCleanup(ctx)

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine so we can listen for shutdown signals.
	go func() {
		slog.Info("server starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	// Background job: deactivate sessions inactive for 24 h.
	jobDone := make(chan struct{})
	go func() {
		defer close(jobDone)
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		// Run once immediately at startup, then on each tick.
		deactivateInactiveSessions(ctx, s, pushClient)
		for {
			select {
			case <-ticker.C:
				deactivateInactiveSessions(ctx, s, pushClient)
			case <-ctx.Done():
				return
			}
		}
	}()

	// Graceful shutdown on SIGTERM/SIGINT (Railway sends SIGTERM).
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("shutting down...")

	cancelCtx() // stop the background job
	<-jobDone

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "err", err)
	}
	slog.Info("server stopped")
}

func runMigrations(dbURL string) error {
	m, err := migrate.New("file://migrations", dbURL)
	if err != nil {
		return fmt.Errorf("migrate init: %w", err)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate up: %w", err)
	}
	slog.Info("migrations applied")
	return nil
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var not set", "key", key)
		os.Exit(1)
	}
	return v
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func deactivateInactiveSessions(ctx context.Context, s *store.Store, pushClient *push.Client) {
	cutoff := time.Now().Add(-24 * time.Hour)
	sessions, err := s.GetStaleSessions(ctx, cutoff)
	if err != nil {
		slog.Error("deactivate job: query failed", "err", err)
		return
	}
	if len(sessions) == 0 {
		return
	}

	ids := make([]uuid.UUID, len(sessions))
	for i, sess := range sessions {
		ids[i] = sess.ID
		pushClient.SendToSession(ctx, sess.ID, push.SendOptions{
			Payload: map[string]any{
				"title": sess.Name,
				"body":  "This session was closed automatically after 24h of inactivity.",
				"url":   "/session/" + sess.ID.String(),
			},
		})
	}

	count, err := s.DeactivateSessionsBatch(ctx, ids)
	if err != nil {
		slog.Error("deactivate job: update failed", "err", err)
		return
	}
	slog.Info("deactivate job: sessions deactivated", "count", count)
}

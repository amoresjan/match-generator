# Go Migration Design

**Date:** 2026-05-23  
**Scope:** Full rewrite of `backend/` (Django) → `backend-go/` (Go)  
**Goal:** Learning Go through a real project; Django stays untouched until Go is complete

---

## 1. Strategy

- Build the Go backend in `backend-go/` alongside the existing `backend/` directory
- The two backends share the same PostgreSQL database and schema
- Frontend (`frontend/`) is unchanged — it talks to whichever backend is active
- Cut-over: deploy Go to Railway as a new service → update `VITE_API_URL` on Vercel → decommission Django

---

## 2. Toolchain

| Tool | Purpose |
|---|---|
| `go-chi/chi/v5` | HTTP routing |
| `jackc/pgx/v5` + `pgxpool` | PostgreSQL driver + connection pool |
| `sqlc-dev/sqlc` | Dev tool — generates typed Go from `.sql` query files |
| `golang-migrate/migrate/v4` | Schema migrations from `migrations/*.sql` |
| `google/uuid` | UUID generation and parsing |
| `SherClockHolmes/webpush-go` | VAPID Web Push notifications |

Go version: 1.23+

---

## 3. Project Layout

```
backend-go/
  cmd/
    server/
      main.go              ← env loading, pool init, migrate, wire router, start server

  internal/
    api/
      routes.go            ← chi router registration, Handler struct
      sessions.go          ← CreateSession, GetSession, UpdateSession, SetSessionActive
      players.go           ← AddPlayer, GetPlayer, UpdatePlayer, DeletePlayer, SetPartner
      rounds.go            ← GenerateRound, OverrideMatch, SetMatchResult, PreviewRounds
      push.go              ← PushSubscribe, PushUnsubscribe, VapidPublicKey
      tournament.go        ← TournamentSetup, TournamentAdvance
      middleware.go        ← CORS, admin token extraction
      helpers.go           ← writeJSON, writeError, requireAdmin, requireActive

    store/
      db.go                ← Store struct, New(pool) constructor
      queries/
        sessions.sql
        players.sql
        rounds.sql
        matches.sql
        history.sql
        push.sql
      *.go                 ← sqlc-generated (never edit manually)

    generator/
      types.go             ← GeneratedRound, CourtAssignment, History structs
      history.go           ← BuildHistory, SimulateHistoryUpdate, CopyHistory
      cost.go              ← TeamPairCost, MatchupCost, WaitBonus, MatchCost
      pairing.go           ← EnumeratePairings, PairSingles, SelectByes2v2
      rng.go               ← newSeededRNG(sessionID, roundNumber) *rand.Rand
      generator.go         ← GenerateRound, PreviewRounds, CommitRound (owns DB transaction)

    tournament/
      types.go             ← Bracket, TournamentMatch, Team structs
      tournament.go        ← BuildBracket, AdvanceBracket, RandomizeTeams

    push/
      push.go              ← Client struct, SendToSession, send, isGone

  migrations/
    000001_initial.sql
    000002_add_match_winner.sql
    ... (one file per Django migration, translated to plain SQL)

  go.mod
  go.sum
  sqlc.yaml              ← sqlc config (points to internal/store/queries/, outputs to internal/store/)
  Dockerfile
```

---

## 4. API Endpoints

All endpoints are identical to the Django backend:

```
POST   /api/sessions/
GET    /api/sessions/{sessionID}/                        ?since_round=N
PATCH  /api/sessions/{sessionID}/update/
PATCH  /api/sessions/{sessionID}/active/
POST   /api/sessions/{sessionID}/players/
GET    /api/sessions/{sessionID}/players/{playerID}/
PATCH  /api/sessions/{sessionID}/players/{playerID}/
DELETE /api/sessions/{sessionID}/players/{playerID}/
POST   /api/sessions/{sessionID}/players/{playerID}/partner/
POST   /api/sessions/{sessionID}/generate/
PATCH  /api/sessions/{sessionID}/matches/{matchID}/override/
PATCH  /api/sessions/{sessionID}/matches/{matchID}/result/
GET    /api/sessions/{sessionID}/preview-rounds/
POST   /api/sessions/{sessionID}/push-subscribe/
POST   /api/sessions/{sessionID}/push-unsubscribe/
POST   /api/sessions/{sessionID}/tournament/setup/
POST   /api/sessions/{sessionID}/tournament/advance/
GET    /api/vapid-public-key/
```

---

## 5. Database Layer (store)

sqlc generates typed Go functions from `.sql` query files. No ORM — you write SQL, sqlc gives you Go.

**Key type mappings:**

| Django | PostgreSQL | Go |
|---|---|---|
| `UUIDField` | `uuid` | `uuid.UUID` |
| `CharField` / `TextField` | `text` / `varchar` | `string` |
| `BooleanField` | `boolean` | `bool` |
| `DateTimeField` | `timestamptz` | `time.Time` |
| `JSONField` (list of UUIDs) | `jsonb` | `[]string` |
| `JSONField` (dict) | `jsonb` | `map[string]string` |
| nullable field | `... NULL` | pointer (`*string`, `*uuid.UUID`) |

**Transaction pattern** — `CommitRound` in `internal/generator/generator.go` owns the transaction boundary. It uses `SELECT FOR UPDATE` on the session row to prevent duplicate round numbers under concurrent requests, then inserts the round, matches, and `PlayerRoundHistory` rows atomically via pgx.

**Migrations** — `golang-migrate` runs on startup from `migrations/`. Each file is named `NNNNNN_<description>.up.sql` / `NNNNNN_<description>.down.sql`. The initial migration translates the final Django schema state into plain `CREATE TABLE` SQL, so the Go backend can be used against a fresh database or alongside an existing Django-managed one.

---

## 6. API Layer (api)

**Handler struct** — dependencies injected at startup:
```go
type Handler struct {
    store     *store.Store
    push      *push.Client
    vapidKeys VapidKeys
}
```

**Middleware:**
- `cors` — reads `ALLOWED_ORIGINS` env var, sets CORS headers for the Vercel frontend
- Admin auth — `requireAdmin(r *http.Request, session store.Session) error` compares `X-Admin-Token` header to `session.AdminToken`; called inside handlers that need it
- `requireActive(session store.Session) error` — returns an error when `session.IsActive` is false

**Error convention:**
- `writeJSON(w, status, v)` — marshals any value to JSON
- `writeError(w, status, message)` — writes `{"detail": message}`
- Every handler returns early on error — no panic, no exception, explicit `if err != nil` checks throughout

**Simple CRUD handlers** call `store` directly. Complex handlers (`GenerateRound`, `OverrideMatch`, `TournamentAdvance`) call into `generator` or `tournament` packages.

---

## 7. Generator Package

The match generation algorithm is a direct port of `backend/sessions_app/services/match_generator.py`.

**Types** (`types.go`):
```go
type CourtAssignment struct {
    Court int
    Team1 []string
    Team2 []string
}

type GeneratedRound struct {
    RoundNumber int
    Courts      []CourtAssignment
    ByePlayers  []string
}

type History struct {
    Partner      map[string]map[string]int
    Opponent     map[string]map[string]int
    LastOppRound map[string]map[string]int
    Wait         map[string]int
    LastSatOut   map[string]int
    LastPlayed   map[string]int
}
```

**RNG** (`rng.go`): Python's thread-local seeded RNG becomes a `*rand.Rand` created per `GenerateRound` call and passed explicitly through the call stack. Same seed derivation: `md5(sessionID + ":" + roundNumber)` → `uint64` seed.

```go
func newSeededRNG(sessionID uuid.UUID, roundNumber int) *rand.Rand {
    key := fmt.Sprintf("%s:%d", sessionID, roundNumber)
    h := md5.Sum([]byte(key))
    seed := binary.BigEndian.Uint64(h[:8])
    return rand.New(rand.NewSource(int64(seed)))
}
```

**Algorithm translation notes:**
- Python list comprehensions → explicit `for` loops
- `defaultdict(lambda: defaultdict(int))` → `map[string]map[string]int` with a `getInt(m, k)` helper that returns 0 for missing keys
- `itertools.combinations` → nested loop
- `itertools.permutations` / `_enumerate_pairings` → recursive Go function, identical logic
- Cost weights (`PARTNER_REPEAT_W`, `OPPONENT_REPEAT_W`, etc.) → package-level `const` block
- Greedy fallback threshold (`PAIRING_ENUM_LIMIT = 12`) → same constant

**`CommitRound`** lives in `generator/generator.go` (not in `store`) because it owns the transaction and the round number race condition. It calls store functions for individual inserts but holds the `pgx.Tx`.

**Dependency direction:** `api` → `generator` → `store` → `pgx`. `api` also calls `store` directly for simple CRUD. `tournament` and `push` are standalone — they do not import each other or `generator`.

---

## 8. Tournament Package

Direct port of `backend/sessions_app/services/tournament_generator.py`. Pure computation — no DB calls inside the package itself.

The `tournament_data` JSON blob is serialized as `map[string]any` and stored in `sessions.tournament_data` (jsonb column). API handlers in `internal/api/tournament.go` call `tournament.BuildBracket(...)` / `tournament.AdvanceBracket(...)` and persist via `store.UpdateSessionTournamentData(...)`.

---

## 9. Push Package

`webpush-go` is a direct equivalent of `pywebpush`. Fan-out uses goroutines:

```go
func (c *Client) SendToSession(ctx context.Context, subs []store.PushSubscription, payload []byte) {
    var wg sync.WaitGroup
    for _, sub := range subs {
        wg.Add(1)
        go func(s store.PushSubscription) {
            defer wg.Done()
            if err := c.send(ctx, s, payload); err != nil && isGone(err) {
                c.store.DeletePushSubscription(ctx, s.ID)
            }
        }(sub)
    }
    wg.Wait()
}
```

VAPID keys loaded from `VAPID_PRIVATE_KEY` and `VAPID_PUBLIC_KEY` env vars at startup.

---

## 10. Deployment

**Dockerfile** (multi-stage):
```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o server ./cmd/server

FROM alpine:3.20
COPY --from=builder /app/server /server
COPY migrations/ /migrations/
ENTRYPOINT ["/server"]
```

**Railway:** points at `backend-go/Dockerfile`. Same env vars as Django service:
- `DATABASE_URL`
- `PORT`
- `VAPID_PRIVATE_KEY`
- `VAPID_PUBLIC_KEY`
- `ALLOWED_ORIGINS`

**Cut-over sequence:**
1. Deploy `backend-go` as a new Railway service (Django remains live)
2. Run smoke tests against the Go service
3. Update `VITE_API_URL` on Vercel to point at the Go service
4. Monitor for 24–48 hours
5. Decommission the Django service

---

## 11. Out of Scope

- `deactivate_inactive_sessions` management command — not ported; can be replaced with a cron job or Railway's scheduled jobs feature after cut-over
- WebSocket / live push (polling stays as-is at 15s interval)
- Any schema changes — Go backend uses the existing schema as-is

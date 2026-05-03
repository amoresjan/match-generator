# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pickleball Match Generator** — a full-stack web app that generates fair rotation matches for pickleball sessions (1v1 or 2v2). Hosts manage players/partnerships via an admin view; players see a read-only session view.

## Stack

- **Backend**: Django 4.2 + Django REST Framework, PostgreSQL (`backend/`)
- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui (`frontend/`)
- **Deploy**: Railway (backend), Vercel (frontend)

## Commands

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # fill in DATABASE_URL etc.
python manage.py migrate
python manage.py runserver    # http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local    # set VITE_API_URL
npm run dev                   # http://localhost:5173
npm run build
npm run lint
```

Vite proxies `/api` → `http://localhost:8000` in dev, so leave `VITE_API_URL` unset locally and the proxy handles it.

### Tests
```bash
cd backend
source env/bin/activate       # activate the venv

python run_tests.py           # run all 8 suites; exits 1 on any failure

# run a single suite
python test_2v2.py
python test_1v1.py
python test_rotation.py
python test_preview_accuracy.py
python test_competitive.py
python test_permanent_partners.py
python test_sit_out.py
python test_override.py
```

Tests hit the local database directly (no mocking); each suite creates and deletes its own sessions. Django settings are auto-loaded via `os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pickleball.settings')` at the top of each file.

## Architecture

### Backend (`backend/sessions_app/`)

**Models** (`models.py`):
- `Session` — owns players/rounds; has `admin_token` (UUID) for host auth; stores `match_type`, `num_courts`, and `generation_mode` (`'fair'` | `'competitive'`)
- `Player` — belongs to Session; `permanent_partner` is a self-referential OneToOne (symmetric — both sides must be set/cleared together); `sit_out=True` excludes the player from all generation and preview calls
- `Round` + `Match` — `Match.team1_players` / `team2_players` are JSON arrays of player UUID strings; `Match.winner` is `'team1'` | `'team2'` | `None`
- `PlayerRoundHistory` — per-player per-round record of partner/opponent UUIDs and sit-out status; the sole source of truth for the cost algorithm

**Auth strategy**: stateless UUID token. Hosts pass `X-Admin-Token: <token>` header (or `?admin_token=` query param). Token is returned once at session creation and stored in browser `localStorage`.

**Algorithm** (`services/match_generator.py`) — three public entry points:
- `generate_round(session)` → `GeneratedRound` dict (not persisted)
- `commit_round(session, generated)` → creates `Round`, `Match`, and `PlayerRoundHistory` rows in a transaction; increments `Player.total_wait_rounds` for bye players
- `preview_rounds(session, count=5)` → list of `GeneratedRound` dicts for upcoming rounds, using a seeded RNG (`session_id:round_number`) so that the same round always produces the same result given the same history; simulates history forward with `_simulate_history_update` between preview slots
- `reconcile_round_history(rnd)` → call after `override_match` to rewrite `PlayerRoundHistory` from current `Match` rows; also adjusts `Player.total_wait_rounds` when a player's sit-out status changes

Cost weights (fair mode):
- `PARTNER_REPEAT_W = 5.0` — penalises re-pairing same teammates
- `OPPONENT_REPEAT_W = 2.0` — penalises rematches
- `WAIT_ADVANTAGE_W = 3.0` — rewards giving long-waiting players a game

Competitive mode skips the cost-based opponent assignment and instead sorts teams by average win count (descending), pairing adjacent teams on each court.

Permanent-partner pairs are grouped before sit-out selection and treated as atomic units — they are never split and always sit out together.

**API endpoints** (`sessions_app/urls.py`, all under `/api/`):
```
POST   sessions/
GET    sessions/<id>/
PATCH  sessions/<id>/update/
POST   sessions/<id>/players/
GET/PATCH/DELETE  sessions/<id>/players/<id>/
POST   sessions/<id>/players/<id>/partner/
POST   sessions/<id>/generate/
POST   sessions/<id>/matches/<id>/override/
POST   sessions/<id>/matches/<id>/result/
GET    sessions/<id>/preview-rounds/
```

**Views** (`views.py`): all function-based `@api_view`. Admin endpoints check `_require_admin()` which compares the header token to `session.admin_token`.

### Frontend (`frontend/src/`)

**Routing**: `/` → `HomePage` (create/join), `/session/:sessionId` → `SessionPage`.

**Data fetching**: TanStack Query v5. All query/mutation hooks live in `hooks/useSession.ts`. `queryClient.ts` sets 30 s stale time. `SessionPage` polls every 15 s via `refetchInterval`.

**API layer** (`lib/api.ts`): thin wrapper around `fetch`. `getAdminToken(sessionId)` reads from `localStorage`; `saveAdminToken` is called after session creation. All admin API calls inject the token automatically.

**Admin detection**: `isAdmin(sessionId)` in `SessionPage` checks `localStorage` — no separate auth route. The admin UI (PlayerList, override button, Generate Round) is conditionally rendered.

**UI structure**:
- `SessionPage` — sticky header + 4-tab nav (Round / Players / History / Settings)
- `CurrentRound` — latest round's `CourtCard` grid + bye-player strip
- `CourtCard` — shows team1 vs team2; edit button triggers `OverrideMatchDialog`
- `OverrideMatchDialog` — tap-to-assign player grid for manual match overrides
- `UpcomingRounds` — preview of next N rounds fetched from `/preview-rounds/`
- `PlayerList` — add/rename/remove players + permanent partner Select (2v2 only)
- `RoundHistory` — collapsible past rounds
- `Leaderboard` — win/loss tallies in competitive mode
- `SessionSummaryCard` — compact session stats

**shadcn/ui components** in `components/ui/` are hand-authored (no CLI used); add new ones there following the same pattern.

## Key Invariants

- Permanent partnerships are **symmetric**: always set/clear both `player.permanent_partner` and `partner.permanent_partner` together (the view handles this; the model does not enforce it automatically).
- `Player.total_wait_rounds` is a denormalised counter incremented in `commit_round` and adjusted in `reconcile_round_history`; it shadows `PlayerRoundHistory` sit-out counts for display speed.
- `Match.team1_players` / `team2_players` store UUID **strings** (not UUID objects) — always `str(uuid)` before storing.
- `Player.sit_out=True` removes a player from generation and preview entirely — they appear in neither the active set nor `bye_players`.
- The Django app is named `sessions_app` in the filesystem (to avoid clashing with Django's built-in `sessions` app); the `INSTALLED_APPS` entry must match.
- After any manual match override, call `reconcile_round_history(rnd)` so that future rounds cost correctly against what actually happened.

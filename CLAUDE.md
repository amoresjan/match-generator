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

## Architecture

### Backend (`backend/sessions_app/`)

**Models** (`models.py`):
- `Session` — owns players/rounds; has `admin_token` (UUID) used for host auth; stores `match_type` and `num_courts`
- `Player` — belongs to Session; `permanent_partner` is a self-referential OneToOne (symmetric — both sides must be set/cleared together)
- `Round` + `Match` — `Match.team1_players` / `team2_players` are JSON arrays of player UUID strings
- `PlayerRoundHistory` — per-player per-round record of partner/opponent UUIDs and sit-out status; drives the cost algorithm

**Auth strategy**: stateless UUID token. Hosts pass `X-Admin-Token: <token>` header (or `?admin_token=` query param). Token is returned once at session creation and stored in browser `localStorage`.

**Algorithm** (`services/match_generator.py`):
- `generate_round(session)` → `GeneratedRound` (dict, not persisted yet)
- `commit_round(session, generated)` → saves `Round`, `Match`, and `PlayerRoundHistory` rows in a transaction

Cost function for choosing team/matchup combinations:
- `PARTNER_REPEAT_W = 5.0` — penalises re-pairing same teammates
- `OPPONENT_REPEAT_W = 2.0` — penalises rematches
- `WAIT_ADVANTAGE_W = 3.0` — rewards giving sit-out players a game
- Permanent-partner pairs are grouped first and treated as an atomic unit; they are never split for 2v2

**Views** (`views.py`): all function-based `@api_view`. Admin endpoints check `_require_admin()` which compares the header token to `session.admin_token`.

### Frontend (`frontend/src/`)

**Routing**: `/` → `HomePage` (create/join), `/session/:sessionId` → `SessionPage`.

**Data fetching**: TanStack Query v5. All query/mutation hooks live in `hooks/useSession.ts`. `queryClient.ts` sets 30 s stale time. `SessionPage` polls every 15 s via `refetchInterval`.

**API layer** (`lib/api.ts`): thin wrapper around `fetch`. `getAdminToken(sessionId)` reads from `localStorage`; `saveAdminToken` is called after session creation. All admin API calls inject the token automatically.

**Admin detection**: `isAdmin(sessionId)` in `SessionPage` checks `localStorage` — no separate auth route. The admin UI (PlayerList, override button, Generate Round) is conditionally rendered.

**UI structure**:
- `SessionPage` — sticky header + 4-tab nav (Round / Players / History / Settings)
- `CurrentRound` — renders latest round's `CourtCard` grid + bye-player strip
- `CourtCard` — shows team1 vs team2; edit button triggers `OverrideMatchDialog`
- `OverrideMatchDialog` — tap-to-assign player grid for manual match overrides
- `PlayerList` — add/rename/remove players + permanent partner Select (2v2 only)
- `RoundHistory` — collapsible past rounds

**shadcn/ui components** in `components/ui/` are hand-authored (no CLI used); add new ones there following the same pattern.

## Key Invariants

- Permanent partnerships are **symmetric**: always set/clear both `player.permanent_partner` and `partner.permanent_partner` together (the view handles this; the model does not enforce it automatically).
- `Player.total_wait_rounds` is a denormalised counter incremented in `commit_round`; it shadows `PlayerRoundHistory` sit-out counts for display speed.
- `Match.team1_players` / `team2_players` store UUID **strings** (not UUID objects) — always `str(uuid)` before storing.
- The Django app is named `sessions_app` in the filesystem (to avoid clashing with Django's built-in `sessions` app); the `INSTALLED_APPS` entry must match.

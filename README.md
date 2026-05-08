# Rally — Pickleball Match Generator

A mobile-first web app that generates fair, rotating matches for pickleball sessions. Hosts manage players and partnerships from an admin view; players follow along on a read-only session view.

## Features

- **1v1 and 2v2** match types
- **Fair rotation mode** — weighted cost system minimises repeat partners and opponents, distributes byes evenly over time
- **Competitive mode** — players are matched by win count; top players face top players, bottom face bottom
- **Permanent partners** — link two players so they always share a team in 2v2; unlink at any time
- **Sit-out toggle** — mark any player as sitting out mid-session; duo partners get a prompt to sit out together or separately
- **Upcoming rounds preview** — see the next 5 projected rounds before committing
- **Match result tracking** — tap a team to mark them as winner; results feed into the leaderboard
- **Leaderboard** — win/loss standings with hot streak detection (3+ consecutive wins)
- **Round history** — collapsible past rounds with result editing
- **Manual overrides** — host can edit any court assignment after generation
- **Retained player names** — removed players still appear by name in past round history
- **Co-host support** — share the admin code with others to grant host access
- **Web push notifications** — subscribers are notified when a new round is generated or the session closes; iOS 16.4+ supported in standalone/PWA mode
- **Session deactivation** — hosts can manually close a session; sessions with no activity for 24 hours are auto-closed by a cron job
- **Onboarding wizard** — first-time guests and newly-unlocked co-hosts are walked through the UI
- **Dark mode**
- **UUID-based host auth** — no accounts needed; admin token stored in `localStorage`
- **Public session view** — share the session URL with players for a read-only view

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite · React 18 · TypeScript · Tailwind CSS · shadcn/ui · TanStack Query v5 |
| Backend | Django 4.2 · Django REST Framework · SQLite (dev) · PostgreSQL (prod) |
| Deployment | Vercel (frontend) · Railway (backend) |

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+

### Backend

```bash
cd backend
python3 -m venv env
source env/bin/activate        # Windows: env\Scripts\activate
pip install -r requirements.txt

cp .env.example .env           # edit as needed
python manage.py migrate
python manage.py runserver
```

The API is available at `http://localhost:8000/api/`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # set VITE_API_URL if not using the proxy
npm run dev
```

The app is available at `http://localhost:5173`. In dev, Vite proxies `/api` → `http://localhost:8000` so no `VITE_API_URL` is needed locally.

## Environment Variables

### Backend (`.env`)

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | insecure dev key | Django secret key |
| `DEBUG` | `True` | Set to `False` in production |
| `DATABASE_URL` | *(unset → SQLite)* | PostgreSQL URL for production |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated allowed hosts |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated frontend origins |
| `VAPID_PRIVATE_KEY` | *(unset)* | VAPID private key for web push (generate with `scripts/generate_vapid_keys.py`) |
| `VAPID_PUBLIC_KEY` | *(unset)* | VAPID public key — must match the private key |
| `VAPID_CLAIMS_EMAIL` | *(unset)* | Contact email included in VAPID JWT claims |

### Frontend (`.env.local`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(unset → `/api` proxy)* | Backend API base URL for production |

## Deployment

### Backend → Railway

1. Create a new Railway project and add a **PostgreSQL** plugin.
2. Set environment variables: `SECRET_KEY`, `DEBUG=False`, `DATABASE_URL` (auto-set by Railway), `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_CLAIMS_EMAIL`.
3. Push the `backend/` directory. Railway uses `railway.json` to run migrations and start gunicorn automatically.
4. Add a second Railway service (cron) pointing at the same repo with `railway.cron.json` as its config. This runs `python manage.py deactivate_inactive_sessions` hourly to auto-close stale sessions.

### Frontend → Vercel

1. Import the repository and set the **root directory** to `frontend/`.
2. Set `VITE_API_URL` to your Railway backend URL (e.g. `https://your-app.up.railway.app/api`).
3. Deploy. `vercel.json` handles SPA routing.

## API Reference

All admin endpoints require the `X-Admin-Token: <token>` header. The token is returned once when the session is created.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/sessions/` | — | Create a session |
| `GET` | `/api/sessions/:id/` | — | Get session (players, rounds, matches); accepts `?since_round=N` to return only rounds after N |
| `PATCH` | `/api/sessions/:id/update/` | Admin | Update name, match type, courts, mode |
| `PATCH` | `/api/sessions/:id/active/` | Admin | Set `is_active`; cannot reactivate an auto-deactivated session |
| `POST` | `/api/sessions/:id/players/` | Admin | Add a player |
| `PATCH` | `/api/sessions/:id/players/:id/` | Admin | Rename a player or toggle `sit_out` |
| `DELETE` | `/api/sessions/:id/players/:id/` | Admin | Remove a player (name retained in history) |
| `POST` | `/api/sessions/:id/players/:id/partner/` | Admin | Set or clear permanent partner |
| `POST` | `/api/sessions/:id/generate/` | Admin | Generate and commit next round |
| `GET` | `/api/sessions/:id/preview-rounds/` | — | Preview next N rounds without committing |
| `PATCH` | `/api/sessions/:id/matches/:id/result/` | Admin | Set or clear match winner |
| `PATCH` | `/api/sessions/:id/matches/:id/override/` | Admin | Manually override a court assignment |
| `GET` | `/api/vapid-public-key/` | — | Get the VAPID public key for push subscription |
| `POST` | `/api/sessions/:id/push-subscribe/` | — | Subscribe to web push notifications for this session |
| `POST` | `/api/sessions/:id/push-unsubscribe/` | — | Unsubscribe from web push notifications |

## How the Algorithm Works

### Fair Rotation (default)

Matches are generated using a **weighted cost** model:

- **Partner repeat cost (×5)** — penalises pairing players who have been teammates before
- **Opponent repeat cost (×2)** — penalises rematches
- **Wait advantage (×3)** — rewards giving sitting-out players a game

For each round:
1. Permanent partner pairs are grouped as atomic units.
2. Byes are assigned to the units with the lowest average wait time. A `last_sat_out` tiebreaker prevents consecutive sit-outs for the same player.
3. Remaining players are paired into teams by greedily minimising the cost function.
4. Teams are matched against opponents by the same greedy cost search.

### Competitive Mode

Bye selection is identical to fair rotation (wait time based). Teams are then sorted by win count descending and paired adjacently — the top two teams face each other, the next two face each other, and so on. This produces skill-matched games that naturally converge toward accurate rankings over time.

## Project Structure

```
match-generator/
├── backend/
│   ├── pickleball/          # Django project settings & URLs
│   ├── sessions_app/
│   │   ├── models.py        # Session, Player, Round, Match, PlayerRoundHistory, PushSubscription
│   │   ├── views.py         # API endpoints
│   │   ├── serializers.py
│   │   ├── management/
│   │   │   └── commands/
│   │   │       └── deactivate_inactive_sessions.py   # Railway cron command
│   │   └── services/
│   │       ├── match_generator.py     # Fair rotation & competitive algorithms
│   │       └── push_notifications.py  # VAPID web push helpers
│   ├── railway.json         # Web service deploy config (gunicorn)
│   ├── railway.cron.json    # Cron service config (hourly deactivation sweep)
│   └── requirements.txt
└── frontend/
    ├── public/
    │   ├── manifest.json    # PWA manifest (enables iOS standalone / install prompt)
    │   └── sw.js            # Service worker (handles push events and background sync)
    └── src/
        ├── pages/           # HomePage, SessionPage
        ├── components/      # CourtCard, CurrentRound, PlayerList, RoundHistory,
        │                    # UpcomingRounds, Leaderboard, OverrideMatchDialog,
        │                    # PushNotificationSettings, …
        ├── hooks/           # useSession, usePushNotifications (TanStack Query)
        └── lib/             # api.ts, push.ts, types.ts, utils.ts
```

## License

MIT

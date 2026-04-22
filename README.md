# Pickleball Match Generator

A mobile-first web app that generates fair, rotating matches for pickleball sessions. Hosts manage players and partnerships from an admin view; players follow along on a read-only session view.

## Features

- **1v1 and 2v2** match types
- **Fair rotation algorithm** — weighted cost system minimises repeat partners and opponents, distributes byes evenly over time
- **Permanent Partners** — link two players so they always share a team in 2v2; unlink at any time and the next round reflects the change immediately
- **Bye tracking** — players who sit out are prioritised to play in the next round; consecutive sit-outs are prevented
- **Manual overrides** — host can edit any court assignment after generation
- **UUID-based host auth** — no accounts needed; admin token is stored in `localStorage`
- **Public session view** — share the session ID with players for a read-only scoreboard

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

### Frontend (`.env.local`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(unset → `/api` proxy)* | Backend API base URL for production |

## Deployment

### Backend → Railway

1. Create a new Railway project and add a **PostgreSQL** plugin.
2. Set environment variables: `SECRET_KEY`, `DEBUG=False`, `DATABASE_URL` (auto-set by Railway), `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.
3. Push the `backend/` directory. Railway uses `railway.json` to run migrations and start gunicorn automatically.

### Frontend → Vercel

1. Import the repository and set the **root directory** to `frontend/`.
2. Set `VITE_API_URL` to your Railway backend URL (e.g. `https://your-app.up.railway.app/api`).
3. Deploy. `vercel.json` handles SPA routing.

## API Reference

All admin endpoints require the `X-Admin-Token: <token>` header. The token is returned once when the session is created.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/sessions/` | — | Create a session |
| `GET` | `/api/sessions/:id/` | — | Get session (players, rounds, matches) |
| `PATCH` | `/api/sessions/:id/update/` | Admin | Update name, match type, courts |
| `POST` | `/api/sessions/:id/players/` | Admin | Add a player |
| `PATCH` | `/api/sessions/:id/players/:id/` | Admin | Rename a player |
| `DELETE` | `/api/sessions/:id/players/:id/` | Admin | Remove a player |
| `POST` | `/api/sessions/:id/players/:id/partner/` | Admin | Set or clear permanent partner |
| `POST` | `/api/sessions/:id/generate/` | Admin | Generate and commit next round |
| `PATCH` | `/api/sessions/:id/matches/:id/override/` | Admin | Manually override a court assignment |

## How the Algorithm Works

Matches are generated using a **weighted cost** model:

- **Partner repeat cost (×5)** — penalises pairing players who have been teammates before
- **Opponent repeat cost (×2)** — penalises rematches
- **Wait advantage (×3)** — rewards giving sitting-out players a game

For each round:
1. Permanent partner pairs are grouped as atomic units.
2. Byes are assigned to the units (pairs or singles) with the lowest average wait time. A secondary tiebreaker (`last_sat_out` round) prevents consecutive sit-outs for the same player.
3. Remaining players are paired into teams by greedily minimising the cost function.
4. Teams are matched against opponents by the same greedy cost search.

## Project Structure

```
match-generator/
├── backend/
│   ├── pickleball/          # Django project settings & URLs
│   ├── sessions_app/
│   │   ├── models.py        # Session, Player, Round, Match, PlayerRoundHistory
│   │   ├── views.py         # API endpoints
│   │   ├── serializers.py
│   │   └── services/
│   │       └── match_generator.py   # Fair rotation algorithm
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/           # HomePage, SessionPage
        ├── components/      # CourtCard, CurrentRound, PlayerList, …
        ├── hooks/           # useSession (TanStack Query)
        └── lib/             # api.ts, types.ts
```

## License

MIT

# Fair Rotation Algorithm

This document describes how the match generator decides who plays whom each round, who sits out, and how upcoming rounds are previewed.

## Table of Contents

1. [Overview](#overview)
2. [History Model](#history-model)
3. [Cost Model](#cost-model)
4. [Sit-Out Selection](#sit-out-selection)
5. [Match Formation — Fair Mode](#match-formation--fair-mode)
6. [Match Formation — Competitive Mode](#match-formation--competitive-mode)
7. [1v1 vs 2v2 Differences](#1v1-vs-2v2-differences)
8. [Permanent Partners](#permanent-partners)
9. [Preview Rounds](#preview-rounds)
10. [Committing a Round](#committing-a-round)
11. [Post-Override Reconciliation](#post-override-reconciliation)
12. [Tuning the Weights](#tuning-the-weights)

---

## Overview

Each time a host clicks **Generate Round**, the algorithm runs in three stages:

1. **Sit-out selection** — determine which players (or permanent-partner pairs) must sit out because there are not enough court slots for everyone.
2. **Team formation** — group the active players into teams of the right size.
3. **Court assignment** — pair the teams into matches, one per court.

The result is a `GeneratedRound` dict that is held in memory until the host commits it. Committing writes `Round`, `Match`, and `PlayerRoundHistory` rows to the database.

---

## History Model

Before any decision is made, the algorithm reads every `PlayerRoundHistory` row for the session and builds five lookup tables:

| Table | Key(s) | Value |
|---|---|---|
| `partner_counts[a][b]` | player IDs | number of rounds `a` and `b` were on the same team |
| `opponent_counts[a][b]` | player IDs | number of rounds `a` and `b` faced each other |
| `wait_rounds[a]` | player ID | total rounds `a` sat out |
| `last_sat_out[a]` | player ID | most recent round number `a` sat out |
| `last_played[a]` | player ID | most recent round number `a` played |

All five are `defaultdict(int)`, so a player with no history returns `0` without a key error.

---

## Cost Model

The algorithm uses a weighted cost function to score every candidate match. Lower cost = better match.

### Weights

```
PARTNER_REPEAT_W  = 5.0   # penalty per past round two players were teammates
OPPONENT_REPEAT_W = 2.0   # penalty per past round two players were opponents
WAIT_ADVANTAGE_W  = 3.0   # bonus per round a player has previously sat out
BYE_PENALTY_W     = 1.0   # per-bye-player penalty (used in tie-breaking, not in match cost)
```

### Match cost formula

For a proposed match with `team1 = [a, b]` and `team2 = [c, d]` (2v2 example):

```
match_cost = partner_repeat_cost(team1)
           + partner_repeat_cost(team2)
           + opponent_repeat_cost(team1, team2)
           - wait_bonus(team1 + team2)
```

Where:

```
partner_repeat_cost(team) = PARTNER_REPEAT_W × Σ partner_counts[x][y]
                            for every pair (x, y) in team

opponent_repeat_cost(t1, t2) = OPPONENT_REPEAT_W × Σ opponent_counts[x][y]
                                for every x in t1, y in t2

wait_bonus(players) = WAIT_ADVANTAGE_W × Σ wait_rounds[p]
                      for every p in players
```

The wait bonus is **subtracted** from the cost, so placing players who have sat out more makes a match *cheaper* (more preferred). Partner repeats carry the highest penalty (5×) because variety in partners matters more than avoiding the same opponent (2×).

---

## Sit-Out Selection

Before teams are formed, the algorithm figures out how many players must sit out.

```
players_needed = min(num_courts × team_size × 2, total − (total % (team_size × 2)))
remaining_byes = total − players_needed
```

Players are sorted into **units** (a permanent-partner pair counts as one unit of cost 2; a solo player is cost 1). Each unit is scored by:

1. **`wait`** — average `wait_rounds` across the unit's players (ascending — most-waited sits out last).
2. **`last_played`** — most recent round number played (descending — longer out of a game sits out last).
3. **`jitter`** — a random float used to break exact ties consistently within a seeded preview window.

Units are sorted by `(wait ASC, -last_played ASC, jitter ASC)` and the algorithm walks the sorted list, greedily selecting units to sit out until `remaining_byes` reaches zero. A unit is skipped if its cost exceeds the remaining bye budget (so a permanent-partner pair is never partially sat out).

> **Key invariant**: players with `sit_out=True` on the `Player` model are excluded entirely before sit-out selection runs. They appear in neither the active set nor `bye_players`.

---

## Match Formation — Fair Mode

### 2v2

After sit-out selection the algorithm holds:
- `active_pairs` — permanent-partner pairs that will play.
- `active_singles` — solo players that will play.

**Step 1 — Pair the singles.**

Singles are greedily paired by minimum `partner_repeat_cost`. The first unpaired player is fixed; every possible partner is evaluated and the cheapest is chosen. This repeats until all singles are paired (an odd single is left unpaired and falls back to a bye).

**Step 2 — Assign courts.**

All pairs (permanent + newly paired) form a pool. The first team in the pool is pinned as `team1` on court 1. Every remaining team is scored as a potential `team2` using `match_cost`. The cheapest opponent is selected, that court is closed, and the process repeats for the next court with the remaining teams.

### 1v1

There are no pairs — every player is their own "team". Sit-out selection uses the same `(wait ASC, -last_played ASC, jitter ASC)` sort on individual players. Court assignment follows the same greedy pinning loop: pin the first available player, find the cheapest opponent using `match_cost([p1], [p2], hist)`.

---

## Match Formation — Competitive Mode

Sit-out selection is **identical** to fair mode. Team formation is also the same. What changes is court assignment:

1. After teams are formed, each team is scored by its **average win count** (total wins ÷ team size).
2. Teams are sorted descending by average wins (ties broken by `random.random()`).
3. Adjacent pairs in the sorted list are placed on the same court: rank-1 vs rank-2, rank-3 vs rank-4, etc.

This produces skill-matched games — the best teams play each other, not the weakest.

Win counts are read from `Match.winner` across all committed rounds in the session.

---

## 1v1 vs 2v2 Differences

| Aspect | 1v1 | 2v2 |
|---|---|---|
| Players per court | 2 | 4 |
| Permanent partners | N/A (ignored) | grouped as atomic units |
| Partner-repeat cost | 0 (teams of 1 have no pairs) | applies within each team |
| Opponent-repeat cost | applies | applies across teams |
| Sit-out unit | individual | individual or partner pair |

---

## Permanent Partners

When two players have `permanent_partner` set on each other, they are:

- Grouped into a single **pair unit** before any other logic runs.
- Never split between different teams or between playing and sitting out.
- Treated as one atomic slot during sit-out selection (cost = 2).

If a permanent-partner pair must sit out, both players are added to `bye_players` together. Their `wait_rounds` accumulate individually.

---

## Preview Rounds

The `/preview-rounds/` endpoint shows the next N rounds without committing them. Each preview round must produce the same matchups every time it is fetched (otherwise the UI flickers). This is achieved with a **seeded RNG**:

```python
seed = md5(f"{session_id}:{round_number}") % 2**32
random.seed(seed)
# ... run generator ...
random.setstate(original_state)   # restore after
```

Because the seed is deterministic from `(session_id, round_number)`, the same preview slot always generates the same result **given the same history**. Between preview slots, the algorithm runs `_simulate_history_update` to advance the in-memory history dict as if the previous preview round had been committed — partner counts, opponent counts, wait rounds, and last-played are all updated. This means preview round N+1 correctly accounts for what preview round N would have produced.

When the host actually commits round N, `generate_round` re-runs with the real database history and uses the same seed, so the committed result matches what was previewed.

---

## Committing a Round

`commit_round(session, generated)` wraps everything in a single database transaction:

1. Creates a `Round` row with the next sequential `number`.
2. Creates one `Match` row per court, storing `team1_players` and `team2_players` as JSON arrays of UUID strings.
3. Creates one `PlayerRoundHistory` row per active player, recording their `partner_ids`, `opponent_ids`, and `sat_out` status.
4. Increments `Player.total_wait_rounds` (a denormalised counter) for every bye player.

`total_wait_rounds` is kept in sync with the sum of `PlayerRoundHistory.sat_out` rows. It exists purely for display speed.

---

## Post-Override Reconciliation

When a host manually re-assigns players via the override dialog, the stored `Match` rows change but the `PlayerRoundHistory` rows still reflect the originally-generated assignments. `reconcile_round_history(rnd)` fixes this:

1. Deletes all existing `PlayerRoundHistory` rows for the round.
2. Rebuilds them from the current `Match` rows — partner IDs, opponent IDs, and sit-out status are all recalculated.
3. Detects players whose sit-out status changed and adjusts `Player.total_wait_rounds` accordingly (clamped to 0 to prevent underflow).

If a player appears on multiple courts due to an admin error, only their first court assignment is recorded.

---

## Tuning the Weights

The four weights are defined at the top of `backend/sessions_app/services/match_generator.py`:

```python
PARTNER_REPEAT_W  = 5.0
OPPONENT_REPEAT_W = 2.0
WAIT_ADVANTAGE_W  = 3.0
BYE_PENALTY_W     = 1.0
```

**Effect of increasing a weight:**

- `PARTNER_REPEAT_W` ↑ — the algorithm works harder to avoid re-pairing teammates, even at the cost of more opponent repeats.
- `OPPONENT_REPEAT_W` ↑ — emphasises opponent variety; can conflict with `PARTNER_REPEAT_W` when the pool is small.
- `WAIT_ADVANTAGE_W` ↑ — players who have sat out more are more aggressively pulled into games; reduces wait-time variance across a session.
- `BYE_PENALTY_W` — not currently used in `match_cost`; reserved for future heuristics that weigh total bye count.

With fewer than ~8 players on 2 courts the pool of valid matchups is small and the algorithm may be forced to repeat pairings regardless of weights.

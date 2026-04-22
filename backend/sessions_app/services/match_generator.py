"""
Weighted-cost fair rotation algorithm for pickleball match generation.

Cost model (2v2):
  - partner_repeat_cost: penalises pairing players who have been partners before
  - opponent_repeat_cost: penalises facing the same opponents again
  - wait_time_cost: prioritises players who have sat out more rounds
  - bye_cost: added for every player who must sit out this round

For 1v1 the same weights apply but team sizes are 1.
"""
from __future__ import annotations

import itertools
import random
from collections import defaultdict
from typing import TypedDict

from sessions_app.models import Player, PlayerRoundHistory, Round, Session


# ---------------------------------------------------------------------------
# Cost weights (tune to taste)
# ---------------------------------------------------------------------------
PARTNER_REPEAT_W = 5.0
OPPONENT_REPEAT_W = 2.0
WAIT_ADVANTAGE_W = 3.0   # reward for giving a long-waiting player a game
BYE_PENALTY_W = 1.0      # per bye player — prefer fewer byes


class CourtAssignment(TypedDict):
    court: int
    team1: list[str]   # player UUIDs
    team2: list[str]


class GeneratedRound(TypedDict):
    round_number: int
    courts: list[CourtAssignment]
    bye_players: list[str]   # player UUIDs sitting out


# ---------------------------------------------------------------------------
# History helpers
# ---------------------------------------------------------------------------

def _build_history(session: Session) -> dict:
    """
    Returns nested dicts:
      partner_counts[a][b]  = number of rounds a and b were on the same team
      opponent_counts[a][b] = number of rounds a and b were opponents
      wait_rounds[a]        = total rounds sat out
    """
    partner_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    opponent_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    wait_rounds: dict[str, int] = defaultdict(int)

    last_sat_out: dict[str, int] = defaultdict(int)  # most recent round number sat out

    histories = (
        PlayerRoundHistory.objects
        .filter(round__session=session)
        .values('player_id', 'partner_ids', 'opponent_ids', 'sat_out', 'round__number')
    )
    for h in histories:
        pid = str(h['player_id'])
        if h['sat_out']:
            wait_rounds[pid] += 1
            last_sat_out[pid] = max(last_sat_out[pid], h['round__number'])
            continue
        for partner in h['partner_ids']:
            partner_counts[pid][str(partner)] += 1
        for opp in h['opponent_ids']:
            opponent_counts[pid][str(opp)] += 1

    return {
        'partner': partner_counts,
        'opponent': opponent_counts,
        'wait': wait_rounds,
        'last_sat_out': last_sat_out,
    }


# ---------------------------------------------------------------------------
# Team cost
# ---------------------------------------------------------------------------

def _team_pair_cost(team: list[str], hist: dict) -> float:
    """Penalty for players being paired together on a team."""
    cost = 0.0
    for a, b in itertools.combinations(team, 2):
        cost += PARTNER_REPEAT_W * hist['partner'][a][b]
    return cost


def _matchup_cost(team1: list[str], team2: list[str], hist: dict) -> float:
    """Penalty for two teams facing each other again."""
    cost = 0.0
    for a in team1:
        for b in team2:
            cost += OPPONENT_REPEAT_W * hist['opponent'][a][b]
    return cost


def _wait_bonus(players: list[str], hist: dict) -> float:
    """Negative cost (bonus) for including players who have waited longest."""
    bonus = 0.0
    for p in players:
        bonus -= WAIT_ADVANTAGE_W * hist['wait'][p]
    return bonus


def _match_cost(team1: list[str], team2: list[str], hist: dict) -> float:
    return (
        _team_pair_cost(team1, hist)
        + _team_pair_cost(team2, hist)
        + _matchup_cost(team1, team2, hist)
        + _wait_bonus(team1 + team2, hist)
    )


# ---------------------------------------------------------------------------
# Partner grouping
# ---------------------------------------------------------------------------

def _group_permanent_partners(players: list[Player]) -> tuple[list[list[str]], list[str]]:
    """
    Returns:
      pairs  — list of [p1_id, p2_id] for permanent partner pairs
      singles — player IDs without a permanent partner
    """
    seen: set[str] = set()
    pairs: list[list[str]] = []
    singles: list[str] = []

    for p in players:
        pid = str(p.id)
        if pid in seen:
            continue
        partner = p.permanent_partner
        if partner and partner in players:
            pid2 = str(partner.id)
            pairs.append([pid, pid2])
            seen.add(pid)
            seen.add(pid2)
        else:
            singles.append(pid)

    return pairs, singles


# ---------------------------------------------------------------------------
# 2v2 generator
# ---------------------------------------------------------------------------

def _pair_wait_score(pair: list[str], hist: dict) -> float:
    """Average wait rounds for a pair — used to decide if the pair should sit out."""
    return sum(hist['wait'][p] for p in pair) / len(pair)


def _generate_2v2(
    players: list[Player],
    num_courts: int,
    hist: dict,
) -> GeneratedRound:
    pairs, singles = _group_permanent_partners(players)
    all_ids = [str(p.id) for p in players]

    # Determine how many players actually play (multiple of 4)
    total = len(all_ids)
    players_needed = min(num_courts * 4, total - (total % 4))
    remaining_byes = total - players_needed

    # Build sortable units: pairs cost 2 bye slots, singles cost 1.
    # Sort ascending by (wait_score, cost) so:
    #   - least-rested players/pairs sit out first
    #   - at equal wait, singles are preferred over pairs (ties broken by cost=1 < cost=2),
    #     meaning an active pair won't be forced out while individual singles are equally fresh
    units: list[dict] = []
    for pair in pairs:
        units.append({
            'ids': pair,
            'cost': 2,
            'wait': _pair_wait_score(pair, hist),
            # use max so a recently-rested pair member deprioritises the whole pair
            'last_sat_out': max(hist['last_sat_out'][p] for p in pair),
        })
    for s in singles:
        units.append({
            'ids': [s],
            'cost': 1,
            'wait': hist['wait'][s],
            'last_sat_out': hist['last_sat_out'][s],
        })
    # Sort: fewest byes first; ties broken by cost (singles before pairs) then by
    # recency of last sit-out (sat out recently → larger value → sorted last → plays this round)
    units.sort(key=lambda u: (u['wait'], u['cost'], u['last_sat_out']))

    bye_players: list[str] = []
    active_pairs: list[list[str]] = list(pairs)
    active_singles: list[str] = list(singles)

    for unit in units:
        if remaining_byes <= 0:
            break
        if unit['cost'] > remaining_byes:
            # Pair needs 2 slots but only 1 remains — skip, take next single instead
            continue
        bye_players.extend(unit['ids'])
        remaining_byes -= unit['cost']
        if unit['cost'] == 2:
            active_pairs = [p for p in active_pairs if p is not unit['ids']]
        else:
            active_singles = [s for s in active_singles if s != unit['ids'][0]]

    # Build pool of 2-person groups
    pool: list[list[str]] = list(active_pairs)

    # Fill remaining slots pairing singles optimally
    unpaired = list(active_singles)
    while len(unpaired) >= 2:
        best_cost = float('inf')
        best_pair: list[str] = []
        for a, b in itertools.combinations(range(len(unpaired)), 2):
            c = _team_pair_cost([unpaired[a], unpaired[b]], hist)
            if c < best_cost:
                best_cost = c
                best_pair = [unpaired[a], unpaired[b]]
        pool.append(best_pair)
        for x in best_pair:
            unpaired.remove(x)

    # If odd singles remain after bye assignment (shouldn't happen in valid state),
    # add as a solo team placeholder
    for p in unpaired:
        pool.append([p])

    # Pair pool groups into match teams greedily
    courts: list[CourtAssignment] = []
    court_num = 1
    used: set[int] = set()

    while len(courts) < num_courts and len([i for i in range(len(pool)) if i not in used]) >= 2:
        available = [i for i in range(len(pool)) if i not in used]
        if len(available) < 2:
            break

        first_idx = available[0]
        team1 = pool[first_idx]
        used.add(first_idx)

        best_cost = float('inf')
        best_idx = -1
        for idx in available[1:]:
            team2 = pool[idx]
            cost = _match_cost(team1, team2, hist)
            if cost < best_cost:
                best_cost = cost
                best_idx = idx

        if best_idx == -1:
            break

        used.add(best_idx)
        team2 = pool[best_idx]
        courts.append({'court': court_num, 'team1': team1, 'team2': team2})
        court_num += 1

    # Any pool members not assigned become byes
    for i, grp in enumerate(pool):
        if i not in used:
            bye_players.extend(grp)

    next_round = _next_round_number(players[0].session if players else None)
    return {'round_number': next_round, 'courts': courts, 'bye_players': bye_players}


# ---------------------------------------------------------------------------
# 1v1 generator
# ---------------------------------------------------------------------------

def _generate_1v1(
    players: list[Player],
    num_courts: int,
    hist: dict,
) -> GeneratedRound:
    all_ids = [str(p.id) for p in players]
    total = len(all_ids)
    players_needed = min(num_courts * 2, total - (total % 2))
    bye_count = total - players_needed

    sorted_ids = sorted(all_ids, key=lambda pid: (hist['wait'][pid], hist['last_sat_out'][pid]))
    bye_players = sorted_ids[:bye_count]
    active = sorted_ids[bye_count:]

    courts: list[CourtAssignment] = []
    used: set[str] = set()
    court_num = 1

    while len(courts) < num_courts and len([x for x in active if x not in used]) >= 2:
        available = [x for x in active if x not in used]
        p1 = available[0]
        used.add(p1)

        best_cost = float('inf')
        best_p2 = ''
        for p2 in available[1:]:
            cost = _match_cost([p1], [p2], hist)
            if cost < best_cost:
                best_cost = cost
                best_p2 = p2

        if not best_p2:
            break

        used.add(best_p2)
        courts.append({'court': court_num, 'team1': [p1], 'team2': [best_p2]})
        court_num += 1

    for p in active:
        if p not in used:
            bye_players.append(p)

    next_round = _next_round_number(players[0].session if players else None)
    return {'round_number': next_round, 'courts': courts, 'bye_players': bye_players}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def _next_round_number(session: Session | None) -> int:
    if session is None:
        return 1
    last = session.rounds.order_by('-number').values_list('number', flat=True).first()
    return (last or 0) + 1


def generate_round(session: Session) -> GeneratedRound:
    players = list(session.players.prefetch_related('permanent_partner').all())
    if not players:
        raise ValueError('Session has no players.')

    hist = _build_history(session)

    if session.match_type == '1v1':
        return _generate_1v1(players, session.num_courts, hist)
    return _generate_2v2(players, session.num_courts, hist)


def commit_round(session: Session, generated: GeneratedRound) -> Round:
    """Persist the generated round and update PlayerRoundHistory."""
    from django.db import transaction

    player_map = {str(p.id): p for p in session.players.all()}

    with transaction.atomic():
        rnd = Round.objects.create(session=session, number=generated['round_number'])

        for court in generated['courts']:
            from sessions_app.models import Match
            Match.objects.create(
                round=rnd,
                court_number=court['court'],
                team1_players=court['team1'],
                team2_players=court['team2'],
            )

        all_playing: set[str] = set()
        for court in generated['courts']:
            t1 = court['team1']
            t2 = court['team2']
            all_playing.update(t1 + t2)

            for pid in t1:
                PlayerRoundHistory.objects.create(
                    player=player_map[pid],
                    round=rnd,
                    partner_ids=[x for x in t1 if x != pid],
                    opponent_ids=t2,
                )
            for pid in t2:
                PlayerRoundHistory.objects.create(
                    player=player_map[pid],
                    round=rnd,
                    partner_ids=[x for x in t2 if x != pid],
                    opponent_ids=t1,
                )

        for pid in generated['bye_players']:
            if pid in player_map:
                PlayerRoundHistory.objects.create(
                    player=player_map[pid],
                    round=rnd,
                    sat_out=True,
                )
                player_map[pid].total_wait_rounds += 1
                player_map[pid].save(update_fields=['total_wait_rounds'])

    return rnd

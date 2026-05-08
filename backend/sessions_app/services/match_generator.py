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

import contextlib
import hashlib
import itertools
import random
from collections import defaultdict
from typing import TypedDict

from django.db import transaction
from django.utils import timezone

from sessions_app.models import Match, Player, PlayerRoundHistory, Round, Session


# ---------------------------------------------------------------------------
# Cost weights (tune to taste)
# ---------------------------------------------------------------------------
PARTNER_REPEAT_W = 5.0
OPPONENT_REPEAT_W = 2.0
WAIT_ADVANTAGE_W = 3.0   # reward for giving a long-waiting player a game
BYE_PENALTY_W = 1.0      # per bye player — prefer fewer byes
RECENCY_W = 3.0          # 1/rounds_ago penalty — breaks cost ties toward least-recently-used matchups


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
      last_sat_out[a]       = most recent round number sat out
      last_played[a]        = most recent round number played
    """
    partner_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    opponent_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    last_opp_round: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    wait_rounds: dict[str, int] = defaultdict(int)
    last_sat_out: dict[str, int] = defaultdict(int)
    last_played: dict[str, int] = defaultdict(int)

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
        last_played[pid] = max(last_played[pid], h['round__number'])
        for partner in h['partner_ids']:
            partner_counts[pid][str(partner)] += 1
        for opp in h['opponent_ids']:
            opp_str = str(opp)
            opponent_counts[pid][opp_str] += 1
            last_opp_round[pid][opp_str] = max(last_opp_round[pid][opp_str], h['round__number'])

    return {
        'partner': partner_counts,
        'opponent': opponent_counts,
        'last_opp_round': last_opp_round,
        'wait': wait_rounds,
        'last_sat_out': last_sat_out,
        'last_played': last_played,
    }


def _build_win_counts(session: Session) -> dict[str, int]:
    wins: dict[str, int] = defaultdict(int)
    matches = (
        Match.objects
        .filter(round__session=session)
        .exclude(winner__isnull=True)
        .values('team1_players', 'team2_players', 'winner')
    )
    for m in matches:
        winner_ids = m['team1_players'] if m['winner'] == 'team1' else m['team2_players']
        for pid in winner_ids:
            wins[str(pid)] += 1
    return wins


# ---------------------------------------------------------------------------
# Team cost
# ---------------------------------------------------------------------------

def _team_pair_cost(team: list[str], hist: dict) -> float:
    """Penalty for players being paired together on a team."""
    cost = 0.0
    for a, b in itertools.combinations(team, 2):
        cost += PARTNER_REPEAT_W * hist['partner'][a][b]
    return cost


def _matchup_cost(team1: list[str], team2: list[str], hist: dict, round_number: int = 0) -> float:
    """Penalty for two teams facing each other again, with a recency boost."""
    cost = 0.0
    for a in team1:
        for b in team2:
            cost += OPPONENT_REPEAT_W * hist['opponent'][a][b]
            last_rnd = hist['last_opp_round'][a][b]
            if last_rnd > 0 and round_number > last_rnd:
                cost += RECENCY_W / (round_number - last_rnd)
    return cost


def _wait_bonus(players: list[str], hist: dict) -> float:
    """Negative cost (bonus) for including players who have waited longest."""
    bonus = 0.0
    for p in players:
        bonus -= WAIT_ADVANTAGE_W * hist['wait'][p]
    return bonus


def _match_cost(team1: list[str], team2: list[str], hist: dict, round_number: int = 0) -> float:
    return (
        _team_pair_cost(team1, hist)
        + _team_pair_cost(team2, hist)
        + _matchup_cost(team1, team2, hist, round_number)
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
# Shared sit-out selection (2v2)
# ---------------------------------------------------------------------------

def _pair_wait_score(pair: list[str], hist: dict) -> float:
    return sum(hist['wait'][p] for p in pair) / len(pair)


def _select_byes_2v2(
    players: list[Player],
    num_courts: int,
    hist: dict,
) -> tuple[list[list[str]], list[str], list[str]]:
    """
    Returns (active_pairs, active_singles, bye_players).
    Sit-out selection is identical across all generation modes.
    """
    pairs, singles = _group_permanent_partners(players)
    total = len(players)
    players_needed = min(num_courts * 4, total - (total % 4))
    remaining_byes = total - players_needed

    units: list[dict] = []
    for pair in pairs:
        units.append({
            'ids': pair,
            'cost': 2,
            'wait': _pair_wait_score(pair, hist),
            'last_played': max(hist['last_played'][p] for p in pair),
        })
    for s in singles:
        units.append({
            'ids': [s],
            'cost': 1,
            'wait': hist['wait'][s],
            'last_played': hist['last_played'][s],
        })

    for unit in units:
        unit['jitter'] = random.random()
    units.sort(key=lambda u: (u['wait'], u['jitter']))

    bye_players: list[str] = []
    active_pairs: list[list[str]] = list(pairs)
    active_singles: list[str] = list(singles)

    for unit in units:
        if remaining_byes <= 0:
            break
        if unit['cost'] > remaining_byes:
            continue
        bye_players.extend(unit['ids'])
        remaining_byes -= unit['cost']
        if unit['cost'] == 2:
            active_pairs = [p for p in active_pairs if p is not unit['ids']]
        else:
            active_singles = [s for s in active_singles if s != unit['ids'][0]]

    return active_pairs, active_singles, bye_players


def _enumerate_pairings(items: list) -> list[list[tuple]]:
    """All perfect pairings of an even-length list as [(a, b), ...] tuples."""
    if not items:
        return [[]]
    first = items[0]
    rest = items[1:]
    result = []
    for i, partner in enumerate(rest):
        remaining = rest[:i] + rest[i + 1:]
        for sub in _enumerate_pairings(remaining):
            result.append([(first, partner)] + sub)
    return result


def _pair_singles(active_singles: list[str], hist: dict) -> list[list[str]]:
    """Globally optimal pairing of singles by minimising total partner-repeat cost.

    Enumerates all perfect pairings and picks the minimum-cost one.
    Shuffle first so ties are broken randomly (respects the seeded RNG).
    """
    if len(active_singles) < 2:
        return [[s] for s in active_singles]
    shuffled = list(active_singles)
    random.shuffle(shuffled)
    best_cost = float('inf')
    best: list[list[str]] = []
    for pairing in _enumerate_pairings(shuffled):
        cost = sum(_team_pair_cost([a, b], hist) for a, b in pairing)
        if cost < best_cost:
            best_cost = cost
            best = [[a, b] for a, b in pairing]
    return best


# ---------------------------------------------------------------------------
# 2v2 generators
# ---------------------------------------------------------------------------

def _generate_2v2(
    players: list[Player],
    num_courts: int,
    hist: dict,
    round_number: int,
) -> GeneratedRound:
    active_pairs, active_singles, bye_players = _select_byes_2v2(players, num_courts, hist)

    pool: list[list[str]] = list(active_pairs) + _pair_singles(active_singles, hist)

    courts: list[CourtAssignment] = []
    if len(pool) >= 2:
        # Shuffle so ties are broken randomly (seeded RNG keeps previews deterministic).
        random.shuffle(pool)
        best_cost = float('inf')
        # Enumerate all perfect pairings of teams; pick the globally minimum-cost one.
        for pairing in _enumerate_pairings(pool):
            cost = sum(_match_cost(list(t1), list(t2), hist, round_number) for t1, t2 in pairing)
            if cost < best_cost:
                best_cost = cost
                courts = [
                    {'court': i + 1, 'team1': list(t1), 'team2': list(t2)}
                    for i, (t1, t2) in enumerate(pairing)
                ]

    return {'round_number': round_number, 'courts': courts, 'bye_players': bye_players}


def _generate_2v2_competitive(
    players: list[Player],
    num_courts: int,
    hist: dict,
    wins: dict[str, int],
    round_number: int,
) -> GeneratedRound:
    """
    Sit-out selection is identical to fair mode.
    Teams are formed by minimising partner repeats (same as fair).
    Courts are assigned by win count: top teams face top teams, bottom face bottom.
    """
    active_pairs, active_singles, bye_players = _select_byes_2v2(players, num_courts, hist)

    pool: list[list[str]] = list(active_pairs) + _pair_singles(active_singles, hist)

    # Sort teams by average wins descending; jitter breaks ties
    pool.sort(key=lambda team: (
        -sum(wins.get(p, 0) for p in team) / max(len(team), 1),
        random.random(),
    ))

    # Adjacent teams in sorted order face each other (best vs 2nd-best, etc.)
    courts: list[CourtAssignment] = []
    for i in range(0, len(pool) - 1, 2):
        if len(courts) >= num_courts:
            break
        courts.append({'court': len(courts) + 1, 'team1': pool[i], 'team2': pool[i + 1]})

    for team in pool[len(courts) * 2:]:
        bye_players.extend(team)

    return {'round_number': round_number, 'courts': courts, 'bye_players': bye_players}


# ---------------------------------------------------------------------------
# 1v1 generators
# ---------------------------------------------------------------------------

def _generate_1v1(
    players: list[Player],
    num_courts: int,
    hist: dict,
    round_number: int,
) -> GeneratedRound:
    all_ids = [str(p.id) for p in players]
    total = len(all_ids)
    players_needed = min(num_courts * 2, total - (total % 2))
    bye_count = total - players_needed

    jitter = {pid: random.random() for pid in all_ids}
    sorted_ids = sorted(all_ids, key=lambda pid: (hist['wait'][pid], jitter[pid]))
    bye_players = sorted_ids[:bye_count]
    active = list(sorted_ids[bye_count:])

    courts: list[CourtAssignment] = []
    if len(active) >= 2:
        # Shuffle so ties in cost are broken randomly (seeded RNG keeps previews deterministic).
        random.shuffle(active)
        best_cost = float('inf')
        # Enumerate all perfect pairings; pick the globally minimum-cost one.
        for pairing in _enumerate_pairings(active):
            cost = sum(_match_cost([p1], [p2], hist, round_number) for p1, p2 in pairing)
            if cost < best_cost:
                best_cost = cost
                courts = [
                    {'court': i + 1, 'team1': [p1], 'team2': [p2]}
                    for i, (p1, p2) in enumerate(pairing)
                ]

    return {'round_number': round_number, 'courts': courts, 'bye_players': bye_players}


def _generate_1v1_competitive(
    players: list[Player],
    num_courts: int,
    hist: dict,
    wins: dict[str, int],
    round_number: int,
) -> GeneratedRound:
    all_ids = [str(p.id) for p in players]
    total = len(all_ids)
    players_needed = min(num_courts * 2, total - (total % 2))
    bye_count = total - players_needed

    jitter = {pid: random.random() for pid in all_ids}
    sorted_by_wait = sorted(all_ids, key=lambda pid: (hist['wait'][pid], hist['last_sat_out'][pid], jitter[pid]))
    bye_players = sorted_by_wait[:bye_count]
    active = sorted_by_wait[bye_count:]

    # Sort active players by wins descending; jitter breaks ties
    active.sort(key=lambda pid: (-wins.get(pid, 0), random.random()))

    courts: list[CourtAssignment] = []
    for i in range(0, len(active) - 1, 2):
        if len(courts) >= num_courts:
            break
        courts.append({'court': len(courts) + 1, 'team1': [active[i]], 'team2': [active[i + 1]]})

    for p in active[len(courts) * 2:]:
        bye_players.append(p)

    return {'round_number': round_number, 'courts': courts, 'bye_players': bye_players}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

@contextlib.contextmanager
def _seeded(session_id, round_number: int):
    """
    Temporarily seed the global RNG with a value derived from session + round number.
    Same session + same round = same matchups every time, so preview matches reality.
    Restores the original RNG state on exit.
    """
    key = f"{session_id}:{round_number}".encode()
    seed = int(hashlib.md5(key).hexdigest(), 16) % (2 ** 32)
    state = random.getstate()
    random.seed(seed)
    try:
        yield
    finally:
        random.setstate(state)


def _copy_hist(hist: dict) -> dict:
    """Deep-copy a history dict without relying on lambda pickling."""
    return {
        'partner': defaultdict(lambda: defaultdict(int), {
            k: defaultdict(int, v) for k, v in hist['partner'].items()
        }),
        'opponent': defaultdict(lambda: defaultdict(int), {
            k: defaultdict(int, v) for k, v in hist['opponent'].items()
        }),
        'last_opp_round': defaultdict(lambda: defaultdict(int), {
            k: defaultdict(int, v) for k, v in hist.get('last_opp_round', {}).items()
        }),
        'wait': defaultdict(int, hist['wait']),
        'last_sat_out': defaultdict(int, hist['last_sat_out']),
        'last_played': defaultdict(int, hist.get('last_played', {})),
    }


def _simulate_history_update(hist: dict, generated: GeneratedRound) -> dict:
    """Return a new hist dict reflecting a generated round as if it were committed."""
    h = _copy_hist(hist)
    rn = generated['round_number']
    for court in generated['courts']:
        t1, t2 = court['team1'], court['team2']
        for pid in t1:
            for partner in t1:
                if partner != pid:
                    h['partner'][pid][partner] += 1
            for opp in t2:
                h['opponent'][pid][opp] += 1
                h['last_opp_round'][pid][opp] = rn
        for pid in t2:
            for partner in t2:
                if partner != pid:
                    h['partner'][pid][partner] += 1
            for opp in t1:
                h['opponent'][pid][opp] += 1
                h['last_opp_round'][pid][opp] = rn
    for pid in generated['bye_players']:
        h['wait'][pid] += 1
        h['last_sat_out'][pid] = max(h['last_sat_out'].get(pid, 0), rn)
    for court in generated['courts']:
        for pid in court['team1'] + court['team2']:
            h['last_played'][pid] = max(h['last_played'].get(pid, 0), rn)
    return h


def _next_round_number(session: Session | None) -> int:
    if session is None:
        return 1
    last = session.rounds.order_by('-number').values_list('number', flat=True).first()
    return (last or 0) + 1


def generate_round(session: Session) -> GeneratedRound:
    players = list(session.players.prefetch_related('permanent_partner').filter(sit_out=False).order_by('id'))
    if not players:
        raise ValueError('Session has no players.')

    next_number = _next_round_number(session)
    hist = _build_history(session)
    mode = session.generation_mode

    with _seeded(session.id, next_number):
        if session.match_type == '1v1':
            if mode == 'competitive':
                return _generate_1v1_competitive(players, session.num_courts, hist, _build_win_counts(session), next_number)
            return _generate_1v1(players, session.num_courts, hist, next_number)

        if mode == 'competitive':
            return _generate_2v2_competitive(players, session.num_courts, hist, _build_win_counts(session), next_number)
        return _generate_2v2(players, session.num_courts, hist, next_number)


def preview_rounds(session: Session, count: int = 5) -> list[GeneratedRound]:
    """Generate future rounds without committing."""
    players = list(session.players.prefetch_related('permanent_partner').filter(sit_out=False).order_by('id'))
    if not players:
        raise ValueError('Session has no players.')

    hist = _build_history(session)
    mode = session.generation_mode
    wins = _build_win_counts(session) if mode == 'competitive' else {}
    next_number = _next_round_number(session)
    results: list[GeneratedRound] = []

    for i in range(count):
        round_number = next_number + i
        with _seeded(session.id, round_number):
            if session.match_type == '1v1':
                if mode == 'competitive':
                    gen = _generate_1v1_competitive(players, session.num_courts, hist, wins, round_number)
                else:
                    gen = _generate_1v1(players, session.num_courts, hist, round_number)
            else:
                if mode == 'competitive':
                    gen = _generate_2v2_competitive(players, session.num_courts, hist, wins, round_number)
                else:
                    gen = _generate_2v2(players, session.num_courts, hist, round_number)
        results.append(gen)
        hist = _simulate_history_update(hist, gen)

    return results


def reconcile_round_history(rnd: Round) -> None:
    """Recompute PlayerRoundHistory for a round from its current Match rows.

    Called after override_match so that the cost function always reflects what
    actually happened rather than the originally-generated assignments.
    """
    session = rnd.session
    player_map = {str(p.id): p for p in session.players.filter(sit_out=False)}

    # Fetch matches once and reuse for both playing-set and row construction
    matches = list(rnd.matches.all())

    playing: set[str] = set()
    for match in matches:
        playing.update(match.team1_players)
        playing.update(match.team2_players)
    bye_pids = set(player_map.keys()) - playing

    with transaction.atomic():
        # Fetch only the columns we need to detect sat_out changes
        old_history = {
            str(player_id): sat_out
            for player_id, sat_out in rnd.history.values_list('player_id', 'sat_out')
        }

        PlayerRoundHistory.objects.filter(round=rnd).delete()

        # Recreate history from current match assignments.
        # Guard against the same player appearing on multiple courts (admin error):
        # first assignment wins, duplicates are silently skipped.
        new_rows = []
        seen: set[str] = set()
        for match in matches:
            t1, t2 = match.team1_players, match.team2_players
            for pid in t1:
                if pid in player_map and pid not in seen:
                    seen.add(pid)
                    new_rows.append(PlayerRoundHistory(
                        player=player_map[pid],
                        round=rnd,
                        partner_ids=[x for x in t1 if x != pid],
                        opponent_ids=list(t2),
                    ))
            for pid in t2:
                if pid in player_map and pid not in seen:
                    seen.add(pid)
                    new_rows.append(PlayerRoundHistory(
                        player=player_map[pid],
                        round=rnd,
                        partner_ids=[x for x in t2 if x != pid],
                        opponent_ids=list(t1),
                    ))
        for pid in bye_pids:
            new_rows.append(PlayerRoundHistory(
                player=player_map[pid],
                round=rnd,
                sat_out=True,
            ))
        PlayerRoundHistory.objects.bulk_create(new_rows)

        # Patch total_wait_rounds for players whose sit-out status changed.
        # Clamp to 0 to guard against underflow from unusual override sequences.
        players_to_update = []
        for pid, player in player_map.items():
            was_out = old_history.get(pid, False)
            is_out = pid in bye_pids
            if was_out == is_out:
                continue
            player.total_wait_rounds = max(0, player.total_wait_rounds + (1 if is_out else -1))
            players_to_update.append(player)
        if players_to_update:
            Player.objects.bulk_update(players_to_update, ['total_wait_rounds'])


def commit_round(session: Session, generated: GeneratedRound) -> Round:
    """Persist the generated round and update PlayerRoundHistory."""
    player_map = {str(p.id): p for p in session.players.filter(sit_out=False)}

    with transaction.atomic():
        rnd = Round.objects.create(session=session, number=generated['round_number'])

        for court in generated['courts']:
            Match.objects.create(
                round=rnd,
                court_number=court['court'],
                team1_players=court['team1'],
                team2_players=court['team2'],
            )

        history_rows = []
        for court in generated['courts']:
            t1 = court['team1']
            t2 = court['team2']
            for pid in t1:
                history_rows.append(PlayerRoundHistory(
                    player=player_map[pid],
                    round=rnd,
                    partner_ids=[x for x in t1 if x != pid],
                    opponent_ids=t2,
                ))
            for pid in t2:
                history_rows.append(PlayerRoundHistory(
                    player=player_map[pid],
                    round=rnd,
                    partner_ids=[x for x in t2 if x != pid],
                    opponent_ids=t1,
                ))

        bye_to_update = []
        for pid in generated['bye_players']:
            if pid in player_map:
                history_rows.append(PlayerRoundHistory(
                    player=player_map[pid],
                    round=rnd,
                    sat_out=True,
                ))
                player_map[pid].total_wait_rounds += 1
                bye_to_update.append(player_map[pid])

        PlayerRoundHistory.objects.bulk_create(history_rows)
        if bye_to_update:
            Player.objects.bulk_update(bye_to_update, ['total_wait_rounds'])

        Session.objects.filter(pk=session.pk).update(last_round_at=timezone.now())

    return rnd

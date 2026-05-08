import copy
import random
import uuid
from typing import Optional


def _next_power_of_2(n: int) -> int:
    p = 1
    while p < n:
        p *= 2
    return p


def _generate_seedings(bracket_size: int) -> list:
    """Standard bracket seeding order (top to bottom)."""
    if bracket_size == 1:
        return [1]
    top = _generate_seedings(bracket_size // 2)
    result = []
    for s in top:
        result.append(s)
        result.append(bracket_size + 1 - s)
    return result


def build_bracket(teams_input: list, num_courts: int = 1) -> dict:
    """
    Build a single-elimination bracket.
    teams_input: list of {'player_ids': [...], 'name': str, 'seed': int}
    num_courts: how many matches can run simultaneously.
    """
    n = len(teams_input)
    if n < 2:
        raise ValueError('Need at least 2 teams')

    bracket_size = _next_power_of_2(n)
    num_rounds = bracket_size.bit_length() - 1

    teams = []
    for i, td in enumerate(teams_input):
        teams.append({
            'id': str(uuid.uuid4()),
            'seed': td.get('seed', i + 1),
            'name': td.get('name', f'Team {i + 1}'),
            'player_ids': [str(p) for p in td['player_ids']],
        })
    teams.sort(key=lambda t: t['seed'])
    seed_to_team = {t['seed']: t for t in teams}

    seedings = _generate_seedings(bracket_size)
    r1_pairs = list(zip(seedings[::2], seedings[1::2]))

    match_slots = []
    slot_counter = 0

    def new_id():
        nonlocal slot_counter
        slot_counter += 1
        return f'm{slot_counter}'

    # --- Round 1 ---
    r1_slots = []
    for pos, (top_seed, bottom_seed) in enumerate(r1_pairs):
        top_team = seed_to_team.get(top_seed)
        bottom_team = seed_to_team.get(bottom_seed)
        is_bye = top_team is None or bottom_team is None

        if is_bye:
            status = 'done'
            winner_id = (top_team or bottom_team)['id']
        else:
            status = 'ready'   # both teams known; activation happens below
            winner_id = None

        slot = {
            'id': new_id(),
            'round': 1,
            'position': pos,
            'top_team_id': top_team['id'] if top_team else None,
            'bottom_team_id': bottom_team['id'] if bottom_team else None,
            'is_bye': is_bye,
            'winner_id': winner_id,
            'db_match_id': None,
            'status': status,
            'feeds': [],
        }
        r1_slots.append(slot)
        match_slots.append(slot)

    # --- Subsequent rounds ---
    prev_round = r1_slots
    for rnd in range(2, num_rounds + 1):
        curr_round = []
        for i in range(0, len(prev_round), 2):
            fa, fb = prev_round[i], prev_round[i + 1]
            top_team_id = fa['winner_id'] if fa['status'] == 'done' else None
            bottom_team_id = fb['winner_id'] if fb['status'] == 'done' else None

            if top_team_id and bottom_team_id:
                slot_status = 'ready'
            else:
                slot_status = 'pending'

            slot = {
                'id': new_id(),
                'round': rnd,
                'position': i // 2,
                'top_team_id': top_team_id,
                'bottom_team_id': bottom_team_id,
                'is_bye': False,
                'winner_id': None,
                'db_match_id': None,
                'status': slot_status,
                'feeds': [fa['id'], fb['id']],
            }
            curr_round.append(slot)
            match_slots.append(slot)
        prev_round = curr_round

    # Activate up to num_courts ready matches
    active_match_ids = _activate_ready(match_slots, [], num_courts)

    return {
        'teams': teams,
        'match_slots': match_slots,
        'active_match_ids': active_match_ids,
        'current_match_id': active_match_ids[0] if active_match_ids else None,
        'champion_team_id': None,
        'status': 'in_progress',
        'num_teams': n,
        'bracket_size': bracket_size,
        'num_rounds': num_rounds,
    }


def _activate_ready(match_slots: list, current_active: list, num_courts: int) -> list:
    """Activate 'ready' slots until we fill up to num_courts active matches."""
    active = list(current_active)
    for s in match_slots:
        if len(active) >= num_courts:
            break
        if s['status'] == 'ready':
            s['status'] = 'active'
            active.append(s['id'])
    return active


def advance_bracket(bracket: dict, match_slot_id: str, winner_id: str,
                    num_courts: int = 1, db_match_id: Optional[str] = None) -> dict:
    """Record result and propagate winner. Activates more matches up to num_courts."""
    bracket = copy.deepcopy(bracket)
    slot_map = {s['id']: s for s in bracket['match_slots']}

    slot = slot_map.get(match_slot_id)
    if not slot:
        raise ValueError(f'Match slot {match_slot_id!r} not found')
    if winner_id not in (slot['top_team_id'], slot['bottom_team_id']):
        raise ValueError('winner_id must be one of the two teams in this slot')

    slot['winner_id'] = winner_id
    slot['db_match_id'] = db_match_id
    slot['status'] = 'done'

    # Remove from active list
    active_ids = [x for x in bracket.get('active_match_ids', []) if x != match_slot_id]

    # Propagate winner to downstream slots
    for downstream in bracket['match_slots']:
        feeds = downstream.get('feeds', [])
        if match_slot_id in feeds:
            idx = feeds.index(match_slot_id)
            if idx == 0:
                downstream['top_team_id'] = winner_id
            else:
                downstream['bottom_team_id'] = winner_id

            if (downstream['top_team_id'] and downstream['bottom_team_id']
                    and downstream['status'] == 'pending'):
                downstream['status'] = 'ready'

    # Activate more matches to fill courts
    active_ids = _activate_ready(bracket['match_slots'], active_ids, num_courts)

    bracket['active_match_ids'] = active_ids
    bracket['current_match_id'] = active_ids[0] if active_ids else None

    max_round = bracket['num_rounds']
    finals = [s for s in bracket['match_slots'] if s['round'] == max_round]
    if finals and all(s['status'] == 'done' for s in finals):
        bracket['champion_team_id'] = finals[0]['winner_id']
        bracket['status'] = 'complete'

    return bracket


def randomize_teams(player_ids: list, team_size: int = 2) -> list:
    ids = list(player_ids)
    random.shuffle(ids)
    teams = []
    for i in range(0, len(ids) - team_size + 1, team_size):
        teams.append({'player_ids': ids[i:i + team_size]})
    return teams

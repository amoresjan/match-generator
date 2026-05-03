"""
Test: 2v2 fair rotation
Scenarios:
  A) 12 players, 1 court, 15 rounds  (4 play, 8 sit)
  B) 12 players, 2 courts, 15 rounds (8 play, 4 sit)
  C) 8 players,  2 courts, 15 rounds (8 play, 0 sit — no byes)
  D) 16 players, 2 courts, 15 rounds (8 play, 8 sit)
Checks all 5-round preview snapshots against committed rounds.
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pickleball.settings')
django.setup()

from sessions_app.models import Session, Player
from sessions_app.services.match_generator import generate_round, commit_round, preview_rounds

PREVIEW_SIZE = 5


def active_set(round_data):
    return frozenset(pid for c in round_data['courts'] for pid in c['team1'] + c['team2'])


def bye_set(round_data):
    return frozenset(round_data['bye_players'])


def run_scenario(label: str, num_players: int, num_courts: int, num_rounds: int):
    print(f'\n{"="*60}')
    print(f'  {label}')
    print(f'  {num_players} players · {num_courts} court(s) · {num_rounds} rounds · 2v2')
    print(f'{"="*60}')

    session = Session.objects.create(
        name=label,
        match_type='2v2',
        num_courts=num_courts,
        generation_mode='fair',
    )
    names = [f'P{i+1:02d}' for i in range(num_players)]
    players = [Player.objects.create(session=session, name=n) for n in names]
    pid_to_name = {str(p.id): p.name for p in players}

    sit_out_counts = {n: 0 for n in names}
    play_history: dict[str, list[bool]] = {n: [] for n in names}
    partner_counts: dict[str, dict[str, int]] = {n: {} for n in names}
    opponent_counts: dict[str, dict[str, int]] = {n: {} for n in names}
    preview_mismatches = 0
    preview_snapshot: list = []
    block_start = 1

    for rn in range(1, num_rounds + 1):
        if (rn - 1) % PREVIEW_SIZE == 0:
            preview_snapshot = preview_rounds(session, count=PREVIEW_SIZE)
            block_start = rn

        slot = rn - block_start
        expected = preview_snapshot[slot]

        generated = generate_round(session)
        commit_round(session, generated)

        match_ok = (active_set(generated) == active_set(expected) and
                    bye_set(generated) == bye_set(expected))
        if not match_ok:
            preview_mismatches += 1

        active = active_set(generated)
        bye = bye_set(generated)

        playing_names = {pid_to_name[pid] for pid in active}
        for name in names:
            play_history[name].append(name in playing_names)

        for pid in bye:
            sit_out_counts[pid_to_name[pid]] += 1

        for court in generated['courts']:
            t1 = [pid_to_name[p] for p in court['team1']]
            t2 = [pid_to_name[p] for p in court['team2']]
            for a in t1:
                for b in t1:
                    if a != b:
                        partner_counts[a][b] = partner_counts[a].get(b, 0) + 1
                for b in t2:
                    opponent_counts[a][b] = opponent_counts[a].get(b, 0) + 1
            for a in t2:
                for b in t2:
                    if a != b:
                        partner_counts[a][b] = partner_counts[a].get(b, 0) + 1
                for b in t1:
                    opponent_counts[a][b] = opponent_counts[a].get(b, 0) + 1

        tag = f'slot {slot+1}/{PREVIEW_SIZE}'
        status = '✓' if match_ok else f'✗ MISMATCH ({tag})'
        courts_str = '  '.join(
            f'[{" & ".join(pid_to_name[p] for p in c["team1"])}] vs [{" & ".join(pid_to_name[p] for p in c["team2"])}]'
            for c in generated['courts']
        )
        bye_str = ', '.join(sorted(pid_to_name[p] for p in bye)) if bye else '—'
        print(f'  Round {rn:2d} [{tag}]: {courts_str}  |  bye: {bye_str}  |  {status}')

    # ── Stats ─────────────────────────────────────────────────────────────────
    print(f'\n  Preview accuracy: {num_rounds - preview_mismatches}/{num_rounds}')
    assert preview_mismatches == 0, f'Preview mismatches: {preview_mismatches}'

    wait_vals = list(sit_out_counts.values())
    print(f'  Sit-out range: {min(wait_vals)}–{max(wait_vals)} (ideal: even)')
    assert max(wait_vals) - min(wait_vals) <= 1, f'Uneven sit-out: {sit_out_counts}'

    max_streak = 0
    for name, history in play_history.items():
        streak = cur = 0
        for played in history:
            if not played:
                cur += 1
                streak = max(streak, cur)
            else:
                cur = 0
        max_streak = max(max_streak, streak)
    print(f'  Max consecutive sit-outs: {max_streak}')

    max_partner = max(
        (v for partners in partner_counts.values() for v in partners.values()),
        default=0,
    )
    max_opp = max(
        (v for opps in opponent_counts.values() for v in opps.values()),
        default=0,
    )
    print(f'  Max partner repeats: {max_partner}')
    print(f'  Max opponent repeats: {max_opp}')

    session.delete()
    print(f'  PASSED ✓')


run_scenario('A: 12 players, 1 court',  num_players=12, num_courts=1, num_rounds=15)
run_scenario('B: 12 players, 2 courts', num_players=12, num_courts=2, num_rounds=15)
run_scenario('C: 8 players,  2 courts', num_players=8,  num_courts=2, num_rounds=15)
run_scenario('D: 16 players, 2 courts', num_players=16, num_courts=2, num_rounds=15)

print('\nAll 2v2 scenarios passed.\n')

"""
Test: 12 players, 1 court, 15 rounds — 2v2 fair rotation.
Checks:
  - All 5-round preview snapshots match the actually committed rounds
  - Sit-out distribution is perfectly even
  - No partner repeat > 2x, no opponent repeat > 4x
  - Max consecutive sit-outs ≤ 4 (8/12 players sit each round)
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pickleball.settings')
django.setup()

from sessions_app.models import Session, Player
from sessions_app.services.match_generator import generate_round, commit_round, preview_rounds

PREVIEW_SIZE = 5
NUM_PLAYERS  = 12
NUM_COURTS   = 1
NUM_ROUNDS   = 15

# ── Setup ────────────────────────────────────────────────────────────────────

session = Session.objects.create(
    name='Test 12p 1c',
    match_type='2v2',
    num_courts=NUM_COURTS,
    generation_mode='fair',
)
names = [f'P{i+1:02d}' for i in range(NUM_PLAYERS)]
players = [Player.objects.create(session=session, name=n) for n in names]
pid_to_name = {str(p.id): p.name for p in players}

print(f'Session {session.id}')
print(f'Players: {", ".join(names)}\n')

# ── Helpers ───────────────────────────────────────────────────────────────────

def active_set(round_data):
    return frozenset(pid for c in round_data['courts'] for pid in c['team1'] + c['team2'])

def bye_set(round_data):
    return frozenset(round_data['bye_players'])

def court_key(court):
    """Canonical representation of a court: team memberships, ignoring team1/team2 label order."""
    t1 = frozenset(court['team1'])
    t2 = frozenset(court['team2'])
    return frozenset([t1, t2])

def teams_match(a, b):
    return frozenset(court_key(c) for c in a['courts']) == frozenset(court_key(c) for c in b['courts'])

def fmt_court(court):
    t1 = ' & '.join(sorted(pid_to_name[p] for p in court['team1']))
    t2 = ' & '.join(sorted(pid_to_name[p] for p in court['team2']))
    return f'[{t1}] vs [{t2}]'

# ── Run rounds ────────────────────────────────────────────────────────────────

sit_out_counts = {p.name: 0 for p in players}
play_history:   dict[str, list[bool]] = {p.name: [] for p in players}
partner_counts: dict[str, dict[str, int]] = {p.name: {} for p in players}
opponent_counts: dict[str, dict[str, int]] = {p.name: {} for p in players}

preview_snapshot: list = []   # 5-round preview taken at the start of each block
preview_mismatches = 0        # mismatches across all 15 committed rounds

for round_num in range(1, NUM_ROUNDS + 1):
    # Take a fresh 5-round snapshot at the start of each block
    if (round_num - 1) % PREVIEW_SIZE == 0:
        preview_snapshot = preview_rounds(session, count=PREVIEW_SIZE)
        block_start = round_num

    slot = round_num - block_start          # index into current snapshot (0–4)
    expected = preview_snapshot[slot]

    # Commit the round
    generated = generate_round(session)
    commit_round(session, generated)

    match_ok = (active_set(generated) == active_set(expected) and
                bye_set(generated)    == bye_set(expected) and
                teams_match(generated, expected))
    if not match_ok:
        preview_mismatches += 1

    # Track stats
    playing_names = {pid_to_name[p] for c in generated['courts'] for p in c['team1'] + c['team2']}
    for p in players:
        play_history[p.name].append(p.name in playing_names)

    for pid in generated['bye_players']:
        sit_out_counts[pid_to_name[pid]] += 1

    for court in generated['courts']:
        t1 = [pid_to_name[p] for p in court['team1']]
        t2 = [pid_to_name[p] for p in court['team2']]
        for a in t1:
            for b in t1:
                if a != b: partner_counts[a][b] = partner_counts[a].get(b, 0) + 1
            for b in t2: opponent_counts[a][b] = opponent_counts[a].get(b, 0) + 1
        for a in t2:
            for b in t2:
                if a != b: partner_counts[a][b] = partner_counts[a].get(b, 0) + 1
            for b in t1: opponent_counts[a][b] = opponent_counts[a].get(b, 0) + 1

    tag = f'preview slot {slot+1}/5'
    status = '✓' if match_ok else f'✗ MISMATCH ({tag})'
    if not match_ok:
        exp_str = '  '.join(fmt_court(c) for c in expected['courts'])
        print(f'  expected: {exp_str}')
    courts_str = '  '.join(fmt_court(c) for c in generated['courts'])
    bye_str = ', '.join(sorted(pid_to_name[p] for p in generated['bye_players'])) or '—'
    print(f'Round {round_num:2d} [{tag}]: {courts_str}  |  bye: {bye_str}  |  {status}')

# ── Summary ───────────────────────────────────────────────────────────────────

print(f'\n── Preview accuracy ─────────────────────────────────────────')
print(f'Mismatches: {preview_mismatches}/{NUM_ROUNDS}')
assert preview_mismatches == 0, 'Preview mismatches!'

print(f'\n── Sit-out distribution ─────────────────────────────────────')
wait_vals = list(sit_out_counts.values())
for name, count in sorted(sit_out_counts.items()):
    print(f'  {name}: {"█" * count} ({count})')
assert max(wait_vals) - min(wait_vals) <= 1, f'Uneven sit-out: {sit_out_counts}'

print(f'\n── Max partner repeats ──────────────────────────────────────')
max_partner = max((v for d in partner_counts.values() for v in d.values()), default=0)
for name, partners in sorted(partner_counts.items()):
    if partners:
        top = max(partners.items(), key=lambda x: x[1])
        if top[1] > 1: print(f'  {name} + {top[0]}: {top[1]}x')
print(f'  Max: {max_partner}x')

print(f'\n── Max opponent repeats ─────────────────────────────────────')
max_opp = max((v for d in opponent_counts.values() for v in d.values()), default=0)
for name, opps in sorted(opponent_counts.items()):
    if opps:
        top = max(opps.items(), key=lambda x: x[1])
        if top[1] > 2: print(f'  {name} vs {top[0]}: {top[1]}x')
print(f'  Max: {max_opp}x')

print(f'\n── Consecutive sit-outs ─────────────────────────────────────')
worst = 0
for name, history in sorted(play_history.items()):
    max_s = cur = 0
    streaks = []
    for played in history:
        if not played: cur += 1; max_s = max(max_s, cur)
        else:
            if cur: streaks.append(cur)
            cur = 0
    if cur: streaks.append(cur)
    worst = max(worst, max_s)
    print(f'  {name}: max {max_s}  (streaks: {" ".join(str(s) for s in streaks)})')
print(f'\n  Worst: {worst} consecutive sit-outs')
assert worst <= 4, f'Excessive consecutive sit-outs: {worst}'

session.delete()
print('\nDone. Session cleaned up.')

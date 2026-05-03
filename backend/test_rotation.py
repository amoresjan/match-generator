"""
Test: 12 players, 1 court, 15 rounds.
Checks:
  - Preview round N+1 matches the actually committed round N+1
  - Sit-out distribution is fair (each player sits roughly the same number of times)
  - No player plays against the same opponent excessively
  - No partner repeat within the same round
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pickleball.settings')
django.setup()

from sessions_app.models import Session, Player
from sessions_app.services.match_generator import generate_round, commit_round, preview_rounds

# ── Setup ────────────────────────────────────────────────────────────────────

session = Session.objects.create(
    name='Test 12p 1c',
    match_type='2v2',
    num_courts=1,
    generation_mode='fair',
)

names = [f'P{i+1:02d}' for i in range(12)]
players = [Player.objects.create(session=session, name=n) for n in names]

print(f'Session {session.id}')
print(f'Players: {", ".join(names)}\n')

# ── Run 15 rounds ─────────────────────────────────────────────────────────────

sit_out_counts = {p.name: 0 for p in players}
opponent_counts: dict[str, dict[str, int]] = {p.name: {} for p in players}
partner_counts: dict[str, dict[str, int]] = {p.name: {} for p in players}
play_history: dict[str, list[bool]] = {p.name: [] for p in players}  # True = played
preview_mismatches = 0

for round_num in range(1, 16):
    # Grab preview BEFORE committing and compare to what actually gets committed
    preview = preview_rounds(session, count=1)
    preview_court = preview[0]['courts'][0] if preview[0]['courts'] else None
    preview_bye = set(preview[0]['bye_players'])

    # Generate and commit
    generated = generate_round(session)
    rnd = commit_round(session, generated)

    actual_court = generated['courts'][0] if generated['courts'] else None
    actual_bye = set(generated['bye_players'])

    # Resolve names
    pid_to_name = {str(p.id): p.name for p in players}

    def resolve(ids): return sorted([pid_to_name[i] for i in ids])

    actual_t1 = resolve(actual_court['team1']) if actual_court else []
    actual_t2 = resolve(actual_court['team2']) if actual_court else []
    actual_bye_names = sorted([pid_to_name[i] for i in actual_bye])

    if preview_court:
        preview_t1 = resolve(preview_court['team1'])
        preview_t2 = resolve(preview_court['team2'])
        preview_bye_names = sorted([pid_to_name[i] for i in preview_bye])

        teams_match = (
            (preview_t1 == actual_t1 and preview_t2 == actual_t2) or
            (preview_t1 == actual_t2 and preview_t2 == actual_t1)
        )
        bye_match = preview_bye_names == actual_bye_names
        match_ok = teams_match and bye_match
    else:
        match_ok = True

    if not match_ok:
        preview_mismatches += 1

    # Track stats
    playing_names = set()
    for pid in actual_bye:
        sit_out_counts[pid_to_name[pid]] += 1

    if actual_court:
        for pid in actual_court['team1'] + actual_court['team2']:
            playing_names.add(pid_to_name[pid])

    for p in players:
        play_history[p.name].append(p.name in playing_names)

    if actual_court:
        t1_names = [pid_to_name[i] for i in actual_court['team1']]
        t2_names = [pid_to_name[i] for i in actual_court['team2']]
        for a in t1_names:
            for b in t1_names:
                if a != b:
                    partner_counts[a][b] = partner_counts[a].get(b, 0) + 1
            for b in t2_names:
                opponent_counts[a][b] = opponent_counts[a].get(b, 0) + 1
        for a in t2_names:
            for b in t2_names:
                if a != b:
                    partner_counts[a][b] = partner_counts[a].get(b, 0) + 1
            for b in t1_names:
                opponent_counts[a][b] = opponent_counts[a].get(b, 0) + 1

    preview_status = '✓ preview matched' if match_ok else '✗ PREVIEW MISMATCH'
    t1_str = ' & '.join(actual_t1) if actual_t1 else '—'
    t2_str = ' & '.join(actual_t2) if actual_t2 else '—'
    bye_str = ', '.join(actual_bye_names)
    print(f'Round {round_num:2d}: [{t1_str}] vs [{t2_str}]  |  bye: {bye_str}  |  {preview_status}')

# ── Summary ───────────────────────────────────────────────────────────────────

print(f'\n── Preview accuracy ─────────────────────────────────────────')
print(f'Mismatches: {preview_mismatches}/15')

print(f'\n── Sit-out distribution ─────────────────────────────────────')
for name, count in sorted(sit_out_counts.items()):
    bar = '█' * count
    print(f'  {name}: {bar} ({count})')

print(f'\n── Max partner repeats ──────────────────────────────────────')
for name, partners in sorted(partner_counts.items()):
    if partners:
        top = max(partners.items(), key=lambda x: x[1])
        if top[1] > 1:
            print(f'  {name} + {top[0]}: {top[1]}x')

print(f'\n── Max opponent repeats ─────────────────────────────────────')
for name, opps in sorted(opponent_counts.items()):
    if opps:
        top = max(opps.items(), key=lambda x: x[1])
        if top[1] > 2:
            print(f'  {name} vs {top[0]}: {top[1]}x')

print(f'\n── Consecutive sit-outs ─────────────────────────────────────')
worst_streak = 0
for name, history in sorted(play_history.items()):
    max_streak = 0
    streak = 0
    streaks = []
    for played in history:
        if not played:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            if streak > 0:
                streaks.append(streak)
            streak = 0
    if streak > 0:
        streaks.append(streak)
    worst_streak = max(worst_streak, max_streak)
    bar = ' '.join(f'{s}' for s in streaks)
    print(f'  {name}: max {max_streak} consecutive  (streaks: {bar})')
print(f'\n  Worst across all players: {worst_streak} consecutive sit-outs')

# Cleanup
session.delete()
print('\nDone. Session cleaned up.')

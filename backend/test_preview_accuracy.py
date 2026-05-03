"""
Targeted test: verify the upcoming-rounds preview always matches actual generation.

Simulates exactly what the user reported:
  1. After round 1 is committed, the preview shows rounds 2–6.
     Record what round 5 is predicted to be.
  2. After each subsequent round (2, 3, 4), take a fresh preview.
     The round-5 prediction may change — that is EXPECTED — but the
     prediction shown JUST BEFORE round 5 is generated must match
     what generate_round actually produces.
  3. Generate round 5 and compare against the most recent preview.
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pickleball.settings')
django.setup()

from sessions_app.models import Session, Player
from sessions_app.services.match_generator import generate_round, commit_round, preview_rounds

TARGET_ROUND = 5

def court_key(court):
    return frozenset([frozenset(court['team1']), frozenset(court['team2'])])

def teams_match(a, b):
    return frozenset(court_key(c) for c in a['courts']) == frozenset(court_key(c) for c in b['courts'])

def fmt(round_data, pid_to_name):
    return '  '.join(
        f'[{" & ".join(sorted(pid_to_name[p] for p in c["team1"]))}]'
        f' vs [{" & ".join(sorted(pid_to_name[p] for p in c["team2"]))}]'
        for c in round_data['courts']
    )


def run(label, num_players, num_courts):
    print(f'\n{"="*60}')
    print(f'  {label}  (target: round {TARGET_ROUND})')
    print(f'{"="*60}')

    session = Session.objects.create(
        name=label, match_type='2v2', num_courts=num_courts, generation_mode='fair',
    )
    names = [f'P{i+1:02d}' for i in range(num_players)]
    players = [Player.objects.create(session=session, name=n) for n in names]
    pid_to_name = {str(p.id): p.name for p in players}

    round5_predictions = {}   # {after_round_N: GeneratedRound}

    for rn in range(1, TARGET_ROUND + 1):
        # Before generating round rn, take a fresh preview
        preview = preview_rounds(session, count=TARGET_ROUND)
        # preview[4] is always the TARGET_ROUND-th upcoming round
        # (since next_round_number increments each commit)
        # More precisely: round (rn + TARGET_ROUND - 1) = round TARGET_ROUND when rn=1
        # After round (rn-1) committed, preview[0] = round rn, preview[4] = round rn+4
        # So to get round TARGET_ROUND we want preview[TARGET_ROUND - rn]
        idx = TARGET_ROUND - rn
        if idx >= 0:
            r5_pred = preview[idx]
            round5_predictions[rn - 1] = r5_pred
            after_label = f'after {rn-1} rounds' if rn > 1 else 'fresh (0 rounds)'
            print(f'  Preview of round {TARGET_ROUND} {after_label:18s}: {fmt(r5_pred, pid_to_name)}')

        # Generate and commit round rn
        generated = generate_round(session)
        commit_round(session, generated)

        if rn == TARGET_ROUND:
            # Compare actual round 5 with the latest preview (taken just before this round)
            latest_preview = round5_predictions[rn - 1]
            ok = teams_match(generated, latest_preview)
            print(f'\n  Actual round {TARGET_ROUND}:              {fmt(generated, pid_to_name)}')
            print(f'  Latest preview (before round {TARGET_ROUND}):  {fmt(latest_preview, pid_to_name)}')
            print(f'\n  Match: {"✓ YES" if ok else "✗ NO — MISMATCH"}')
            if not ok:
                print(f'\n  HISTORY OF PREDICTIONS:')
                for after_n, pred in sorted(round5_predictions.items()):
                    lbl = f'after {after_n} rounds' if after_n > 0 else 'fresh (0 rounds)'
                    match = '=' if teams_match(pred, generated) else '≠'
                    print(f'    {lbl:20s} [{match} actual]: {fmt(pred, pid_to_name)}')
            assert ok, f'Mismatch: latest preview of round {TARGET_ROUND} != actual round {TARGET_ROUND}'

    session.delete()
    print(f'  PASSED ✓')


run('12p 1c 2v2', num_players=12, num_courts=1)
run('12p 2c 2v2', num_players=12, num_courts=2)
run('8p 2c 2v2',  num_players=8,  num_courts=2)
run('16p 2c 2v2', num_players=16, num_courts=2)

print('\nAll checks passed.\n')

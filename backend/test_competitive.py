"""
Test: competitive generation mode

1. Preview accuracy across 10-round runs (competitive mode, no winners set):
   - 8p 2c 2v2 competitive
   - 12p 2c 2v2 competitive
   - 6p 2c 1v1 competitive
   - 10p 2c 1v1 competitive

2. Win-based matching 1v1: 4 players, 2 courts. After round 1, the 2 winners
   should face each other on court 1 in round 2.

3. Win-based matching 2v2: 8 players, 2 courts. After round 1, court 1 in
   round 2 should have a higher (or equal) average win count than court 2.
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pickleball.settings')
django.setup()

from sessions_app.models import Session, Player, Match
from sessions_app.services.match_generator import generate_round, commit_round, preview_rounds

PREVIEW_SIZE = 5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def active_set(round_data):
    return frozenset(pid for c in round_data['courts'] for pid in c['team1'] + c['team2'])


def bye_set(round_data):
    return frozenset(round_data['bye_players'])


def teams_match(a, b):
    def court_key(court):
        return frozenset([frozenset(court['team1']), frozenset(court['team2'])])
    return frozenset(court_key(c) for c in a['courts']) == frozenset(court_key(c) for c in b['courts'])


def court_avg_wins(court, wins):
    all_players = court['team1'] + court['team2']
    return sum(wins.get(p, 0) for p in all_players) / max(len(all_players), 1)


# ---------------------------------------------------------------------------
# Test 1 — Preview accuracy (competitive, no winners recorded)
# ---------------------------------------------------------------------------

def test_preview_accuracy_competitive(label, num_players, num_courts, num_rounds, match_type):
    print(f'\n{"="*60}')
    print(f'  Preview accuracy — {label}')
    print(f'  {num_players}p {num_courts}c {match_type} competitive · {num_rounds} rounds')
    print(f'{"="*60}')

    session = Session.objects.create(
        name=label,
        match_type=match_type,
        num_courts=num_courts,
        generation_mode='competitive',
    )
    players = [Player.objects.create(session=session, name=f'P{i+1:02d}') for i in range(num_players)]
    pid_to_name = {str(p.id): p.name for p in players}

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
        # Commit WITHOUT setting any winners — wins stay at 0 throughout
        commit_round(session, generated)

        match_ok = (
            active_set(generated) == active_set(expected)
            and bye_set(generated) == bye_set(expected)
            and teams_match(generated, expected)
        )
        if not match_ok:
            preview_mismatches += 1
            tag = f'slot {slot+1}/{PREVIEW_SIZE}'
            if match_type == '2v2':
                exp_str = '  '.join(
                    f'[{" & ".join(pid_to_name.get(p, p) for p in c["team1"])}]'
                    f' vs [{" & ".join(pid_to_name.get(p, p) for p in c["team2"])}]'
                    for c in expected['courts']
                )
                gen_str = '  '.join(
                    f'[{" & ".join(pid_to_name.get(p, p) for p in c["team1"])}]'
                    f' vs [{" & ".join(pid_to_name.get(p, p) for p in c["team2"])}]'
                    for c in generated['courts']
                )
            else:
                exp_str = '  '.join(
                    f'[{pid_to_name.get(c["team1"][0], c["team1"][0])}]'
                    f' vs [{pid_to_name.get(c["team2"][0], c["team2"][0])}]'
                    for c in expected['courts']
                )
                gen_str = '  '.join(
                    f'[{pid_to_name.get(c["team1"][0], c["team1"][0])}]'
                    f' vs [{pid_to_name.get(c["team2"][0], c["team2"][0])}]'
                    for c in generated['courts']
                )
            print(f'    MISMATCH at {tag}:')
            print(f'      preview: {exp_str}')
            print(f'      actual:  {gen_str}')

        tag = f'slot {slot+1}/{PREVIEW_SIZE}'
        status = 'ok' if match_ok else f'MISMATCH ({tag})'
        bye_str = ', '.join(sorted(pid_to_name[p] for p in bye_set(generated))) or '-'
        print(f'  Round {rn:2d} [{tag}]: bye: {bye_str}  |  {status}')

    print(f'\n  Preview accuracy: {num_rounds - preview_mismatches}/{num_rounds}')
    assert preview_mismatches == 0, f'Preview mismatches in {label}: {preview_mismatches}'

    session.delete()
    print(f'  PASSED')


# ---------------------------------------------------------------------------
# Test 2 — Win-based matching, 1v1
# ---------------------------------------------------------------------------

def test_win_matching_1v1():
    print(f'\n{"="*60}')
    print(f'  Win-based matching — 1v1: 4 players, 2 courts')
    print(f'{"="*60}')

    session = Session.objects.create(
        name='win-1v1',
        match_type='1v1',
        num_courts=2,
        generation_mode='competitive',
    )
    players = [Player.objects.create(session=session, name=f'P{i+1:02d}') for i in range(4)]
    pid_to_name = {str(p.id): p.name for p in players}

    # Round 1
    gen1 = generate_round(session)
    rnd1 = commit_round(session, gen1)

    # Set winner='team1' on both matches  → 2 players get 1 win, 2 get 0 wins
    matches_r1 = list(Match.objects.filter(round=rnd1).order_by('court_number'))
    assert len(matches_r1) == 2, f'Expected 2 matches in round 1, got {len(matches_r1)}'

    winners_r1 = set()
    for m in matches_r1:
        m.winner = 'team1'
        m.save(update_fields=['winner'])
        winners_r1.update(m.team1_players)

    print(f'  Round 1 winners: {[pid_to_name[p] for p in winners_r1]}')

    # Round 2 — competitive should place winners together on court 1
    gen2 = generate_round(session)
    assert len(gen2['courts']) >= 1, 'Round 2 must have at least 1 court'

    court1 = gen2['courts'][0]
    court1_players = set(court1['team1'] + court1['team2'])

    print(f'  Round 2 court 1: {[pid_to_name[p] for p in court1_players]}')
    print(f'  Winners should be on court 1: {[pid_to_name[p] for p in winners_r1]}')

    assert winners_r1 == court1_players, (
        f'Expected winners {[pid_to_name[p] for p in winners_r1]} on court 1, '
        f'but got {[pid_to_name[p] for p in court1_players]}'
    )

    session.delete()
    print('  PASSED')


# ---------------------------------------------------------------------------
# Test 3 — Win-based matching, 2v2
# ---------------------------------------------------------------------------

def test_win_matching_2v2():
    print(f'\n{"="*60}')
    print(f'  Win-based matching — 2v2: 8 players, 2 courts')
    print(f'{"="*60}')

    session = Session.objects.create(
        name='win-2v2',
        match_type='2v2',
        num_courts=2,
        generation_mode='competitive',
    )
    players = [Player.objects.create(session=session, name=f'P{i+1:02d}') for i in range(8)]
    pid_to_name = {str(p.id): p.name for p in players}

    # Round 1
    gen1 = generate_round(session)
    rnd1 = commit_round(session, gen1)

    # Set winner='team1' on both courts  → team1 players each get 1 win
    matches_r1 = list(Match.objects.filter(round=rnd1).order_by('court_number'))
    assert len(matches_r1) == 2, f'Expected 2 matches in round 1, got {len(matches_r1)}'

    for m in matches_r1:
        m.winner = 'team1'
        m.save(update_fields=['winner'])

    # Build win counts by reading Match objects (no private imports)
    wins: dict[str, int] = {}
    for m in Match.objects.filter(round__session=session).exclude(winner__isnull=True):
        winning_team = m.team1_players if m.winner == 'team1' else m.team2_players
        for pid in winning_team:
            wins[str(pid)] = wins.get(str(pid), 0) + 1

    print(f'  Wins after round 1: { {pid_to_name[p]: w for p, w in wins.items()} }')

    # Round 2 — generate only, do NOT commit
    gen2 = generate_round(session)
    assert len(gen2['courts']) == 2, f'Expected 2 courts in round 2, got {len(gen2["courts"])}'

    court1 = gen2['courts'][0]
    court2 = gen2['courts'][1]
    avg1 = court_avg_wins(court1, wins)
    avg2 = court_avg_wins(court2, wins)

    print(f'  Round 2 court 1 avg wins: {avg1:.2f}  players: {[pid_to_name[p] for p in court1["team1"] + court1["team2"]]}')
    print(f'  Round 2 court 2 avg wins: {avg2:.2f}  players: {[pid_to_name[p] for p in court2["team1"] + court2["team2"]]}')

    assert avg1 >= avg2, (
        f'Court 1 avg wins ({avg1}) should be >= court 2 avg wins ({avg2}) in competitive mode'
    )

    session.delete()
    print('  PASSED')


# ---------------------------------------------------------------------------
# Run all tests
# ---------------------------------------------------------------------------

test_preview_accuracy_competitive('8p 2c 2v2 competitive',  num_players=8,  num_courts=2, num_rounds=10, match_type='2v2')
test_preview_accuracy_competitive('12p 2c 2v2 competitive', num_players=12, num_courts=2, num_rounds=10, match_type='2v2')
test_preview_accuracy_competitive('6p 2c 1v1 competitive',  num_players=6,  num_courts=2, num_rounds=10, match_type='1v1')
test_preview_accuracy_competitive('10p 2c 1v1 competitive', num_players=10, num_courts=2, num_rounds=10, match_type='1v1')

test_win_matching_1v1()
test_win_matching_2v2()

print('\nAll competitive tests passed.\n')

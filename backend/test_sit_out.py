"""
Test: sit_out flag behaviour

1. Excluded from all rounds: 2 players marked sit_out=True before any rounds
   never appear in active players or bye_players across 5 rounds.

2. Toggle back in: one excluded player set to sit_out=False; assert they appear
   in at least one of the next 5 rounds (playing or bye).

3. Toggle out mid-session: 8 players, 3 normal rounds, then one player is set
   to sit_out=True; assert that player never appears in rounds 4-8.

4. Preview reflects current state: after toggling a player to sit_out=True,
   preview_rounds must not include them; after toggling back, the player must
   appear in the preview's player pool (active_set union bye_set).
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pickleball.settings')
django.setup()

from sessions_app.models import Session, Player
from sessions_app.services.match_generator import generate_round, commit_round, preview_rounds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def all_pids_in_round(round_data):
    """All player IDs mentioned in a generated round (playing + bye)."""
    active = frozenset(pid for c in round_data['courts'] for pid in c['team1'] + c['team2'])
    bye = frozenset(round_data['bye_players'])
    return active | bye


def active_set(round_data):
    return frozenset(pid for c in round_data['courts'] for pid in c['team1'] + c['team2'])


def bye_set(round_data):
    return frozenset(round_data['bye_players'])


# ---------------------------------------------------------------------------
# Test 1 — Excluded players never appear
# ---------------------------------------------------------------------------

def test_excluded_never_appear():
    print(f'\n{"="*60}')
    print('  Test 1: excluded players (sit_out=True) never appear')
    print(f'{"="*60}')

    session = Session.objects.create(
        name='sitout-test1',
        match_type='2v2',
        num_courts=2,
        generation_mode='fair',
    )
    players = [Player.objects.create(session=session, name=f'P{i+1:02d}') for i in range(8)]
    pid_to_name = {str(p.id): p.name for p in players}

    # Mark last 2 players as sit_out
    excluded = players[6:]
    excluded_ids = {str(p.id) for p in excluded}
    for p in excluded:
        p.sit_out = True
        p.save()

    print(f'  Excluded: {[p.name for p in excluded]}')

    for rn in range(1, 6):
        generated = generate_round(session)
        commit_round(session, generated)

        pids = all_pids_in_round(generated)
        for eid in excluded_ids:
            assert eid not in pids, (
                f'Round {rn}: excluded player {pid_to_name[eid]} appeared in round data'
            )
        bye_str = ', '.join(sorted(pid_to_name[p] for p in bye_set(generated))) or '-'
        print(f'  Round {rn}: active={len(active_set(generated))} bye={bye_str}  ok')

    # Return session + excluded players for test 2 to reuse
    return session, players, pid_to_name, excluded


# ---------------------------------------------------------------------------
# Test 2 — Toggle back in
# ---------------------------------------------------------------------------

def test_toggle_back_in(session, players, pid_to_name, excluded):
    print(f'\n{"="*60}')
    print('  Test 2: toggle one excluded player back in')
    print(f'{"="*60}')

    # Toggle the first excluded player back in
    toggled_player = excluded[0]
    toggled_id = str(toggled_player.id)
    toggled_player.sit_out = False
    toggled_player.save()

    print(f'  Toggled back in: {toggled_player.name}')

    appeared = False
    for rn in range(6, 11):
        generated = generate_round(session)
        commit_round(session, generated)

        pids = all_pids_in_round(generated)
        if toggled_id in pids:
            appeared = True
            status = 'appeared'
        else:
            status = 'absent'
        bye_str = ', '.join(sorted(pid_to_name[p] for p in bye_set(generated))) or '-'
        print(f'  Round {rn}: {toggled_player.name} {status}  |  bye: {bye_str}')

    assert appeared, (
        f'{toggled_player.name} never appeared in rounds 6-10 after being toggled back in'
    )

    session.delete()
    print('  PASSED')


# ---------------------------------------------------------------------------
# Test 3 — Toggle out mid-session
# ---------------------------------------------------------------------------

def test_toggle_out_mid_session():
    print(f'\n{"="*60}')
    print('  Test 3: toggle player out mid-session (after round 3)')
    print(f'{"="*60}')

    session = Session.objects.create(
        name='sitout-test3',
        match_type='2v2',
        num_courts=2,
        generation_mode='fair',
    )
    players = [Player.objects.create(session=session, name=f'Q{i+1:02d}') for i in range(8)]
    pid_to_name = {str(p.id): p.name for p in players}

    # Rounds 1-3 — normal, everyone eligible
    for rn in range(1, 4):
        generated = generate_round(session)
        commit_round(session, generated)
        bye_str = ', '.join(sorted(pid_to_name[p] for p in bye_set(generated))) or '-'
        print(f'  Round {rn} (normal): bye: {bye_str}')

    # Toggle out one player
    toggled_out = players[0]
    toggled_id = str(toggled_out.id)
    toggled_out.sit_out = True
    toggled_out.save()
    print(f'\n  Marked {toggled_out.name} as sit_out=True\n')

    # Rounds 4-8 — toggled player must never appear
    for rn in range(4, 9):
        generated = generate_round(session)
        commit_round(session, generated)

        pids = all_pids_in_round(generated)
        assert toggled_id not in pids, (
            f'Round {rn}: {toggled_out.name} appeared after being toggled out'
        )
        bye_str = ', '.join(sorted(pid_to_name[p] for p in bye_set(generated))) or '-'
        print(f'  Round {rn}: {toggled_out.name} absent  |  bye: {bye_str}  ok')

    session.delete()
    print('  PASSED')


# ---------------------------------------------------------------------------
# Test 4 — Preview reflects current sit_out state
# ---------------------------------------------------------------------------

def test_preview_reflects_sitout():
    print(f'\n{"="*60}')
    print('  Test 4: preview_rounds reflects sit_out state immediately')
    print(f'{"="*60}')

    session = Session.objects.create(
        name='sitout-test4',
        match_type='2v2',
        num_courts=2,
        generation_mode='fair',
    )
    players = [Player.objects.create(session=session, name=f'R{i+1:02d}') for i in range(8)]
    pid_to_name = {str(p.id): p.name for p in players}

    target = players[3]
    target_id = str(target.id)

    # Step A — mark player as sit_out=True, preview must NOT include them
    target.sit_out = True
    target.save()
    print(f'  Marked {target.name} as sit_out=True')

    preview_out = preview_rounds(session, count=5)
    for i, pr in enumerate(preview_out):
        pids = all_pids_in_round(pr)
        assert target_id not in pids, (
            f'Preview slot {i+1}: sit_out player {target.name} appeared in preview'
        )
    print(f'  Preview (sit_out=True): {target.name} absent from all 5 slots  ok')

    # Step B — toggle player back in, preview MUST include them at least once
    target.sit_out = False
    target.save()
    print(f'  Toggled {target.name} back to sit_out=False')

    preview_in = preview_rounds(session, count=5)
    pool = set()
    for pr in preview_in:
        pool |= all_pids_in_round(pr)

    assert target_id in pool, (
        f'{target.name} did not appear in any preview slot after being toggled back in. '
        f'Pool: {[pid_to_name.get(p, p) for p in pool]}'
    )
    print(f'  Preview (sit_out=False): {target.name} present in preview pool  ok')

    session.delete()
    print('  PASSED')


# ---------------------------------------------------------------------------
# Run all tests
# ---------------------------------------------------------------------------

# Tests 1 & 2 share a session
session_t1, players_t1, pid_map_t1, excluded_t1 = test_excluded_never_appear()
print('  PASSED')

test_toggle_back_in(session_t1, players_t1, pid_map_t1, excluded_t1)

test_toggle_out_mid_session()
test_preview_reflects_sitout()

print('\nAll sit_out tests passed.\n')

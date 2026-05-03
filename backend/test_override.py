"""
Test: match override and reconcile_round_history

1. Partner history updated: override [A,B] vs [C,D] → [A,C] vs [B,D];
   verify PlayerRoundHistory reflects the new assignment.

2. Sit-out count adjusted: override to swap a bye player into the game;
   verify total_wait_rounds is decremented for the newly-active player
   and incremented for the newly-ousted player.

3. Future rounds use overridden history: after overriding round 1 to [A,C]
   vs [B,D] and reconciling, generate round 2 and assert A and C are NOT
   teammates (cost function penalises re-pairing them at PARTNER_REPEAT_W=5.0).
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pickleball.settings')
django.setup()

from sessions_app.models import Session, Player, Match, PlayerRoundHistory
from sessions_app.services.match_generator import (
    generate_round, commit_round, reconcile_round_history,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def pid(player):
    return str(player.id)


def get_history(player, rnd):
    """Fetch a single PlayerRoundHistory row."""
    return PlayerRoundHistory.objects.get(player=player, round=rnd)


# ---------------------------------------------------------------------------
# Test 1 — Partner history updated after override
# ---------------------------------------------------------------------------

def test_partner_history_updated():
    print(f'\n{"="*60}')
    print('  Test 1: partner history updated after override')
    print(f'{"="*60}')

    session = Session.objects.create(
        name='override-test1',
        match_type='2v2',
        num_courts=1,
        generation_mode='fair',
    )
    # 4 players — exactly 1 court, no byes
    A, B, C, D = [Player.objects.create(session=session, name=n) for n in ('A', 'B', 'C', 'D')]
    pA, pB, pC, pD = pid(A), pid(B), pid(C), pid(D)

    # Generate + commit round 1; read original teams from gen result
    gen1 = generate_round(session)
    rnd1 = commit_round(session, gen1)

    # Original assignment from gen1
    orig_court = gen1['courts'][0]
    orig_t1 = set(orig_court['team1'])
    orig_t2 = set(orig_court['team2'])
    print(f'  Original: {sorted(orig_t1)} vs {sorted(orig_t2)}')

    # Override to [A, C] vs [B, D]
    match = Match.objects.get(round=rnd1, court_number=1)
    match.team1_players = [pA, pC]
    match.team2_players = [pB, pD]
    match.save()
    print(f'  Override → [A, C] vs [B, D]')

    reconcile_round_history(rnd1)

    # Verify PlayerRoundHistory
    hA = get_history(A, rnd1)
    hB = get_history(B, rnd1)
    hC = get_history(C, rnd1)
    hD = get_history(D, rnd1)

    # A's partner_ids must contain C (not B)
    assert pC in [str(x) for x in hA.partner_ids], (
        f'A.partner_ids should contain C; got {hA.partner_ids}'
    )
    assert pB not in [str(x) for x in hA.partner_ids], (
        f'A.partner_ids should NOT contain B after override; got {hA.partner_ids}'
    )

    # B's partner_ids must contain D (not A)
    assert pD in [str(x) for x in hB.partner_ids], (
        f'B.partner_ids should contain D; got {hB.partner_ids}'
    )
    assert pA not in [str(x) for x in hB.partner_ids], (
        f'B.partner_ids should NOT contain A after override; got {hB.partner_ids}'
    )

    # A's opponent_ids must contain both B and D
    a_opps = [str(x) for x in hA.opponent_ids]
    assert pB in a_opps, f'A.opponent_ids should contain B; got {a_opps}'
    assert pD in a_opps, f'A.opponent_ids should contain D; got {a_opps}'

    # C's opponent_ids must contain both B and D
    c_opps = [str(x) for x in hC.opponent_ids]
    assert pB in c_opps, f'C.opponent_ids should contain B; got {c_opps}'
    assert pD in c_opps, f'C.opponent_ids should contain D; got {c_opps}'

    print('  A.partner_ids contains C  ok')
    print('  B.partner_ids contains D  ok')
    print('  A.opponent_ids contains B and D  ok')
    print('  C.opponent_ids contains B and D  ok')

    session.delete()
    print('  PASSED')


# ---------------------------------------------------------------------------
# Test 2 — Sit-out count adjusted after override
# ---------------------------------------------------------------------------

def test_sit_out_count_adjusted():
    print(f'\n{"="*60}')
    print('  Test 2: sit_out count adjusted after override')
    print(f'{"="*60}')

    session = Session.objects.create(
        name='override-test2',
        match_type='2v2',
        num_courts=1,
        generation_mode='fair',
    )
    # 5 players — 1 court (4 play, 1 sits out)
    players = [Player.objects.create(session=session, name=f'P{i+1}') for i in range(5)]
    pid_to_player = {pid(p): p for p in players}

    gen1 = generate_round(session)
    rnd1 = commit_round(session, gen1)

    # Identify who sat out originally
    assert len(gen1['bye_players']) == 1, (
        f'Expected exactly 1 bye player, got {gen1["bye_players"]}'
    )
    p_bye_id = gen1['bye_players'][0]
    p_bye = pid_to_player[p_bye_id]

    # Pick a playing player to swap out in place of p_bye
    court = gen1['courts'][0]
    swap_out_id = court['team2'][0]   # one of team2's players
    swap_out = pid_to_player[swap_out_id]

    print(f'  Original bye: {p_bye.name}')
    print(f'  Swap out:     {swap_out.name}  (into bye)')
    print(f'  Swap in:      {p_bye.name}    (into team2)')

    # Refresh wait_rounds before reconcile
    p_bye.refresh_from_db()
    swap_out.refresh_from_db()
    assert p_bye.total_wait_rounds == 1, (
        f'{p_bye.name}.total_wait_rounds should be 1 before override, got {p_bye.total_wait_rounds}'
    )
    assert swap_out.total_wait_rounds == 0, (
        f'{swap_out.name}.total_wait_rounds should be 0 before override, got {swap_out.total_wait_rounds}'
    )

    # Override: swap swap_out → bye, p_bye → team2
    match = Match.objects.get(round=rnd1, court_number=1)
    new_t2 = [p for p in match.team2_players if p != swap_out_id] + [p_bye_id]
    match.team2_players = new_t2
    match.save()
    print(f'  Match overridden: team1={match.team1_players} team2={match.team2_players}')

    reconcile_round_history(rnd1)

    p_bye.refresh_from_db()
    swap_out.refresh_from_db()

    assert p_bye.total_wait_rounds == 0, (
        f'{p_bye.name}.total_wait_rounds should be 0 after override (was bye, now playing); '
        f'got {p_bye.total_wait_rounds}'
    )
    assert swap_out.total_wait_rounds == 1, (
        f'{swap_out.name}.total_wait_rounds should be 1 after override (now bye); '
        f'got {swap_out.total_wait_rounds}'
    )

    print(f'  {p_bye.name}.total_wait_rounds == 0  ok')
    print(f'  {swap_out.name}.total_wait_rounds == 1  ok')

    session.delete()
    print('  PASSED')


# ---------------------------------------------------------------------------
# Test 3 — Future rounds use overridden history
# ---------------------------------------------------------------------------

def test_future_rounds_use_overridden_history():
    print(f'\n{"="*60}')
    print('  Test 3: future rounds penalise overridden pairings')
    print(f'{"="*60}')

    session = Session.objects.create(
        name='override-test3',
        match_type='2v2',
        num_courts=1,
        generation_mode='fair',
    )
    A, B, C, D = [Player.objects.create(session=session, name=n) for n in ('A', 'B', 'C', 'D')]
    pA, pB, pC, pD = pid(A), pid(B), pid(C), pid(D)

    # Generate + commit round 1
    gen1 = generate_round(session)
    rnd1 = commit_round(session, gen1)

    print(f'  Round 1 original: {gen1["courts"][0]["team1"]} vs {gen1["courts"][0]["team2"]}')

    # Override to [A, C] vs [B, D] regardless of original
    match = Match.objects.get(round=rnd1, court_number=1)
    match.team1_players = [pA, pC]
    match.team2_players = [pB, pD]
    match.save()
    reconcile_round_history(rnd1)
    print(f'  Round 1 overridden to: [A, C] vs [B, D]')

    # Generate round 2 — history now penalises A-C pairing at 5.0
    gen2 = generate_round(session)
    court2 = gen2['courts'][0]
    r2_t1 = set(court2['team1'])
    r2_t2 = set(court2['team2'])

    print(f'  Round 2: {sorted(r2_t1)} vs {sorted(r2_t2)}')

    # A and C should NOT be on the same team in round 2
    a_and_c_same_team = (pA in r2_t1 and pC in r2_t1) or (pA in r2_t2 and pC in r2_t2)
    assert not a_and_c_same_team, (
        f'A and C should not be paired again in round 2 (PARTNER_REPEAT_W=5.0 penalty), '
        f'but they ended up on the same team: {sorted(r2_t1)} vs {sorted(r2_t2)}'
    )

    print('  A and C are NOT on the same team in round 2  ok')

    session.delete()
    print('  PASSED')


# ---------------------------------------------------------------------------
# Run all tests
# ---------------------------------------------------------------------------

test_partner_history_updated()
test_sit_out_count_adjusted()
test_future_rounds_use_overridden_history()

print('\nAll override tests passed.\n')

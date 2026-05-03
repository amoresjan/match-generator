"""
Test: permanent partner pairs in 2v2

For each scenario, 10 rounds are run. After every committed round we assert:
  a) No partner pair is split across teams (they are always on the same team)
  b) When a partner sits out, their partner also sits out (atomic sit-out)
  c) Each 5-round preview block matches the committed rounds (preview accuracy)

Additionally, sit-out distribution is checked for reasonable evenness:
  max - min sit-outs <= 2  (checked separately for pairs and singles)

Scenarios:
  A) 8p 2c, 4 permanent pairs  (no singles)
  B) 8p 2c, 2 pairs + 4 singles
  C) 12p 2c, 2 pairs + 8 singles  (4 byes per round)
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pickleball.settings')
django.setup()

from sessions_app.models import Session, Player
from sessions_app.services.match_generator import generate_round, commit_round, preview_rounds

PREVIEW_SIZE = 5
NUM_ROUNDS = 10


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


def make_pair(session, name1, name2):
    """Create two players and set them as permanent partners (symmetrically)."""
    p1 = Player.objects.create(session=session, name=name1)
    p2 = Player.objects.create(session=session, name=name2)
    p1.permanent_partner = p2
    p1.save()
    p2.permanent_partner = p1
    p2.save()
    return p1, p2


def assert_partners_never_split(round_data, pairs, pid_to_name, round_num):
    """Assert every permanent pair is always on the same team."""
    for p1_id, p2_id in pairs:
        for court in round_data['courts']:
            p1_in_t1 = p1_id in court['team1']
            p1_in_t2 = p1_id in court['team2']
            p2_in_t1 = p2_id in court['team1']
            p2_in_t2 = p2_id in court['team2']
            p1_here = p1_in_t1 or p1_in_t2
            p2_here = p2_in_t1 or p2_in_t2
            if p1_here or p2_here:
                # If one is on a court, both must be, and on the SAME team
                assert p1_here and p2_here, (
                    f'Round {round_num}: partner {pid_to_name[p1_id]} is on court '
                    f'but {pid_to_name[p2_id]} is not (or vice versa)'
                )
                same_team = (p1_in_t1 and p2_in_t1) or (p1_in_t2 and p2_in_t2)
                assert same_team, (
                    f'Round {round_num}: partners {pid_to_name[p1_id]} and '
                    f'{pid_to_name[p2_id]} were split across teams'
                )


def assert_pairs_sit_out_atomically(round_data, pairs, pid_to_name, round_num):
    """Assert that whenever one partner sits out, both sit out."""
    bye = bye_set(round_data)
    for p1_id, p2_id in pairs:
        p1_out = p1_id in bye
        p2_out = p2_id in bye
        assert p1_out == p2_out, (
            f'Round {round_num}: partner {pid_to_name[p1_id]} (out={p1_out}) and '
            f'{pid_to_name[p2_id]} (out={p2_out}) should sit out atomically'
        )


# ---------------------------------------------------------------------------
# Core scenario runner
# ---------------------------------------------------------------------------

def run_scenario(label, session, pairs, singles, pid_to_name):
    """
    Run NUM_ROUNDS rounds for the given session.
    pairs  : list of (p1_id, p2_id) tuples for permanent partners
    singles: list of player IDs without permanent partners
    """
    print(f'\n{"="*60}')
    print(f'  {label}')
    print(f'  {len(pairs)} pair(s), {len(singles)} single(s)  |  {NUM_ROUNDS} rounds')
    print(f'{"="*60}')

    sit_out_counts = {pid: 0 for pid in list(pid_to_name)}
    preview_mismatches = 0
    preview_snapshot: list = []
    block_start = 1

    for rn in range(1, NUM_ROUNDS + 1):
        if (rn - 1) % PREVIEW_SIZE == 0:
            preview_snapshot = preview_rounds(session, count=PREVIEW_SIZE)
            block_start = rn

        slot = rn - block_start
        expected = preview_snapshot[slot]

        generated = generate_round(session)
        commit_round(session, generated)

        # a) Partners never split
        assert_partners_never_split(generated, pairs, pid_to_name, rn)

        # b) Partners sit out atomically
        assert_pairs_sit_out_atomically(generated, pairs, pid_to_name, rn)

        # c) Preview accuracy
        match_ok = (
            active_set(generated) == active_set(expected)
            and bye_set(generated) == bye_set(expected)
            and teams_match(generated, expected)
        )
        if not match_ok:
            preview_mismatches += 1
            tag = f'slot {slot+1}/{PREVIEW_SIZE}'
            print(f'    MISMATCH at {tag}:')

        for pid in bye_set(generated):
            sit_out_counts[pid] += 1

        tag = f'slot {slot+1}/{PREVIEW_SIZE}'
        status = 'ok' if match_ok else f'MISMATCH ({tag})'
        bye_str = ', '.join(sorted(pid_to_name[p] for p in bye_set(generated))) or '-'
        courts_str = '  '.join(
            f'[{" & ".join(pid_to_name[p] for p in c["team1"])}]'
            f' vs [{" & ".join(pid_to_name[p] for p in c["team2"])}]'
            for c in generated['courts']
        )
        print(f'  Round {rn:2d} [{tag}]: {courts_str}  |  bye: {bye_str}  |  {status}')

    print(f'\n  Preview accuracy: {NUM_ROUNDS - preview_mismatches}/{NUM_ROUNDS}')
    assert preview_mismatches == 0, f'Preview mismatches: {preview_mismatches}'

    # Sit-out distribution — pairs (unit = pair sit-outs counted once per pair)
    if pairs:
        pair_sit_outs = {(p1, p2): sit_out_counts[p1] for p1, p2 in pairs}
        pair_vals = list(pair_sit_outs.values())
        print(f'  Pair sit-out counts:   { {pid_to_name[p1]: v for (p1, _), v in zip(pairs, pair_vals)} }')
        assert max(pair_vals) - min(pair_vals) <= 2, (
            f'Uneven pair sit-outs (max-min={max(pair_vals)-min(pair_vals)}): {pair_sit_outs}'
        )

    # Sit-out distribution — singles
    if singles:
        single_vals = [sit_out_counts[pid] for pid in singles]
        print(f'  Single sit-out range:  {min(single_vals)}–{max(single_vals)}')
        assert max(single_vals) - min(single_vals) <= 2, (
            f'Uneven single sit-outs (max-min={max(single_vals)-min(single_vals)}): '
            f'{ {pid_to_name[p]: sit_out_counts[p] for p in singles} }'
        )

    session.delete()
    print('  PASSED')


# ---------------------------------------------------------------------------
# Scenario A: 8 players, 2 courts — 4 permanent pairs, no singles
# ---------------------------------------------------------------------------

def scenario_a():
    session = Session.objects.create(
        name='perm-A-8p-4pairs',
        match_type='2v2',
        num_courts=2,
        generation_mode='fair',
    )
    pair_players = []
    for i in range(4):
        p1, p2 = make_pair(session, f'A{i*2+1:02d}', f'A{i*2+2:02d}')
        pair_players.append((str(p1.id), str(p2.id)))

    pid_to_name = {}
    for p in session.players.all():
        pid_to_name[str(p.id)] = p.name

    singles: list[str] = []
    run_scenario('Scenario A: 8p 2c, 4 pairs', session, pair_players, singles, pid_to_name)


# ---------------------------------------------------------------------------
# Scenario B: 8 players, 2 courts — 2 pairs + 4 singles
# ---------------------------------------------------------------------------

def scenario_b():
    session = Session.objects.create(
        name='perm-B-8p-2pairs',
        match_type='2v2',
        num_courts=2,
        generation_mode='fair',
    )
    pair_players = []
    for i in range(2):
        p1, p2 = make_pair(session, f'B{i*2+1:02d}', f'B{i*2+2:02d}')
        pair_players.append((str(p1.id), str(p2.id)))

    singles_objs = [Player.objects.create(session=session, name=f'BS{i+1:02d}') for i in range(4)]
    singles = [str(p.id) for p in singles_objs]

    pid_to_name = {}
    for p in session.players.all():
        pid_to_name[str(p.id)] = p.name

    run_scenario('Scenario B: 8p 2c, 2 pairs + 4 singles', session, pair_players, singles, pid_to_name)


# ---------------------------------------------------------------------------
# Scenario C: 12 players, 2 courts — 2 pairs + 8 singles (4 byes per round)
# ---------------------------------------------------------------------------

def scenario_c():
    session = Session.objects.create(
        name='perm-C-12p-2pairs',
        match_type='2v2',
        num_courts=2,
        generation_mode='fair',
    )
    pair_players = []
    for i in range(2):
        p1, p2 = make_pair(session, f'C{i*2+1:02d}', f'C{i*2+2:02d}')
        pair_players.append((str(p1.id), str(p2.id)))

    singles_objs = [Player.objects.create(session=session, name=f'CS{i+1:02d}') for i in range(8)]
    singles = [str(p.id) for p in singles_objs]

    pid_to_name = {}
    for p in session.players.all():
        pid_to_name[str(p.id)] = p.name

    run_scenario('Scenario C: 12p 2c, 2 pairs + 8 singles', session, pair_players, singles, pid_to_name)


# ---------------------------------------------------------------------------
# Run all scenarios
# ---------------------------------------------------------------------------

scenario_a()
scenario_b()
scenario_c()

print('\nAll permanent-partner tests passed.\n')

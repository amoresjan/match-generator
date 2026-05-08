import json
import logging
from typing import Optional

from django.conf import settings

logger = logging.getLogger(__name__)


def _is_configured():
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def build_round_payloads(session, rnd) -> dict:
    """Return a {player_id_str: payload} dict for a just-committed round."""
    from sessions_app.services.match_generator import preview_rounds as _preview

    players = {str(p.id): p.name for p in session.players.all()}
    url = f'/session/{session.id}'

    # Map player_id -> (court_number, my_team_ids, their_team_ids)
    player_to_match = {}
    for match in rnd.matches.all():
        for pid in match.team1_players:
            player_to_match[pid] = (match.court_number, match.team1_players, match.team2_players)
        for pid in match.team2_players:
            player_to_match[pid] = (match.court_number, match.team2_players, match.team1_players)

    # Check who is in the next preview round (for "up next" message)
    try:
        preview = _preview(session, 1)
        next_player_ids = set()
        if preview:
            for court in preview[0].get('courts', []):
                next_player_ids.update(court.get('team1', []))
                next_player_ids.update(court.get('team2', []))
    except Exception:
        next_player_ids = set()

    payloads = {}
    for pid, name in players.items():
        if pid in player_to_match:
            court_num, my_team, their_team = player_to_match[pid]
            partners = [players.get(p, '?') for p in my_team if p != pid]
            opponents = [players.get(p, '?') for p in their_team]
            if partners:
                body = f'Court {court_num} — with {" & ".join(partners)} vs {" & ".join(opponents)}'
            else:
                body = f'Court {court_num} — vs {" & ".join(opponents)}'
        elif pid in next_player_ids:
            body = f'Round {rnd.number} — sitting out, but you\'re up next!'
        else:
            body = f'Round {rnd.number} — you\'re sitting out'

        payloads[pid] = {'title': session.name, 'body': body, 'url': url}

    return payloads


def build_override_payloads(session, match) -> dict:
    """Return a {player_id_str: payload} dict for players in an overridden match."""
    players = {str(p.id): p.name for p in session.players.all()}
    url = f'/session/{session.id}'
    payloads = {}

    for pid in match.team1_players:
        partners = [players.get(p, '?') for p in match.team1_players if p != pid]
        opponents = [players.get(p, '?') for p in match.team2_players]
        body = (
            f'Court {match.court_number} updated — with {" & ".join(partners)} vs {" & ".join(opponents)}'
            if partners else
            f'Court {match.court_number} updated — vs {" & ".join(opponents)}'
        )
        payloads[pid] = {'title': session.name, 'body': body, 'url': url}

    for pid in match.team2_players:
        partners = [players.get(p, '?') for p in match.team2_players if p != pid]
        opponents = [players.get(p, '?') for p in match.team1_players]
        body = (
            f'Court {match.court_number} updated — with {" & ".join(partners)} vs {" & ".join(opponents)}'
            if partners else
            f'Court {match.court_number} updated — vs {" & ".join(opponents)}'
        )
        payloads[pid] = {'title': session.name, 'body': body, 'url': url}

    return payloads


def build_tournament_match_payloads(session, bracket: dict, newly_active_slot_ids: set) -> dict:
    """Return {player_id_str: payload} for players whose match just became active."""
    url = f'/session/{session.id}'
    player_names = {str(p.id): p.name for p in session.players.all()}
    teams_by_id = {t['id']: t for t in bracket['teams']}
    slots_by_id = {s['id']: s for s in bracket['match_slots']}
    num_rounds = bracket['num_rounds']

    def _round_name(r):
        return {num_rounds: 'Final', num_rounds - 1: 'Semifinals', num_rounds - 2: 'Quarterfinals'}.get(r, f'Round {r}')

    payloads = {}
    for slot_id in newly_active_slot_ids:
        slot = slots_by_id.get(slot_id)
        if not slot:
            continue
        top = teams_by_id.get(slot.get('top_team_id') or '')
        bot = teams_by_id.get(slot.get('bottom_team_id') or '')
        if not top or not bot:
            continue

        round_name = _round_name(slot['round'])

        for my_team, opp_team in [(top, bot), (bot, top)]:
            opp_names = [player_names.get(pid, '?') for pid in opp_team['player_ids']]
            opp_str = ' & '.join(opp_names)
            for pid in my_team['player_ids']:
                partners = [player_names.get(p, '?') for p in my_team['player_ids'] if p != pid]
                body = (
                    f'{round_name} — with {" & ".join(partners)} vs {opp_str}'
                    if partners else
                    f'{round_name} — vs {opp_str}'
                )
                payloads[pid] = {'title': session.name, 'body': body, 'url': url}

    return payloads


def send_push_to_session(
    session,
    payload: dict,
    player_payloads: Optional[dict] = None,
    restrict_player_ids: Optional[set] = None,
):
    if not _is_configured():
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning('pywebpush not installed; skipping push notification')
        return

    stale = []
    for sub in session.push_subscriptions.all():
        if restrict_player_ids is not None:
            if not sub.player_id or str(sub.player_id) not in restrict_player_ids:
                continue

        sub_payload = payload
        if player_payloads and sub.player_id:
            sub_payload = player_payloads.get(str(sub.player_id), payload)

        try:
            webpush(
                subscription_info={
                    'endpoint': sub.endpoint,
                    'keys': {'p256dh': sub.p256dh, 'auth': sub.auth},
                },
                data=json.dumps(sub_payload),
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={'sub': f'mailto:{settings.VAPID_CLAIMS_EMAIL}'},
            )
        except WebPushException as exc:
            resp = getattr(exc, 'response', None)
            if resp is not None and resp.status_code in (404, 410):
                stale.append(sub.id)
            else:
                logger.warning('Push failed (%s): %s', sub.endpoint[:60], exc)
        except Exception as exc:
            logger.warning('Push error: %s', exc)

    if stale:
        from sessions_app.models import PushSubscription
        PushSubscription.objects.filter(id__in=stale).delete()

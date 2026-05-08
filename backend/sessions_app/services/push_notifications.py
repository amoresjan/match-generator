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


def send_push_to_session(session, payload: dict, player_payloads: Optional[dict] = None):
    if not _is_configured():
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning('pywebpush not installed; skipping push notification')
        return

    stale = []
    for sub in session.push_subscriptions.all():
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

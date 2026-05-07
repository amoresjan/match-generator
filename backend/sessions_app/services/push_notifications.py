import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _is_configured():
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def send_push_to_session(session, payload: dict):
    if not _is_configured():
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning('pywebpush not installed; skipping push notification')
        return

    stale = []
    for sub in session.push_subscriptions.all():
        try:
            webpush(
                subscription_info={
                    'endpoint': sub.endpoint,
                    'keys': {'p256dh': sub.p256dh, 'auth': sub.auth},
                },
                data=json.dumps(payload),
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

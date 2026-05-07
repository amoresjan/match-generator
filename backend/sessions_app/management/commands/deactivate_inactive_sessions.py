from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from sessions_app.models import Session
from sessions_app.services.push_notifications import send_push_to_session


class Command(BaseCommand):
    help = 'Deactivate sessions that have not generated a round in 24 hours.'

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=24)

        stale = Session.objects.filter(
            is_active=True,
        ).filter(
            last_round_at__lt=cutoff,
        ) | Session.objects.filter(
            is_active=True,
            last_round_at__isnull=True,
            created_at__lt=cutoff,
        )

        stale = list(stale.prefetch_related('push_subscriptions'))

        for session in stale:
            send_push_to_session(session, {
                'title': session.name,
                'body': 'This session was closed automatically after 24h of inactivity.',
                'url': f'/session/{session.id}',
            })

        ids = [s.id for s in stale]
        count = Session.objects.filter(id__in=ids).update(is_active=False, auto_deactivated=True)

        self.stdout.write(self.style.SUCCESS(f'Deactivated {count} inactive session(s).'))

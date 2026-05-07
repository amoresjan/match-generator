from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from sessions_app.models import Session


class Command(BaseCommand):
    help = 'Deactivate sessions that have not generated a round in 24 hours.'

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=24)

        # Sessions with at least one round but none in the last 24h
        stale_with_rounds = Session.objects.filter(
            is_active=True,
            last_round_at__lt=cutoff,
        )

        # Sessions created more than 24h ago with no rounds ever generated
        stale_no_rounds = Session.objects.filter(
            is_active=True,
            last_round_at__isnull=True,
            created_at__lt=cutoff,
        )

        count = stale_with_rounds.update(is_active=False, auto_deactivated=True)
        count += stale_no_rounds.update(is_active=False, auto_deactivated=True)

        self.stdout.write(self.style.SUCCESS(f'Deactivated {count} inactive session(s).'))

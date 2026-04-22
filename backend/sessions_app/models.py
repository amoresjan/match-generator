import uuid
from django.db import models


class Session(models.Model):
    MATCH_TYPE_CHOICES = [('1v1', '1v1'), ('2v2', '2v2')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admin_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=120)
    match_type = models.CharField(max_length=3, choices=MATCH_TYPE_CHOICES, default='2v2')
    num_courts = models.PositiveSmallIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Player(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='players')
    name = models.CharField(max_length=80)
    # Points to partner player; null if no permanent partner
    permanent_partner = models.OneToOneField(
        'self',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='partner_of',
    )
    total_wait_rounds = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('session', 'name')

    def __str__(self):
        return f'{self.name} ({self.session.name})'


class Round(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='rounds')
    number = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('session', 'number')
        ordering = ['number']

    def __str__(self):
        return f'Round {self.number} — {self.session.name}'


class Match(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    round = models.ForeignKey(Round, on_delete=models.CASCADE, related_name='matches')
    court_number = models.PositiveSmallIntegerField()
    # Store ordered list of player IDs per side as JSON
    team1_players = models.JSONField()  # list of player UUIDs (str)
    team2_players = models.JSONField()  # list of player UUIDs (str)
    winner = models.CharField(
        max_length=5,
        choices=[('team1', 'team1'), ('team2', 'team2')],
        null=True, blank=True,
    )

    class Meta:
        unique_together = ('round', 'court_number')
        ordering = ['court_number']

    def __str__(self):
        return f'Court {self.court_number} — Round {self.round.number}'


class PlayerRoundHistory(models.Model):
    """Tracks who played with/against whom per round for cost calculation."""
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='history')
    round = models.ForeignKey(Round, on_delete=models.CASCADE, related_name='history')
    partner_ids = models.JSONField(default=list)   # UUIDs of teammates
    opponent_ids = models.JSONField(default=list)  # UUIDs of opponents
    sat_out = models.BooleanField(default=False)

    class Meta:
        unique_together = ('player', 'round')

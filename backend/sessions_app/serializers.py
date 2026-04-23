from rest_framework import serializers
from .models import Match, Player, PlayerRoundHistory, Round, Session


class PlayerSerializer(serializers.ModelSerializer):
    permanent_partner_id = serializers.UUIDField(
        source='permanent_partner.id', read_only=True, allow_null=True
    )
    permanent_partner_name = serializers.CharField(
        source='permanent_partner.name', read_only=True, allow_null=True
    )

    class Meta:
        model = Player
        fields = [
            'id', 'name', 'permanent_partner_id', 'permanent_partner_name',
            'total_wait_rounds', 'created_at',
        ]
        read_only_fields = ['id', 'total_wait_rounds', 'created_at']


class MatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Match
        fields = ['id', 'court_number', 'team1_players', 'team2_players', 'winner']


class RoundSerializer(serializers.ModelSerializer):
    matches = MatchSerializer(many=True, read_only=True)

    class Meta:
        model = Round
        fields = ['id', 'number', 'created_at', 'matches']


class SessionSerializer(serializers.ModelSerializer):
    players = PlayerSerializer(many=True, read_only=True)
    rounds = RoundSerializer(many=True, read_only=True)

    class Meta:
        model = Session
        fields = [
            'id', 'name', 'match_type', 'num_courts', 'generation_mode',
            'is_active', 'created_at', 'players', 'rounds',
        ]
        read_only_fields = ['id', 'created_at']


class SessionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = ['name', 'match_type', 'num_courts', 'generation_mode']


class PlayerCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['name']


class SetPartnerSerializer(serializers.Serializer):
    partner_id = serializers.UUIDField(allow_null=True)


class ManualMatchOverrideSerializer(serializers.Serializer):
    team1_players = serializers.ListField(child=serializers.UUIDField())
    team2_players = serializers.ListField(child=serializers.UUIDField())

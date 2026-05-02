from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Match, Player, Round, Session
from .serializers import (
    ManualMatchOverrideSerializer,
    MatchSerializer,
    PlayerCreateSerializer,
    PlayerSerializer,
    SessionCreateSerializer,
    SessionSerializer,
    SetPartnerSerializer,
)
from .services.match_generator import commit_round, generate_round, preview_rounds, reconcile_round_history


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def _require_admin(request, session: Session):
    token = request.headers.get('X-Admin-Token') or request.query_params.get('admin_token')
    if str(session.admin_token) != token:
        return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
    return None


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

@api_view(['POST'])
def create_session(request):
    ser = SessionCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    session = ser.save()
    return Response(
        {**SessionSerializer(session).data, 'admin_token': str(session.admin_token)},
        status=status.HTTP_201_CREATED,
    )


def _session_with_prefetch(session_id):
    return get_object_or_404(
        Session.objects.prefetch_related('players__permanent_partner', 'rounds__matches'),
        id=session_id,
    )


@api_view(['GET'])
def get_session(request, session_id):
    session = _session_with_prefetch(session_id)
    return Response(SessionSerializer(session).data)


@api_view(['PATCH'])
def update_session(request, session_id):
    session = _session_with_prefetch(session_id)
    err = _require_admin(request, session)
    if err:
        return err
    ser = SessionCreateSerializer(session, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(SessionSerializer(session).data)


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------

@api_view(['POST'])
def add_player(request, session_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session)
    if err:
        return err
    ser = PlayerCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    player = ser.save(session=session)
    return Response(PlayerSerializer(player).data, status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
def player_detail(request, session_id, player_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session)
    if err:
        return err
    player = get_object_or_404(Player, id=player_id, session=session)

    if request.method == 'DELETE':
        session.removed_players[str(player.id)] = player.name
        session.save(update_fields=['removed_players'])
        player.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH — rename and/or sit_out toggle
    fields_to_save = []
    name = request.data.get('name')
    if name:
        player.name = name
        fields_to_save.append('name')
    if 'sit_out' in request.data:
        player.sit_out = bool(request.data['sit_out'])
        fields_to_save.append('sit_out')
    if fields_to_save:
        player.save(update_fields=fields_to_save)
    return Response(PlayerSerializer(player).data)


@api_view(['POST'])
def set_partner(request, session_id, player_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session)
    if err:
        return err

    player = get_object_or_404(Player, id=player_id, session=session)
    ser = SetPartnerSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    partner_id = ser.validated_data['partner_id']

    if partner_id is not None:
        partner = get_object_or_404(Player, id=partner_id, session=session)
        if partner.id == player.id:
            return Response({'detail': 'Cannot partner with self.'}, status=400)

    with transaction.atomic():
        if partner_id is None:
            # Remove partnership both ways
            if player.permanent_partner:
                old = player.permanent_partner
                old.permanent_partner = None
                old.save(update_fields=['permanent_partner'])
            player.permanent_partner = None
            player.save(update_fields=['permanent_partner'])
        else:
            # Clear any existing partnerships before setting new ones
            for p in [player, partner]:
                if p.permanent_partner:
                    old = p.permanent_partner
                    old.permanent_partner = None
                    old.save(update_fields=['permanent_partner'])

            player.permanent_partner = partner
            partner.permanent_partner = player
            player.save(update_fields=['permanent_partner'])
            partner.save(update_fields=['permanent_partner'])

    return Response(PlayerSerializer(player).data)


# ---------------------------------------------------------------------------
# Round generation
# ---------------------------------------------------------------------------

@api_view(['POST'])
def generate_next_round(request, session_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session)
    if err:
        return err

    try:
        generated = generate_round(session)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)

    rnd = commit_round(session, generated)
    from .serializers import RoundSerializer
    rnd = Round.objects.prefetch_related('matches').get(id=rnd.id)
    return Response(RoundSerializer(rnd).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Manual match override
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
def set_match_result(request, session_id, match_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session)
    if err:
        return err

    match = get_object_or_404(Match, id=match_id, round__session=session)
    winner = request.data.get('winner')
    if winner not in ('team1', 'team2', None):
        return Response({'detail': 'winner must be "team1", "team2", or null.'}, status=400)
    match.winner = winner
    match.save(update_fields=['winner'])
    return Response(MatchSerializer(match).data)


@api_view(['PATCH'])
def override_match(request, session_id, match_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session)
    if err:
        return err

    match = get_object_or_404(Match, id=match_id, round__session=session)
    ser = ManualMatchOverrideSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    with transaction.atomic():
        match.team1_players = [str(x) for x in ser.validated_data['team1_players']]
        match.team2_players = [str(x) for x in ser.validated_data['team2_players']]
        match.winner = None
        match.save(update_fields=['team1_players', 'team2_players', 'winner'])
        reconcile_round_history(match.round)
    return Response(MatchSerializer(match).data)


# ---------------------------------------------------------------------------
# Preview future rounds (fair rotation only, no DB writes)
# ---------------------------------------------------------------------------

@api_view(['POST'])
def preview_rounds_view(request, session_id):
    session = get_object_or_404(Session, id=session_id)

    count = max(1, min(int(request.data.get('count', 5)), 10))

    try:
        rounds = preview_rounds(session, count)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)

    return Response(rounds)

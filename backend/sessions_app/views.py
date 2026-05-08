from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Match, Player, PushSubscription, Round, Session
from .serializers import (
    ManualMatchOverrideSerializer,
    MatchSerializer,
    PlayerCreateSerializer,
    PlayerSerializer,
    RoundSerializer,
    SessionCreateSerializer,
    SessionSerializer,
    SetPartnerSerializer,
)
from .services.match_generator import commit_round, generate_round, preview_rounds, reconcile_round_history
from .services.push_notifications import build_override_payloads, build_round_payloads, send_push_to_session


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def _require_admin(request, session: Session):
    token = request.headers.get('X-Admin-Token') or request.query_params.get('admin_token')
    if str(session.admin_token) != token:
        return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
    return None


def _require_active(session: Session):
    if not session.is_active:
        return Response({'detail': 'Session is deactivated.'}, status=status.HTTP_403_FORBIDDEN)
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
    since_round = request.query_params.get('since_round')

    rounds_qs = Round.objects.prefetch_related('matches').order_by('number')
    if since_round is not None:
        try:
            rounds_qs = rounds_qs.filter(number__gt=int(since_round))
        except ValueError:
            return Response({'detail': 'since_round must be an integer.'}, status=400)

    session = get_object_or_404(
        Session.objects.prefetch_related(
            'players__permanent_partner',
            Prefetch('rounds', queryset=rounds_qs),
        ),
        id=session_id,
    )
    return Response(SessionSerializer(session).data)


@api_view(['PATCH'])
def update_session(request, session_id):
    session = _session_with_prefetch(session_id)
    err = _require_admin(request, session) or _require_active(session)
    if err:
        return err
    ser = SessionCreateSerializer(session, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(SessionSerializer(session).data)


@api_view(['PATCH'])
def set_session_active(request, session_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session)
    if err:
        return err
    is_active = request.data.get('is_active')
    if not isinstance(is_active, bool):
        return Response({'detail': 'is_active must be a boolean.'}, status=400)
    if is_active and session.auto_deactivated:
        return Response({'detail': 'Cannot reactivate an auto-deactivated session.'}, status=status.HTTP_403_FORBIDDEN)
    session.is_active = is_active
    session.save(update_fields=['is_active'])
    if not is_active:
        send_push_to_session(session, {
            'title': session.name,
            'body': 'This session has been closed.',
            'url': f'/session/{session.id}',
        })
    return Response(SessionSerializer(session).data)


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------

@api_view(['POST'])
def add_player(request, session_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session) or _require_active(session)
    if err:
        return err
    ser = PlayerCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    player = ser.save(session=session)
    return Response(PlayerSerializer(player).data, status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
def player_detail(request, session_id, player_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session) or _require_active(session)
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
    sitting_out_now = None
    if 'sit_out' in request.data:
        sitting_out_now = bool(request.data['sit_out'])
        player.sit_out = sitting_out_now
        fields_to_save.append('sit_out')
    if fields_to_save:
        player.save(update_fields=fields_to_save)

    if sitting_out_now:
        send_push_to_session(
            session,
            {},
            player_payloads={
                str(player.id): {
                    'title': session.name,
                    'body': "You're sitting out. Let the host know when you're ready to re-join!",
                    'url': f'/session/{session.id}',
                }
            },
            restrict_player_ids={str(player.id)},
        )

    return Response(PlayerSerializer(player).data)


@api_view(['POST'])
def set_partner(request, session_id, player_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session) or _require_active(session)
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
    err = _require_admin(request, session) or _require_active(session)
    if err:
        return err

    try:
        generated = generate_round(session)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)

    rnd = commit_round(session, generated)
    rnd = Round.objects.prefetch_related('matches').get(id=rnd.id)
    send_push_to_session(
        session,
        {'title': session.name, 'body': f'Round {rnd.number} is ready!', 'url': f'/session/{session.id}'},
        player_payloads=build_round_payloads(session, rnd),
    )
    return Response(RoundSerializer(rnd).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Manual match override
# ---------------------------------------------------------------------------

@api_view(['PATCH'])
def set_match_result(request, session_id, match_id):
    session = get_object_or_404(Session, id=session_id)
    err = _require_admin(request, session) or _require_active(session)
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
    err = _require_admin(request, session) or _require_active(session)
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

    affected = set(match.team1_players) | set(match.team2_players)
    player_payloads = build_override_payloads(session, match)
    send_push_to_session(
        session,
        {'title': session.name, 'body': 'A match was updated.', 'url': f'/session/{session.id}'},
        player_payloads=player_payloads,
        restrict_player_ids=affected,
    )
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


# ---------------------------------------------------------------------------
# Push notifications
# ---------------------------------------------------------------------------

@api_view(['GET'])
def vapid_public_key(request):
    from django.conf import settings
    key = settings.VAPID_PUBLIC_KEY
    if not key:
        return Response({'detail': 'Push notifications not configured.'}, status=503)
    return Response({'public_key': key})


@api_view(['POST'])
def push_subscribe(request, session_id):
    session = get_object_or_404(Session, id=session_id)
    endpoint = request.data.get('endpoint', '').strip()
    p256dh = request.data.get('p256dh', '').strip()
    auth = request.data.get('auth', '').strip()
    if not (endpoint and p256dh and auth):
        return Response({'detail': 'endpoint, p256dh, and auth are required.'}, status=400)

    player_id = request.data.get('player_id') or None
    PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={'session': session, 'p256dh': p256dh, 'auth': auth, 'player_id': player_id},
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
def push_unsubscribe(request, session_id):
    get_object_or_404(Session, id=session_id)
    endpoint = request.data.get('endpoint', '').strip()
    if not endpoint:
        return Response({'detail': 'endpoint is required.'}, status=400)
    PushSubscription.objects.filter(endpoint=endpoint).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

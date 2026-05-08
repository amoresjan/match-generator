from django.urls import path
from . import views

urlpatterns = [
    path('sessions/', views.create_session),
    path('sessions/<uuid:session_id>/', views.get_session),
    path('sessions/<uuid:session_id>/update/', views.update_session),
    path('sessions/<uuid:session_id>/players/', views.add_player),
    path('sessions/<uuid:session_id>/players/<uuid:player_id>/', views.player_detail),
    path('sessions/<uuid:session_id>/players/<uuid:player_id>/partner/', views.set_partner),
    path('sessions/<uuid:session_id>/generate/', views.generate_next_round),
    path('sessions/<uuid:session_id>/matches/<uuid:match_id>/override/', views.override_match),
    path('sessions/<uuid:session_id>/matches/<uuid:match_id>/result/', views.set_match_result),
    path('sessions/<uuid:session_id>/preview-rounds/', views.preview_rounds_view),
    path('sessions/<uuid:session_id>/active/', views.set_session_active),
    path('sessions/<uuid:session_id>/push-subscribe/', views.push_subscribe),
    path('sessions/<uuid:session_id>/push-unsubscribe/', views.push_unsubscribe),
    path('sessions/<uuid:session_id>/tournament/setup/', views.tournament_setup),
    path('sessions/<uuid:session_id>/tournament/advance/', views.tournament_advance),
    path('vapid-public-key/', views.vapid_public_key),
]

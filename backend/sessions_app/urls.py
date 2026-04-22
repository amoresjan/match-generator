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
]

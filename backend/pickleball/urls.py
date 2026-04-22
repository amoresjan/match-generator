from django.urls import path, include

urlpatterns = [
    path('api/', include('sessions_app.urls')),
]

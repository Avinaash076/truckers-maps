from django.urls import path
from . import views

urlpatterns = [
    path("routes/analyze/", views.analyze_routes, name="analyze_routes"),
    path("routes/suggest/", views.suggest_places, name="suggest_places"),
]

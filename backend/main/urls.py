from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from core.views import (
    FrontendLogoutAPIView,
    FrontendOAuthCallbackAPIView,
    FrontendOAuthLoginAPIView,
    ExamSessionListCreateView,
    ExamSessionDetailView,
    DocumentUploadView,
    DocumentDeleteView,
    GenerateQuestionsView,
    SubmitAttemptView,
    SubmitQuizAttemptView,
    AttemptListView,
    SummarizeDocumentView,
    ChatView,
)

urlpatterns = [
    path("admin/", admin.site.urls),

    # ── OAuth & auth ─────────────────────────────────────────────────────────
    path("api/v1/accounts/oauth/<str:provider>/",          FrontendOAuthLoginAPIView.as_view(),    name="frontend-oauth-login"),
    path("api/v1/accounts/oauth/<str:provider>/callback/", FrontendOAuthCallbackAPIView.as_view(), name="frontend-oauth-callback"),
    path("api/v1/accounts/logout/",                        FrontendLogoutAPIView.as_view(),        name="frontend-logout"),
    path("api/v1/accounts/",                               include("drf_auth.urls")),

    # ── Sessions ─────────────────────────────────────────────────────────────
    path("api/v1/sessions/",         ExamSessionListCreateView.as_view(), name="session-list-create"),
    path("api/v1/sessions/<uuid:pk>/", ExamSessionDetailView.as_view(),  name="session-detail"),

    # ── Documents ────────────────────────────────────────────────────────────
    path("api/v1/sessions/<uuid:session_id>/documents/",                  DocumentUploadView.as_view(),  name="document-upload"),
    path("api/v1/sessions/<uuid:session_id>/documents/<uuid:doc_id>/",    DocumentDeleteView.as_view(),  name="document-delete"),
    path("api/v1/sessions/<uuid:session_id>/documents/<uuid:doc_id>/summarize/", SummarizeDocumentView.as_view(), name="document-summarize"),

    # ── AI generation ────────────────────────────────────────────────────────
    path("api/v1/sessions/<uuid:session_id>/generate/", GenerateQuestionsView.as_view(), name="generate-questions"),

    # ── Quiz attempts ────────────────────────────────────────────────────────
    path("api/v1/sessions/<uuid:session_id>/attempts/", SubmitAttemptView.as_view(), name="submit-attempt"),
    path("api/v1/sessions/<uuid:session_id>/attempts/list/", AttemptListView.as_view(), name="attempt-list"),
    path("api/v1/sessions/<uuid:session_id>/quizzes/<uuid:quiz_id>/attempts/", SubmitQuizAttemptView.as_view(), name="submit-quiz-attempt"),

    # ── AI Tutor chat ────────────────────────────────────────────────────────
    path("api/v1/sessions/<uuid:session_id>/chat/", ChatView.as_view(), name="chat"),

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

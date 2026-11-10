from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from core.views import (
    FrontendLogoutAPIView,
    FrontendOAuthCallbackAPIView,
    FrontendOAuthLoginAPIView,
)


class OAuthRedirectTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch("core.views.OAuthManager.get_authorization_url")
    @patch("core.views.OAuthManager.create_state")
    @patch("core.views.OAuthManager.create_session")
    def test_login_starts_cookie_transport_oauth(
        self,
        create_session,
        create_state,
        get_authorization_url,
    ):
        session = Mock()
        create_session.return_value = session
        create_state.return_value = "signed-state"
        get_authorization_url.return_value = "https://accounts.google.test/auth"

        response = FrontendOAuthLoginAPIView.as_view()(
            self.factory.get("/api/v1/accounts/oauth/google/"),
            provider="google",
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"],
            "https://accounts.google.test/auth",
        )
        create_session.assert_called_once_with(
            provider="google",
            transport="cookie",
        )

    @patch("core.views.TokenManager.create_login_response")
    @patch("core.views.OAuthManager.authenticate")
    @patch("core.views.OAuthManager.verify_state")
    def test_callback_sets_cookie_response_and_redirects_to_frontend(
        self,
        verify_state,
        authenticate,
        create_login_response,
    ):
        session = Mock()
        user = Mock()
        verify_state.return_value = session
        authenticate.return_value = user
        create_login_response.return_value = Response({"user": {"id": 1}})

        response = FrontendOAuthCallbackAPIView.as_view()(
            self.factory.get(
                "/api/v1/accounts/oauth/google/callback/",
                {"state": "signed-state", "code": "authorization-code"},
            ),
            provider="google",
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "http://localhost:3000/?oauth=success")
        verify_state.assert_called_once_with("signed-state")
        authenticate.assert_called_once_with(
            provider="google",
            code="authorization-code",
        )
        create_login_response.assert_called_once_with(
            user=user,
            transport="cookie",
        )
        session.delete.assert_called_once()


    def test_callback_redirects_to_frontend_when_google_denies_access(self):
        response = FrontendOAuthCallbackAPIView.as_view()(
            self.factory.get(
                "/api/v1/accounts/oauth/google/callback/",
                {"error": "access_denied"},
            ),
            provider="google",
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"],
            "http://localhost:3000/?oauth_error=Google+sign-in+was+cancelled.",
        )

    @patch("core.views.OAuthManager.authenticate")
    @patch("core.views.OAuthManager.verify_state")
    def test_callback_redirects_authentication_errors_to_frontend(
        self,
        verify_state,
        authenticate,
    ):
        session = Mock()
        verify_state.return_value = session
        authenticate.side_effect = AuthenticationFailed("Google sign-in failed.")

        response = FrontendOAuthCallbackAPIView.as_view()(
            self.factory.get(
                "/api/v1/accounts/oauth/google/callback/",
                {"state": "signed-state", "code": "invalid-code"},
            ),
            provider="google",
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"],
            "http://localhost:3000/?oauth_error=Google+sign-in+failed.",
        )
        session.delete.assert_called_once()


class FrontendLogoutTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch("core.views.TokenManager.blacklist_refresh_token")
    def test_logout_clears_cookies_without_an_access_token(self, blacklist):
        request = self.factory.post("/api/v1/accounts/logout/")
        request.COOKIES["refresh_token"] = "refresh-token"

        response = FrontendLogoutAPIView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        blacklist.assert_called_once_with("refresh-token")
        self.assertEqual(response.cookies["access_token"].value, "")
        self.assertEqual(response.cookies["refresh_token"].value, "")

    def test_logout_revokes_refresh_token(self):
        user = get_user_model().objects.create_user(
            username="logout-test",
            password="test-password",
        )
        refresh_token = RefreshToken.for_user(user)
        request = self.factory.post("/api/v1/accounts/logout/")
        request.COOKIES["refresh_token"] = str(refresh_token)

        response = FrontendLogoutAPIView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            BlacklistedToken.objects.filter(
                token__jti=refresh_token["jti"],
            ).exists()
        )

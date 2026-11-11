"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { API_URL, authContext } from "../auth-context";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"/>
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"/>
      <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z"/>
      <path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 4 24 4A20 20 0 0 0 5.8 15.1l6.8 5.3c1.6-4.9 6.1-8.5 11.4-8.5Z"/>
    </svg>
  );
}

export default function LoginPage() {
  const { isAuthenticated, status, error: contextError } = useContext(authContext);
  const router = useRouter();
  const [oauthError, setOauthError] = useState("");

  // If already authenticated, go straight to dashboard
  useEffect(() => {
    if (status === "authenticated" && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [status, isAuthenticated, router]);

  // Pick up oauth_error from query string (set by the backend on failure)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const msg = params.get("oauth_error");
    if (msg) {
      setOauthError(decodeURIComponent(msg));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Determine which error to show — OAuth callback error takes priority,
  // then a backend connectivity error from the auth context
  const displayError = oauthError || (status === "error" ? contextError : "");

  if (status === "loading") {
    return (
      <div className="page-loading" role="status">
        <span className="spinner" />
        <span>Loading…</span>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <span className="login-logo-mark" aria-hidden="true">P</span>
          PrepWise
        </div>

        {/* Heading */}
        <h1 className="login-heading">Welcome back</h1>
        <p className="login-sub">
          Sign in to your PrepWise account to continue studying and tracking
          your exam progress.
        </p>

        {/* Error banner — covers OAuth errors and backend-down errors */}
        {displayError && (
          <div className="error-banner" role="alert" style={{ marginBottom: 20 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"
              aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
              <path fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"/>
            </svg>
            {displayError}
          </div>
        )}

        {/* Backend-down warning — shown as a softer notice, not a hard error */}
        {status === "error" && !displayError && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius)",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#92400e",
              fontSize: 13,
              lineHeight: 1.55,
              marginBottom: 20,
            }}
            role="alert"
          >
            ⚠️ Could not reach the backend. Make sure Django is running on port 8000.
          </div>
        )}

        {/* Google OAuth button — plain anchor, triggers backend redirect */}
        <a
          href={`${API_URL}/api/v1/accounts/oauth/google/`}
          className="google-btn"
          aria-label="Sign in with Google"
        >
          <GoogleIcon />
          Continue with Google
        </a>

        <div className="login-divider">or</div>

        <p style={{ textAlign: "center", fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.6 }}>
          Don't have an account? Signing in with Google will create one automatically.
        </p>

        <p className="login-terms">
          By signing in, you agree to our{" "}
          <Link href="/terms">Terms of Service</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

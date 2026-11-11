"use client";

import Link from "next/link";
import { useContext, useEffect, useState } from "react";
import { API_URL, authContext } from "../auth-context";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z"
      />
      <path
        fill="#EA4335"
        d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 4 24 4A20 20 0 0 0 5.8 15.1l6.8 5.3c1.6-4.9 6.1-8.5 11.4-8.5Z"
      />
    </svg>
  );
}

export default function Signup() {
  const { isAuthenticated, status, error: contextError } = useContext(authContext);
  const [oauthError, setOauthError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const message = params.get("oauth_error");
      if (message) {
        setOauthError(message);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-label="Account sign in">
        <div className="auth-form-panel">
          <Link className="brand" href="/" aria-label="Forma home">
            <span className="brand-mark" aria-hidden="true">f</span>
            <span>forma</span>
          </Link>

          <div className="form-content">
            {status === "loading" ? (
              <div className="loading-state" role="status">
                <span className="spinner" />
                <p>Checking your account…</p>
              </div>
            ) : isAuthenticated ? (
              <div className="signed-in-state">
                <span className="eyebrow">You’re all set</span>
                <h1>You’re already signed in.</h1>
                <p className="intro">Continue to your Forma dashboard.</p>
                <Link className="google-button dashboard-link" href="/">
                  Go to dashboard
                </Link>
              </div>
            ) : (
              <>
                <span className="eyebrow">A little more you</span>
                <h1>Make room for what matters.</h1>
                <p className="intro">
                  Sign in to pick up where you left off and make your next
                  great thing happen.
                </p>
                {(oauthError || contextError) && (
                  <p className="error-message" role="alert">
                    {oauthError || contextError}
                  </p>
                )}
                <a
                  className="google-button"
                  href={`${API_URL}/api/v1/accounts/oauth/google/`}
                >
                  <GoogleMark />
                  <span>Continue with Google</span>
                </a>
                <p className="terms">
                  By continuing, you agree to our <a href="#terms">Terms</a> and{" "}
                  <a href="#privacy">Privacy Policy</a>.
                </p>
              </>
            )}
          </div>

          <p className="form-footer">A calmer place to get things done.</p>
        </div>

        <aside className="welcome-panel">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-sun" />
          <div className="art-horizon" />
          <div className="welcome-copy">
            <span className="welcome-kicker">A fresh start, every day</span>
            <h2>Good things take shape when you do.</h2>
            <p>Bring your ideas, plans, and people into focus.</p>
          </div>
          <div className="panel-caption">
            <span>01</span>
            <span className="caption-line" />
            <span>Make it yours</span>
          </div>
        </aside>
      </section>
    </main>
  );
}

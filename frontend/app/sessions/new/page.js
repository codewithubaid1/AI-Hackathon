"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { authContext } from "../../auth-context";
import { sessionsApi } from "../../lib/api";
import Navbar from "../../components/Navbar";

export default function NewSessionPage() {
  const { status } = useContext(authContext);
  const router = useRouter();
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please enter a session title.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const session = await sessionsApi.create({
        title: title.trim(),
        description: description.trim(),
      });
      // Navigate to the new session's page
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="page-loading" role="status">
        <span className="spinner" />
        <span>Loading…</span>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Navbar />

      <main className="page-content">
        {/* Back link */}
        <Link
          href="/sessions"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--fg-muted)",
            marginBottom: 28,
            transition: "color 140ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--fg)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--fg-muted)")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to sessions
        </Link>

        {/* Form card */}
        <div
          className="card"
          style={{ maxWidth: 560 }}
        >
          <div className="card-body" style={{ padding: "32px 36px" }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.4px",
                color: "var(--fg)",
                marginBottom: 6,
              }}
            >
              New Study Session
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "var(--fg-muted)",
                marginBottom: 28,
                lineHeight: 1.6,
              }}
            >
              Give your session a name. You'll add PDFs and generate questions
              after it's created.
            </p>

            {error && (
              <div
                className="error-banner"
                role="alert"
                style={{ marginBottom: 20 }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Title */}
              <div style={{ marginBottom: 20 }}>
                <label
                  htmlFor="session-title"
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--fg-mid)",
                    marginBottom: 7,
                  }}
                >
                  Session title <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  id="session-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Databases Midterm, Linear Algebra Final"
                  maxLength={200}
                  required
                  disabled={submitting}
                  style={{
                    display: "block",
                    width: "100%",
                    height: 42,
                    padding: "0 14px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: "var(--surface)",
                    color: "var(--fg)",
                    fontSize: 14,
                    outline: "none",
                    transition: "border-color 150ms, box-shadow 150ms",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--brand)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <div
                  style={{
                    textAlign: "right",
                    fontSize: 11,
                    color: "var(--fg-faint)",
                    marginTop: 4,
                  }}
                >
                  {title.length}/200
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 28 }}>
                <label
                  htmlFor="session-description"
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--fg-mid)",
                    marginBottom: 7,
                  }}
                >
                  Description{" "}
                  <span
                    style={{ fontWeight: 400, color: "var(--fg-faint)" }}
                  >
                    (optional)
                  </span>
                </label>
                <textarea
                  id="session-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notes about this session, exam date, topics covered…"
                  rows={3}
                  disabled={submitting}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 14px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: "var(--surface)",
                    color: "var(--fg)",
                    fontSize: 14,
                    resize: "vertical",
                    outline: "none",
                    transition: "border-color 150ms, box-shadow 150ms",
                    lineHeight: 1.55,
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--brand)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <Link href="/sessions" className="btn btn-secondary">
                  Cancel
                </Link>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !title.trim()}
                >
                  {submitting ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      Creating…
                    </>
                  ) : (
                    "Create session"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

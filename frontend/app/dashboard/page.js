"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { authContext } from "../auth-context";
import { sessionsApi } from "../lib/api";
import Navbar from "../components/Navbar";

export default function DashboardPage() {
  const { user, status, error } = useContext(authContext);
  const router = useRouter();
  const [sessions, setSessions]         = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setStatsLoading(true);
    sessionsApi.list()
      .then((data) => {
        const list = data?.results ?? data ?? [];
        setSessions(list);
        setRecentSessions(list.slice(0, 3));
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [status]);

  if (status === "loading") {
    return (
      <div className="page-loading" role="status">
        <span className="spinner" />
        <span>Loading your dashboard…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="page-loading">
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "var(--fg-muted)", marginBottom: 16 }}>
            {error || "Could not connect to the server."}
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()} type="button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // ── Compute real stats from sessions list ─────────────────────────────────
  const totalPdfs      = sessions.reduce((s, sess) => s + (sess.document_count ?? 0), 0);
  const totalQuestions = sessions.reduce((s, sess) => s + (sess.question_count  ?? 0), 0);
  const totalAttempts  = sessions.reduce((s, sess) => s + (sess.attempt_count   ?? 0), 0);

  // Best score across all sessions
  const scores = sessions.map((s) => s.best_score).filter((v) => v != null);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  const displayName = user.username || user.email?.split("@")[0] || "there";
  const initials    = displayName.charAt(0).toUpperCase();

  return (
    <div className="app-layout">
      <Navbar />

      <main className="page-content">
        {/* Welcome */}
        <div className="dashboard-welcome">
          <h1>Good day, {displayName} 👋</h1>
          <p>Here's your exam preparation overview.</p>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-label">Study Sessions</div>
            <div className="stat-card-value">{statsLoading ? "…" : sessions.length}</div>
            <div className="stat-card-sub">Total created</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">PDFs Uploaded</div>
            <div className="stat-card-value">{statsLoading ? "…" : totalPdfs}</div>
            <div className="stat-card-sub">Across all sessions</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Questions</div>
            <div className="stat-card-value">{statsLoading ? "…" : totalQuestions}</div>
            <div className="stat-card-sub">Total generated</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Quiz Attempts</div>
            <div className="stat-card-value">{statsLoading ? "…" : totalAttempts}</div>
            <div className="stat-card-sub">
              {avgScore != null ? `Avg score: ${avgScore}%` : "No quizzes yet"}
            </div>
          </div>
        </div>

        {/* Recent sessions */}
        <div className="section-header">
          <h2 className="section-title">Recent Sessions</h2>
          <Link href="/sessions" className="btn btn-secondary btn-sm">View all</Link>
        </div>

        {recentSessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">📚</div>
            <h3>No study sessions yet</h3>
            <p>Create your first session to get started. PrepWise will help you generate practice questions from your PDFs.</p>
            <Link href="/sessions/new" className="btn btn-primary">Create a session</Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {recentSessions.map((s) => {
              const scoreColor = s.best_score == null ? "var(--fg-muted)"
                : s.best_score >= 80 ? "#15803d"
                : s.best_score >= 60 ? "#d97706"
                : "#dc2626";
              return (
                <Link key={s.id} href={`/sessions/${s.id}`} className="card"
                  style={{ textDecoration: "none", display: "block" }}>
                  <div className="card-body">
                    <div className="card-title">{s.title}</div>
                    {s.description && (
                      <div className="card-meta" style={{ marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {s.description}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, fontSize: 12, color: "var(--fg-muted)" }}>
                      <span>{s.document_count} PDF{s.document_count !== 1 ? "s" : ""}</span>
                      <span>{s.question_count} Q</span>
                      {s.best_score != null && (
                        <span style={{ marginLeft: "auto", fontWeight: 700, color: scoreColor }}>
                          Best: {s.best_score}%
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Account card */}
        <div className="card" style={{ marginTop: 40, maxWidth: 420 }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              display: "grid", placeItems: "center",
              width: 48, height: 48, borderRadius: "50%",
              background: "var(--brand-light)", color: "var(--brand)",
              fontSize: 20, fontWeight: 700, flexShrink: 0,
            }} aria-hidden="true">{initials}</div>
            <div>
              <div className="card-title">{user.username}</div>
              <div className="card-meta">{user.email}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

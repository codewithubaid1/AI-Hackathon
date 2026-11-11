"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useState } from "react";
import { authContext } from "../auth-context";
import { sessionsApi } from "../lib/api";
import Navbar from "../components/Navbar";
import SessionCard from "../components/SessionCard";

export default function SessionsPage() {
  const { status }   = useContext(authContext);
  const router       = useRouter();
  const [sessions, setSessions]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [deleting, setDeleting]   = useState(null); // id being deleted
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, title }

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await sessionsApi.list();
      setSessions(data?.results ?? data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchSessions();
  }, [status, fetchSessions]);

  async function handleDeleteConfirm() {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setDeleting(id);
    setConfirmDelete(null);
    try {
      await sessionsApi.delete(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
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
        {/* Header */}
        <div className="section-header" style={{ marginBottom: 24 }}>
          <div>
            <h1
              style={{
                fontSize: "clamp(20px, 2.5vw, 26px)",
                fontWeight: 700,
                letterSpacing: "-0.4px",
                color: "var(--fg)",
                marginBottom: 4,
              }}
            >
              My Sessions
            </h1>
            <p style={{ fontSize: 14, color: "var(--fg-muted)" }}>
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/sessions/new" className="btn btn-primary">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Session
          </Link>
        </div>

        {/* Error banner */}
        {error && (
          <div className="error-banner" role="alert" style={{ marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 16,
            }}
          >
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="card"
                style={{ height: 160, opacity: 0.5, background: "var(--surface-alt)" }}
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Sessions grid */}
        {!loading && sessions.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 16,
            }}
          >
            {sessions.map((session) => (
              <div
                key={session.id}
                style={{ opacity: deleting === session.id ? 0.4 : 1, transition: "opacity 200ms" }}
              >
                <SessionCard
                  session={session}
                  onDelete={(id, title) => setConfirmDelete({ id, title })}
                />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sessions.length === 0 && !error && (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">📂</div>
            <h3>No sessions yet</h3>
            <p>
              Create your first study session to get started. You'll be able to
              upload PDFs and generate practice questions.
            </p>
            <Link href="/sessions/new" className="btn btn-primary">
              Create your first session
            </Link>
          </div>
        )}
      </main>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(3px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--radius-xl)",
              padding: "32px 36px",
              maxWidth: 420,
              width: "100%",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <h2
              id="delete-dialog-title"
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--fg)",
                marginBottom: 10,
              }}
            >
              Delete session?
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--fg-muted)",
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              <strong style={{ color: "var(--fg)" }}>
                "{confirmDelete.title}"
              </strong>{" "}
              and all its PDFs and questions will be permanently deleted. This
              cannot be undone.
            </p>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
            >
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmDelete(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteConfirm}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

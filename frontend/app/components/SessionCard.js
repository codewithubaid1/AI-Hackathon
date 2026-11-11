"use client";

import Link from "next/link";

/**
 * Displays a single exam session as a card.
 * Props:
 *   session  — the session object from the API
 *   onDelete — called with the session id when user confirms deletion
 */
export default function SessionCard({ session, onDelete }) {
  const created = new Date(session.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div className="card-body" style={{ flex: 1 }}>
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <Link
            href={`/sessions/${session.id}`}
            style={{ textDecoration: "none" }}
          >
            <h3
              className="card-title"
              style={{ cursor: "pointer", transition: "color 140ms" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "")}
            >
              {session.title}
            </h3>
          </Link>

          <button
            onClick={() => onDelete(session.id, session.title)}
            type="button"
            aria-label={`Delete session "${session.title}"`}
            style={{
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              width: 30,
              height: 30,
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: "none",
              cursor: "pointer",
              color: "var(--fg-faint)",
              transition: "background 130ms, color 130ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#fef2f2";
              e.currentTarget.style.color = "var(--danger)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--fg-faint)";
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        </div>

        {/* Description */}
        {session.description && (
          <p
            className="card-meta"
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              marginBottom: 14,
              color: "var(--fg-mid)",
            }}
          >
            {session.description}
          </p>
        )}

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: "var(--fg-muted)",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {session.document_count}{" "}
            {session.document_count === 1 ? "PDF" : "PDFs"}
          </span>

          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: "var(--fg-muted)",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {session.question_count}{" "}
            {session.question_count === 1 ? "question" : "questions"}
          </span>

          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "var(--fg-faint)",
            }}
          >
            {created}
          </span>
        </div>
      </div>

      {/* Footer CTA */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "12px 22px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Link href={`/sessions/${session.id}`} className="btn btn-secondary btn-sm">
          Open session →
        </Link>
      </div>
    </div>
  );
}

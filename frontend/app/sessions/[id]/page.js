"use client";

import React, { useContext, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { authContext } from "../../auth-context";
import { sessionsApi, documentsApi, questionsApi, attemptsApi, chatApi } from "../../lib/api";
import Navbar from "../../components/Navbar";

// ─── Markdown renderer for chat messages ─────────────────────────────────────
// Lightweight — handles: headings, bold, italic, inline code, code blocks,
// unordered bullets, numbered lists, horizontal rules, blank-line paragraphs.

function MarkdownMessage({ text }) {
  const lines = (text || "").split("\n");
  const elements = [];
  let i = 0;
  let keySeq = 0; // stable, collision-free key for each top-level element

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={keySeq++} style={{
          background: "#1e1e2e", color: "#cdd6f4", borderRadius: 8,
          padding: "12px 16px", overflowX: "auto", fontSize: 13,
          fontFamily: "var(--font-mono, monospace)", lineHeight: 1.6,
          margin: "10px 0",
        }}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i++; // skip closing ```
      continue;
    }

    // Heading ## / ###
    const h3 = line.match(/^###\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) {
      elements.push(<h3 key={keySeq++} style={{ fontSize: 16, fontWeight: 700, margin: "14px 0 6px", color: "var(--fg)" }}>{renderInline(h1[1])}</h3>);
      i++; continue;
    }
    if (h2) {
      elements.push(<h4 key={keySeq++} style={{ fontSize: 15, fontWeight: 700, margin: "12px 0 5px", color: "var(--fg)" }}>{renderInline(h2[1])}</h4>);
      i++; continue;
    }
    if (h3) {
      elements.push(<h5 key={keySeq++} style={{ fontSize: 14, fontWeight: 700, margin: "10px 0 4px", color: "var(--fg)" }}>{renderInline(h3[1])}</h5>);
      i++; continue;
    }

    // Horizontal rule ---
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={keySeq++} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "10px 0" }} />);
      i++; continue;
    }

    // Unordered list block
    if (/^[-*+]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={keySeq++} style={{ margin: "6px 0 6px 20px", padding: 0, listStyleType: "disc" }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 2 }}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list block
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={keySeq++} style={{ margin: "6px 0 6px 20px", padding: 0, listStyleType: "decimal" }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 2 }}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line — small gap
    if (line.trim() === "") {
      elements.push(<div key={keySeq++} style={{ height: 6 }} />);
      i++; continue;
    }

    // Regular paragraph line
    elements.push(
      <p key={keySeq++} style={{ fontSize: 14, lineHeight: 1.65, margin: "2px 0" }}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div style={{ wordBreak: "break-word" }}>{elements}</div>;
}

// Render inline markdown: **bold**, *italic*, `code`
function renderInline(text) {
  if (!text) return null;
  // Split on bold, italic, inline-code patterns
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={i} style={{
          background: "rgba(99,102,241,.12)", color: "var(--brand)",
          padding: "1px 5px", borderRadius: 4, fontSize: 13,
          fontFamily: "var(--font-mono, monospace)",
        }}>{part.slice(1, -1)}</code>
      );
    }
    return part;
  });
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    pending:    ["Pending",    "badge-gray"],
    processing: ["Processing", "badge-yellow"],
    ready:      ["Ready",      "badge-green"],
    error:      ["Error",      "badge-danger"],
  };
  const [label, cls] = map[status] ?? [status, "badge-gray"];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function TypeBadge({ type }) {
  const map = {
    mcq:          ["MCQ",          "badge-blue"],
    true_false:   ["True/False",   "badge-purple"],
    short_answer: ["Short Answer", "badge-yellow"],
  };
  const [label, cls] = map[type] ?? [type, "badge-gray"];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function ScoreCircle({ pct }) {
  const color = pct >= 80 ? "#15803d" : pct >= 60 ? "#d97706" : "#dc2626";
  const bg    = pct >= 80 ? "#dcfce7" : pct >= 60 ? "#fef9c3" : "#fee2e2";
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      width: 90, height: 90, borderRadius: "50%", background: bg, border: `3px solid ${color}`, flexShrink: 0,
    }}>
      <span style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{Math.round(pct)}%</span>
      <span style={{ fontSize: 10, color, fontWeight: 600 }}>score</span>
    </div>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────

function DocumentRow({ doc, onDelete, onSummarize, summarizing }) {
  const date = new Date(doc.uploaded_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const hasSummary = Boolean(doc.summary_one_line);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 8, background: "#fef2f2", color: "#dc2626", flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.original_filename}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3 }}>
          <StatusBadge status={doc.status} />
          {doc.page_count > 0 && <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{doc.page_count}p</span>}
          <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>{date}</span>
        </div>
        {doc.status === "error" && doc.error_message && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>{doc.error_message}</div>}
      </div>
      {doc.status === "ready" && (
        <button onClick={() => onSummarize(doc)} type="button" disabled={summarizing}
          className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>
          {summarizing
            ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />Summarising…</>
            : (hasSummary ? "View summary" : "Summarize PDF")}
        </button>
      )}
      <button onClick={() => onDelete(doc.id, doc.original_filename)} type="button" aria-label={`Delete ${doc.original_filename}`}
        style={{ display: "grid", placeItems: "center", width: 32, height: 32, border: "none", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer", color: "var(--fg-faint)", flexShrink: 0, transition: "background 130ms, color 130ms" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "var(--danger)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--fg-faint)"; }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>
  );
}

// ─── Upload dropzone ──────────────────────────────────────────────────────────

function UploadZone({ sessionId, onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function uploadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) { setError("Only PDF files accepted."); return; }
    if (file.size > 50 * 1024 * 1024) { setError("File must be under 50 MB."); return; }
    setError(""); setUploading(true);
    try { const doc = await documentsApi.upload(sessionId, file); onUploaded(doc); }
    catch (err) { setError(err.message); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return (
    <div>
      <div onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); uploadFile(e.dataTransfer.files?.[0]); }}
        role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 10, padding: "28px 20px",
          border: `2px dashed ${dragging ? "var(--brand)" : "var(--border)"}`,
          borderRadius: "var(--radius-lg)",
          background: dragging ? "var(--brand-light)" : "var(--surface-alt)",
          cursor: uploading ? "wait" : "pointer", transition: "all 150ms", userSelect: "none",
        }}>
        {uploading ? (
          <><span className="spinner" style={{ width: 22, height: 22 }} /><p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0 }}>Uploading…</p></>
        ) : (
          <>
            <div style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--brand)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", margin: "0 0 2px" }}>Drop PDF or click to browse</p>
              <p style={{ fontSize: 11, color: "var(--fg-muted)", margin: 0 }}>PDF only · max 50 MB</p>
            </div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={(e) => uploadFile(e.target.files?.[0])} aria-hidden="true" />
      {error && <div className="error-banner" role="alert" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({ q, index, onAnswer, submitted, userAnswer, breakdown }) {
  const [selected, setSelected] = useState(userAnswer ?? null);

  // After submission, look up this question's result in the breakdown
  const result = submitted && breakdown
    ? breakdown.find((b) => b.question_id === q.id)
    : null;
  const isCorrect = result?.is_correct ?? false;
  const isWrong   = submitted && result && !isCorrect;

  function handleSelect(opt) {
    if (submitted) return;
    setSelected(opt);
    onAnswer(q.id, opt);
  }

  // Number circle color
  const numBg    = !submitted ? "var(--brand-light)" : isCorrect ? "#dcfce7" : "#fee2e2";
  const numColor = !submitted ? "var(--brand)"       : isCorrect ? "#15803d" : "#dc2626";

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-body">
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          {/* Number with result icon */}
          <div style={{ position: "relative", flexShrink: 0, marginTop: 1 }}>
            <span style={{
              display: "grid", placeItems: "center", width: 28, height: 28,
              borderRadius: "50%", background: numBg, color: numColor,
              fontSize: 12, fontWeight: 700,
            }}>{index}</span>
            {submitted && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                display: "grid", placeItems: "center",
                width: 14, height: 14, borderRadius: "50%",
                background: isCorrect ? "#15803d" : "#dc2626",
                color: "#fff", fontSize: 9, fontWeight: 900,
              }}>
                {isCorrect ? "✓" : "✗"}
              </span>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
              <TypeBadge type={q.question_type} />
              {/* Per-question score label after submission */}
              {submitted && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: isCorrect ? "#15803d" : "#dc2626",
                  background: isCorrect ? "#dcfce7" : "#fee2e2",
                  padding: "2px 8px", borderRadius: 999,
                }}>
                  {isCorrect ? "Correct ✓" : "Incorrect ✗"}
                </span>
              )}
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", lineHeight: 1.55, margin: 0 }}>
              {q.question}
            </p>
          </div>
        </div>

        {/* Options */}
        {q.options && q.options.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
            {q.options.map((opt, i) => {
              const isThis       = selected === opt;
              const isCorrectOpt = submitted && opt.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
              let bg = "var(--surface-alt)", border = "var(--border)", color = "var(--fg-mid)";
              if (submitted) {
                if (isCorrectOpt)       { bg = "#dcfce7"; border = "#86efac"; color = "#15803d"; }
                else if (isThis)         { bg = "#fee2e2"; border = "#fca5a5"; color = "#dc2626"; }
              } else if (isThis) {
                bg = "var(--brand-light)"; border = "var(--brand)"; color = "var(--brand)";
              }
              return (
                <button key={i} onClick={() => handleSelect(opt)} type="button"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid ${border}`, borderRadius: "var(--radius)", background: bg, color, cursor: submitted ? "default" : "pointer", textAlign: "left", fontSize: 13, fontWeight: 500, transition: "all 140ms" }}>
                  <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: "50%", border: `1px solid ${border}`, fontSize: 11, fontWeight: 700, flexShrink: 0, background: (isThis || (submitted && isCorrectOpt)) ? color : "transparent", color: (isThis || (submitted && isCorrectOpt)) ? "#fff" : color }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                  {submitted && isCorrectOpt && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", color: "#15803d" }} aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Short answer */}
        {q.question_type === "short_answer" && (
          <div style={{ marginBottom: 10 }}>
            {submitted ? (
              <div>
                {selected && (
                  <div style={{ padding: "8px 12px", borderRadius: "var(--radius)", background: "#f8fafc", border: "1px solid var(--border)", fontSize: 13, color: "var(--fg-mid)", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", display: "block", marginBottom: 2 }}>Your answer:</span>
                    {selected}
                  </div>
                )}
                <div style={{ padding: "10px 14px", borderRadius: "var(--radius)", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#15803d", marginBottom: 3 }}>Expected answer:</div>
                  <div style={{ fontSize: 13, color: "#166534" }}>{q.correct_answer}</div>
                </div>
              </div>
            ) : (
              <textarea rows={2} placeholder="Type your answer…" value={selected || ""}
                onChange={(e) => { setSelected(e.target.value); onAnswer(q.id, e.target.value); }}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none" }}
                onFocus={(e) => { e.target.style.borderColor = "var(--brand)"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,.12)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
            )}
          </div>
        )}

        {/* Explanation */}
        {submitted && q.explanation && (
          <div style={{ padding: "10px 14px", borderRadius: "var(--radius)", background: "#eff6ff", border: "1px solid #bfdbfe", marginTop: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 3 }}>Explanation</div>
            <div style={{ fontSize: 13, color: "#1e40af", lineHeight: 1.55 }}>{q.explanation}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Quiz card (named, collapsible) ───────────────────────────────────────────

// Rebuild a per-question evaluation from a stored attempt + the quiz questions.
function buildBreakdown(questions, attempt) {
  const answers = attempt?.answers ?? {};
  return questions.map((q) => {
    const userAnswer = answers[q.id] ?? null;
    const isCorrect  = userAnswer != null &&
      String(userAnswer).trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase();
    return {
      question_id:    q.id,
      question:       q.question,
      user_answer:    userAnswer,
      correct_answer: q.correct_answer,
      is_correct:     isCorrect,
      explanation:    q.explanation,
    };
  });
}

function Chevron({ open }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 160ms", flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function QuizCard({ quiz, sessionId, onAttemptSaved, defaultOpen }) {
  const questions = quiz.questions ?? [];
  const attempts  = [...(quiz.attempts ?? [])].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  const latestAttempt = attempts[0] ?? null;
  const submitted = attempts.length > 0;

  const [open, setOpen]             = useState(defaultOpen ?? !submitted);
  const [taking, setTaking]         = useState(!submitted);
  const [answers, setAnswers]       = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  const answeredCount = Object.keys(answers).length;

  function handleAnswer(qid, answer) {
    setAnswers((prev) => ({ ...prev, [qid]: answer }));
  }

  async function handleSubmit() {
    if (answeredCount < questions.length) {
      setError(`Answer all ${questions.length} questions first. (${answeredCount}/${questions.length} done)`);
      return;
    }
    setError(""); setSubmitting(true);
    try {
      const res = await attemptsApi.submitQuiz(sessionId, quiz.id, answers);
      onAttemptSaved(quiz.id, res.attempt);
      setAnswers({});
      setTaking(false);
      setOpen(false);            // close the quiz once submitted
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetake() {
    setAnswers({}); setError(""); setTaking(true); setOpen(true);
  }

  const breakdown = latestAttempt ? buildBreakdown(questions, latestAttempt) : null;
  const bestPct   = quiz.best_score ?? (latestAttempt ? Math.round(latestAttempt.percentage) : 0);

  return (
    <div className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
      {/* Clickable header — open/close the quiz like a card */}
      <button onClick={() => setOpen((o) => !o)} type="button" aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", background: "var(--surface-alt)", border: "none", cursor: "pointer", textAlign: "left" }}>
        <Chevron open={open} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{quiz.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
            {submitted
              ? <span className="badge badge-green">Submitted · locked</span>
              : <span className="badge badge-blue">Ready to take</span>}
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
              {questions.length} question{questions.length !== 1 ? "s" : ""}
              {submitted && ` · best ${bestPct}%`}
              {submitted && ` · ${attempts.length} attempt${attempts.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="card-body">
          {error && <div className="error-banner" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

          {taking ? (
            <>
              {/* Progress bar (only while taking) */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg-muted)", marginBottom: 6 }}>
                  <span>Progress</span>
                  <span>{answeredCount} / {questions.length} answered</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, background: "var(--brand)", width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`, transition: "width 300ms" }} />
                </div>
              </div>

              {questions.map((q, i) => (
                <QuestionCard key={q.id} q={q} index={i + 1}
                  onAnswer={handleAnswer} submitted={false}
                  userAnswer={answers[q.id] ?? null} breakdown={null} />
              ))}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                {submitted && (
                  <button onClick={() => { setError(""); setTaking(false); }} className="btn btn-secondary" type="button">Cancel</button>
                )}
                <button onClick={handleSubmit} className="btn btn-primary" type="button" disabled={submitting}>
                  {submitting
                    ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Submitting…</>
                    : "Submit Quiz"}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Latest attempt result banner (read-only evaluation) */}
              {latestAttempt && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 20, padding: "20px 24px",
                  borderRadius: "var(--radius-lg)", marginBottom: 20,
                  background: latestAttempt.percentage >= 80 ? "#f0fdf4" : latestAttempt.percentage >= 60 ? "#fffbeb" : "#fef2f2",
                  border: `1px solid ${latestAttempt.percentage >= 80 ? "#86efac" : latestAttempt.percentage >= 60 ? "#fde68a" : "#fca5a5"}`,
                  flexWrap: "wrap",
                }}>
                  <ScoreCircle pct={latestAttempt.percentage} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--fg)", letterSpacing: "-0.5px" }}>
                      {latestAttempt.score} / {latestAttempt.total} correct
                    </div>
                    <div style={{ fontSize: 14, color: "var(--fg-muted)", marginTop: 4 }}>
                      {latestAttempt.percentage >= 80 ? "🎉 Excellent! You're well prepared."
                       : latestAttempt.percentage >= 60 ? "👍 Good effort — review the missed questions."
                       : "📚 Keep studying — focus on the explanations below."}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                      <button onClick={handleRetake} className="btn btn-secondary btn-sm" type="button">Retake quiz</button>
                      <span style={{ fontSize: 12, color: "var(--fg-muted)", alignSelf: "center" }}>
                        Submitted — answers are locked. Retake to start a fresh attempt.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary mini-bar */}
              {breakdown && (
                <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                  {questions.map((q, i) => {
                    const r = breakdown.find((b) => b.question_id === q.id);
                    const ok = r?.is_correct;
                    return (
                      <div key={q.id} title={`Q${i + 1}: ${ok ? "Correct" : "Incorrect"}`}
                        style={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", background: ok ? "#dcfce7" : "#fee2e2", color: ok ? "#15803d" : "#dc2626", fontSize: 10, fontWeight: 700 }}>
                        {i + 1}
                      </div>
                    );
                  })}
                </div>
              )}

              {questions.map((q, i) => (
                <QuestionCard key={q.id} q={q} index={i + 1}
                  onAnswer={() => {}} submitted={true}
                  userAnswer={latestAttempt?.answers?.[q.id] ?? null}
                  breakdown={breakdown} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Quizzes tab (list of named, collapsible quiz cards) ───────────────────────

function QuizzesTab({ session, onAttemptSaved }) {
  const quizzes = session.quizzes ?? [];

  if (quizzes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">❓</div>
        <h3>No quizzes yet</h3>
        <p>Give the quiz a name above, then upload a PDF and click "Generate Quiz".</p>
      </div>
    );
  }

  // Newest quiz first
  const ordered = [...quizzes].reverse();

  return (
    <div>
      {ordered.map((quiz, i) => (
        <QuizCard key={quiz.id} quiz={quiz} sessionId={session.id}
          onAttemptSaved={onAttemptSaved}
          defaultOpen={i === 0 && !quiz.is_submitted} />
      ))}
    </div>
  );
}

// ─── Score history tab ────────────────────────────────────────────────────────

function ScoresTab({ session }) {
  const attempts = [...(session.attempts ?? [])].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

  if (attempts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">📊</div>
        <h3>No attempts yet</h3>
        <p>Complete a quiz to see your score history here.</p>
      </div>
    );
  }

  const best = Math.max(...attempts.map((a) => a.percentage));
  const avg  = attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length;

  return (
    <div>
      <div className="stats-grid" style={{ maxWidth: 480, marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-label">Attempts</div>
          <div className="stat-card-value">{attempts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Best Score</div>
          <div className="stat-card-value">{Math.round(best)}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Average</div>
          <div className="stat-card-value">{Math.round(avg)}%</div>
        </div>
      </div>
      <div className="card">
        {attempts.map((a, i) => {
          const date  = new Date(a.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const time  = new Date(a.completed_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
          const color = a.percentage >= 80 ? "#15803d" : a.percentage >= 60 ? "#d97706" : "#dc2626";
          const bg    = a.percentage >= 80 ? "#dcfce7" : a.percentage >= 60 ? "#fef9c3" : "#fee2e2";
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderBottom: i < attempts.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "grid", placeItems: "center", width: 52, height: 52, borderRadius: "50%", background: bg, border: `2px solid ${color}`, flexShrink: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color }}>{Math.round(a.percentage)}%</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{a.score} / {a.total} correct</div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{date} at {time}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {i === 0 && attempts.length > 1 && <span className="badge badge-blue">Latest</span>}
                {a.percentage === best && <span className="badge badge-green">Best</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AI Tutor Chat tab ────────────────────────────────────────────────────────

function ChatTab({ session }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    chatApi.history(session.id)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput(""); setError("");

    // Optimistic user bubble
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: text, created_at: new Date().toISOString() }]);
    setSending(true);

    try {
      const reply = await chatApi.send(session.id, text);
      // Replace nothing — just append the real assistant message
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      setError(err.message);
      // Remove the optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  async function handleClear() {
    if (!confirm("Clear chat history?")) return;
    setClearing(true);
    try { await chatApi.clear(session.id); setMessages([]); }
    catch (err) { setError(err.message); }
    finally { setClearing(false); }
  }

  const hasDocs = (session.documents ?? []).some((d) => d.status === "ready");
  const readyCount = (session.documents ?? []).filter((d) => d.status === "ready").length;

  const SUGGESTIONS = [
    "Summarise the key topics",
    "What should I focus on most?",
    "Explain the main concepts step by step",
    "Give me 3 exam tips based on this material",
  ];

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 360px)", minHeight: 460,
      border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
      background: "var(--surface)", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-alt)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 8, background: "var(--brand)", color: "#fff" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>PrepWise Tutor</div>
            <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>
              {hasDocs ? `📄 Answers grounded in your ${readyCount} uploaded PDF${readyCount !== 1 ? "s" : ""}` : "⚠️ No PDFs uploaded — answers may be general"}
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} disabled={clearing} className="btn btn-ghost btn-sm" type="button" style={{ color: "var(--fg-muted)" }}>
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
            <span className="spinner" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🎓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Ask your AI tutor anything</div>
            <div style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.6, marginBottom: 20 }}>
              {hasDocs ? "I'll answer based on your uploaded study material." : "Upload a PDF first so I can give you material-specific answers."}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setInput(s)} type="button"
                  style={{ padding: "7px 14px", border: "1px solid var(--border)", borderRadius: 999, background: "var(--surface-alt)", fontSize: 12, color: "var(--fg-mid)", cursor: "pointer", transition: "all 140ms" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; e.currentTarget.style.background = "var(--brand-light)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--fg-mid)"; e.currentTarget.style.background = "var(--surface-alt)"; }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            {msg.role === "assistant" && (
              <div style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%", background: "var(--brand)", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>P</div>
            )}

            <div style={{
              maxWidth: "78%",
              padding: msg.role === "user" ? "10px 14px" : "12px 16px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user" ? "var(--brand)" : "var(--surface-alt)",
              color: msg.role === "user" ? "#fff" : "var(--fg)",
              boxShadow: "var(--shadow-sm)",
            }}>
              {msg.role === "user"
                ? <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>{msg.content}</p>
                : <MarkdownMessage text={msg.content} />
              }
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: "right" }}>
                {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>

            {msg.role === "user" && (
              <div style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%", background: "var(--brand-light)", color: "var(--brand)", fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                You
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%", background: "var(--brand)", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>P</div>
            <div style={{ padding: "12px 16px", borderRadius: "16px 16px 16px 4px", background: "var(--surface-alt)", display: "flex", gap: 5, alignItems: "center" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--fg-muted)", animation: `chatBounce 1.2s ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && <div className="error-banner" style={{ margin: "0 16px 8px" }} role="alert">{error}</div>}

      {/* Input */}
      <form onSubmit={handleSend} style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your study material…" disabled={sending}
          style={{ flex: 1, height: 42, padding: "0 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--fg)", fontSize: 14, outline: "none", transition: "border-color 150ms, box-shadow 150ms" }}
          onFocus={(e) => { e.target.style.borderColor = "var(--brand)"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,.12)"; }}
          onBlur={(e)  => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }} />
        <button type="submit" className="btn btn-primary" disabled={!input.trim() || sending} style={{ flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          Send
        </button>
      </form>

      <style>{`
        @keyframes chatBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── PDF Summary modal ────────────────────────────────────────────────────────

function SummaryModal({ doc, onClose, onRegenerate, regenerating }) {
  if (!doc) return null;
  const bullets = doc.summary_bullets ?? [];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="summary-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,.45)", backdropFilter: "blur(3px)" }}>
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-xl)", padding: "28px 32px", maxWidth: 700, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)", letterSpacing: "0.5px", textTransform: "uppercase" }}>PDF Summary</div>
            <h2 id="summary-title" style={{ fontSize: 18, fontWeight: 700, color: "var(--fg)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{doc.original_filename}</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" type="button" style={{ color: "var(--fg-muted)", flexShrink: 0 }}>Close</button>
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>One-line summary</div>
          <p style={{ fontSize: 14, color: "var(--fg)", lineHeight: 1.6, margin: 0, padding: "12px 16px", background: "var(--surface-alt)", borderRadius: "var(--radius)" }}>{doc.summary_one_line || "—"}</p>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>3-bullet summary</div>
          <ul style={{ margin: 0, padding: "12px 16px 12px 34px", background: "var(--surface-alt)", borderRadius: "var(--radius)", listStyleType: "disc" }}>
            {bullets.length > 0
              ? bullets.map((b, i) => <li key={i} style={{ fontSize: 14, color: "var(--fg)", lineHeight: 1.6, marginBottom: 4 }}>{b}</li>)
              : <li style={{ fontSize: 14, color: "var(--fg-muted)" }}>—</li>}
          </ul>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Detailed summary</div>
          <div style={{ padding: "12px 16px", background: "var(--surface-alt)", borderRadius: "var(--radius)" }}>
            <MarkdownMessage text={doc.summary_detailed || "—"} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button onClick={onRegenerate} className="btn btn-secondary btn-sm" type="button" disabled={regenerating}>
            {regenerating
              ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />Regenerating…</>
              : "Regenerate summary"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function SessionDetail() {
  const { status }   = useContext(authContext);
  const router       = useRouter();
  const { id }       = useParams();
  const [session, setSession]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [generating, setGenerating]     = useState(false);
  const [genError, setGenError]         = useState("");
  const [numQuestions, setNumQuestions] = useState(10);
  const [quizName, setQuizName]         = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting]         = useState(null);
  const [activeTab, setActiveTab]       = useState("quizzes");
  const [summaryDoc, setSummaryDoc]     = useState(null);
  const [summarizingId, setSummarizingId] = useState(null);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !id) return;
    setLoading(true);
    sessionsApi.get(id)
      .then(setSession)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, id]);

  async function handleGenerate() {
    setGenerating(true); setGenError("");
    try {
      const updated = await questionsApi.generate(session.id, numQuestions, quizName.trim());
      setSession(updated);
      setQuizName("");
      setActiveTab("quizzes");
    }
    catch (err) { setGenError(err.message); }
    finally { setGenerating(false); }
  }

  function handleUploaded(newDoc) {
    setSession((prev) => ({ ...prev, documents: [newDoc, ...(prev?.documents ?? [])] }));
  }

  async function handleDeleteConfirm() {
    if (!confirmDelete || !session) return;
    const { id: docId } = confirmDelete;
    setDeleting(docId); setConfirmDelete(null);
    try {
      await documentsApi.delete(session.id, docId);
      setSession((prev) => ({ ...prev, documents: prev.documents.filter((d) => d.id !== docId) }));
    } catch (err) { setError(err.message); }
    finally { setDeleting(null); }
  }

  // A quiz attempt was submitted — attach it to the quiz and the session history.
  function handleAttemptSaved(quizId, attempt) {
    setSession((prev) => {
      if (!prev) return prev;
      const quizzes = (prev.quizzes ?? []).map((q) => {
        if (q.id !== quizId) return q;
        const attempts = [attempt, ...(q.attempts ?? [])];
        const best = Math.max(...attempts.map((a) => a.percentage));
        return { ...q, attempts, attempt_count: attempts.length, best_score: Math.round(best), is_submitted: true };
      });
      const allAttempts = [attempt, ...(prev.attempts ?? [])];
      const bestScore = allAttempts.length ? Math.round(Math.max(...allAttempts.map((a) => a.percentage))) : null;
      return { ...prev, quizzes, attempts: allAttempts, best_score: bestScore };
    });
  }

  // Summarize a PDF (or show the cached summary).
  async function handleSummarize(doc, force = false) {
    setSummaryError("");
    if (!force && doc.summary_one_line) { setSummaryDoc(doc); return; }
    setSummarizingId(doc.id);
    try {
      const updated = await documentsApi.summarize(session.id, doc.id);
      setSession((prev) => ({ ...prev, documents: prev.documents.map((d) => d.id === updated.id ? updated : d) }));
      setSummaryDoc(updated);
    } catch (err) {
      setSummaryError(err.message);
      setSummaryDoc(doc);
    } finally {
      setSummarizingId(null);
    }
  }

  if (status === "loading" || loading) {
    return <div className="page-loading" role="status"><span className="spinner" /><span>Loading…</span></div>;
  }
  if (error) {
    return (
      <div className="app-layout"><Navbar />
        <main className="page-content">
          <div className="error-banner" role="alert">{error}</div>
          <Link href="/sessions" className="btn btn-secondary" style={{ marginTop: 16 }}>← Back</Link>
        </main>
      </div>
    );
  }
  if (!session) return null;

  const documents = session.documents ?? [];
  const questions = session.questions ?? [];
  const quizzes   = session.quizzes   ?? [];
  const attempts  = session.attempts  ?? [];
  const readyDocs = documents.filter((d) => d.status === "ready");
  const created   = new Date(session.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const TABS = [
    { key: "quizzes",   label: `❓ Quizzes (${quizzes.length})` },
    { key: "scores",    label: `📊 Scores (${attempts.length})` },
    { key: "chat",      label: "🎓 AI Tutor" },
    { key: "documents", label: `📄 PDFs (${documents.length})` },
  ];

  return (
    <div className="app-layout">
      <Navbar />
      <main className="page-content">

        {/* Back */}
        <Link href="/sessions" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-muted)", marginBottom: 24, transition: "color 140ms" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--fg)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--fg-muted)")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to sessions
        </Link>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "clamp(22px,3vw,28px)", fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 4, color: "var(--fg)" }}>{session.title}</h1>
          {session.description && <p style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6, maxWidth: 640 }}>{session.description}</p>}
          <p style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 4 }}>Created {created}</p>
        </div>

        {/* Stats */}
        <div className="stats-grid" style={{ maxWidth: 560, marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-card-label">PDFs</div><div className="stat-card-value">{documents.length}</div></div>
          <div className="stat-card"><div className="stat-card-label">Questions</div><div className="stat-card-value">{questions.length}</div></div>
          <div className="stat-card"><div className="stat-card-label">Attempts</div><div className="stat-card-value">{attempts.length}</div></div>
          <div className="stat-card">
            <div className="stat-card-label">Best Score</div>
            <div className="stat-card-value">{session.best_score != null ? `${session.best_score}%` : "—"}</div>
          </div>
        </div>

        {/* AI Recommendation */}
        {session.study_recommendation && (
          <div style={{ padding: "14px 18px", borderRadius: "var(--radius-lg)", background: "linear-gradient(135deg,#eef2ff,#f0fdf4)", border: "1px solid #c7d2fe", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 8, background: "var(--brand)", color: "#fff", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 4 }}>AI Study Recommendation</div>
              <p style={{ fontSize: 13, color: "var(--fg-mid)", lineHeight: 1.65, margin: 0 }}>{session.study_recommendation}</p>
            </div>
          </div>
        )}

        {/* Generate panel */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 2 }}>✨ Generate a Quiz</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                {readyDocs.length === 0 ? "Upload a PDF first." : `${readyDocs.length} PDF${readyDocs.length !== 1 ? "s" : ""} ready. Each quiz is saved as its own card.`}
              </div>
              {genError && <div className="error-banner" role="alert" style={{ marginTop: 8 }}>{genError}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <label htmlFor="quiz-name" style={{ fontSize: 13, color: "var(--fg-muted)" }}>Name:</label>
              <input id="quiz-name" type="text" value={quizName} placeholder="e.g. Chapter 3"
                onChange={(e) => setQuizName(e.target.value)} disabled={generating}
                style={{ width: 160, height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--fg)", fontSize: 13, outline: "none" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <label htmlFor="num-q" style={{ fontSize: 13, color: "var(--fg-muted)" }}>Questions:</label>
              <select id="num-q" value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))} disabled={generating || readyDocs.length === 0}
                style={{ height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--fg)", fontSize: 13 }}>
                {[5, 10, 15, 20, 25, 30].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <button onClick={handleGenerate} className="btn btn-primary" type="button" disabled={generating || readyDocs.length === 0} style={{ flexShrink: 0 }}>
              {generating
                ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Generating…</>
                : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Generate Quiz</>}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} type="button"
              style={{ padding: "8px 14px", border: "none", background: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", color: activeTab === key ? "var(--brand)" : "var(--fg-muted)", borderBottom: `2px solid ${activeTab === key ? "var(--brand)" : "transparent"}`, marginBottom: "-1px", transition: "color 140ms" }}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === "quizzes"   && <QuizzesTab session={session} onAttemptSaved={handleAttemptSaved} />}
        {activeTab === "scores"    && <ScoresTab session={session} />}
        {activeTab === "chat"      && <ChatTab session={session} />}
        {activeTab === "documents" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 24, alignItems: "start" }}>
            <div className="card">
              {documents.length === 0
                ? <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--fg-muted)", fontSize: 14 }}>No PDFs yet.</div>
                : documents.map((doc) => (
                    <div key={doc.id} style={{ opacity: deleting === doc.id ? 0.4 : 1, transition: "opacity 200ms" }}>
                      <DocumentRow doc={doc}
                        onDelete={(docId, name) => setConfirmDelete({ id: docId, name })}
                        onSummarize={handleSummarize}
                        summarizing={summarizingId === doc.id} />
                    </div>
                  ))}
            </div>
            <div>
              <h2 className="section-title" style={{ marginBottom: 12 }}>Upload PDF</h2>
              <UploadZone sessionId={session.id} onUploaded={handleUploaded} />
              {summaryError && <div className="error-banner" role="alert" style={{ marginTop: 12 }}>{summaryError}</div>}
            </div>
          </div>
        )}
      </main>

      {confirmDelete && (
        <div role="dialog" aria-modal="true" aria-labelledby="del-doc-title"
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,.45)", backdropFilter: "blur(3px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--radius-xl)", padding: "32px 36px", maxWidth: 420, width: "100%", boxShadow: "var(--shadow-lg)" }}>
            <h2 id="del-doc-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Delete document?</h2>
            <p style={{ fontSize: 14, color: "var(--fg-muted)", lineHeight: 1.6, marginBottom: 28 }}>
              <strong style={{ color: "var(--fg)" }}>"{confirmDelete.name}"</strong> will be permanently deleted.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)} type="button">Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm} type="button">Delete</button>
            </div>
          </div>
        </div>
      )}

      {summaryDoc && (
        <SummaryModal doc={summaryDoc}
          onClose={() => setSummaryDoc(null)}
          onRegenerate={() => handleSummarize(summaryDoc, true)}
          regenerating={summarizingId === summaryDoc.id} />
      )}
    </div>
  );
}

export default function SessionDetailPage() {
  return (
    <Suspense fallback={<div className="page-loading" role="status"><span className="spinner" /><span>Loading…</span></div>}>
      <SessionDetail />
    </Suspense>
  );
}

# 🎓 PrepWise — AI-Powered Exam Preparation Platform

> Turn any PDF into quizzes, summaries, and a personal AI tutor.

*Presentation deck — Hackathon project*

---

## 1. The Problem

Studying from dense PDFs is slow and passive.

- 📄 Long lecture notes and textbooks are hard to revise quickly.
- ❓ Students can read a chapter without ever testing themselves.
- 📝 Making practice questions by hand takes hours.
- 🧠 There's no immediate feedback loop to find weak spots.

**Result:** students spend time reading, not learning.

---

## 2. The Solution — PrepWise

An AI study companion that turns uploaded material into an active learning loop.

| Step | What happens |
|------|--------------|
| 1️⃣ Upload | Drop in a PDF — the text is extracted automatically |
| 2️⃣ Understand | Get one-line, bullet, and detailed summaries |
| 3️⃣ Practice | Auto-generate named quizzes from the material |
| 4️⃣ Track | Submit attempts, see per-question evaluation and scores |
| 5️⃣ Ask | Chat with an AI tutor grounded in your own documents |

Everything is organised inside **study sessions**, so each subject or exam has its own workspace.

---

## 3. Tech Stack

**Backend**
- Python · Django 6.1.3 · Django REST Framework 3.18
- JWT auth via `drf-authentication-quick` + `djangorestframework-simplejwt` (cookie transport)
- Google OAuth 2.0 sign-in
- PyMuPDF (`pymupdf`) for PDF text extraction
- OpenAI-compatible LLM client (`openai`) — works with OpenAI, Groq, Gemini, OpenRouter
- SQLite database

**Frontend**
- Next.js 16 (App Router, Turbopack) · React 19
- Cookie-based auth context with automatic token refresh
- Tailwind v4 + custom design system (CSS variables)

---

## 4. Architecture

```
┌────────────────────┐        HTTPS / REST        ┌────────────────────────┐
│   Next.js Frontend │  ───────────────────────▶  │   Django REST Backend  │
│  (App Router, SSR) │  ◀───────────────────────  │  (API views + auth)    │
└────────────────────┘     httpOnly cookies       └───────────┬────────────┘
                                                              │
                                          ┌───────────────────┼───────────────────┐
                                          ▼                   ▼                   ▼
                                   ┌────────────┐     ┌──────────────┐    ┌──────────────┐
                                   │  SQLite DB │     │  Media Files │    │  LLM Provider│
                                   │  (models)  │     │   (PDFs)     │    │ (OpenAI-compat)│
                                   └────────────┘     └──────────────┘    └──────────────┘
```

**Core data model**

```
ExamSession ─┬─▶ Document      (uploaded PDF + extracted text + cached summaries)
             ├─▶ Quiz ─▶ Question        (a named, collapsible quiz)
             ├─▶ QuizAttempt   (score history, linked to a quiz)
             └─▶ ChatMessage   (AI tutor conversation)
```

---

## 5. Core Features

- **Study Sessions** — create, list, and manage workspaces per subject.
- **PDF Upload & Extraction** — drag-and-drop, text auto-extracted with page count.
- **AI Study Recommendation** — a personalised tip based on the material.
- **Named, Collapsible Quizzes** — each generation creates a new quiz card.
- **Auto-scored Attempts** — submit once, get locked, review every question.
- **Score History** — attempts, best score, and average per session.
- **AI Tutor Chat** — Q&A grounded strictly in your uploaded PDFs.
- **🔍 PDF Summary** — three summary formats in one call *(next slide)*.

---

## 6. 🔍 The Mystery: What's Really Inside That PDF?

> You upload a 60-page chapter. You don't want to read it — you want to *know* it.
>
> Behind the **"Summarize PDF"** button sits a single, quiet request. The document text
> is handed to the AI with one strict rule: **change nothing — reveal only what is there.**
> No invented facts. No omitted truths. Just the same meaning, told at three different depths.

The mystery is solved by **`summarize_text()`** in `core/ai_service.py`. One LLM call returns
**three summaries at once**, each answering a different question:

---

### 🧩 The Three Categories

#### ① One-line summary — *"What is this, in a nutshell?"*
A **single sentence** capturing the entire document.
- Ideal for a quick glance or a label on a card.
- The reader knows instantly what the PDF is about.

#### ② 3-bullet summary — *"What are the key points?"*
Exactly **three concise bullet points**.
- Perfect for skimming before a review session.
- Compresses the material into the smallest set of takeaways that still means the same thing.

#### ③ Detailed summary — *"Explain it fully."*
A **thorough, multi-paragraph** summary covering the key ideas in order.
- Worth reading instead of the original chapter when revising.
- Preserves structure and flow, not just isolated facts.

---

### 🔒 The Rule That Keeps the Meaning Intact

Every generation is governed by a strict system prompt:

```
You are a precise academic summariser.
Preserve the original meaning faithfully — do not add, infer, or omit facts.
...
- "one_line" must be exactly one sentence.
- "bullets"  must contain exactly 3 concise bullet points.
- "detailed" should be several paragraphs covering the key ideas in order.
- Never change the meaning of the source material.
```

Runs at a low temperature (`0.3`) for accuracy rather than creativity.

---

### ⚙️ How It Works

| Layer | Detail |
|-------|--------|
| **Button** | `DocumentRow` shows *"Summarize PDF"* (or *"View summary"* if cached) for any `ready` document |
| **Endpoint** | `POST /api/v1/sessions/<session_id>/documents/<doc_id>/summarize/` |
| **View** | `SummarizeDocumentView` validates extractable text, calls `summarize_text()`, saves the result |
| **AI service** | `summarize_text()` → `{ "one_line": str, "bullets": [str, str, str], "detailed": str }` |
| **Storage** | Cached on the `Document` model in `summary_one_line`, `summary_bullets`, `summary_detailed` |
| **UI** | `SummaryModal` renders all three categories, with a *"Regenerate summary"* action |

**Why caching matters:** the result is stored on the document, so viewing a summary is instant
and costs **zero** extra API calls. Only *Regenerate* triggers a fresh run.

---

### 🎬 The Moment of Reveal (Demo)

1. Open a session → **PDFs** tab → upload a chapter.
2. Click **Summarize PDF** on the uploaded file.
3. The three categories appear in a modal:
   - **One-line** — the whole chapter in a sentence.
   - **3-bullet** — the three things that matter most.
   - **Detailed** — the full explanation.
4. The button now reads **View summary** — instant on every future open.

---

## 7. API Surface (selected)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET/POST` | `/api/v1/sessions/` | List / create sessions |
| `POST` | `/api/v1/sessions/<id>/documents/` | Upload a PDF |
| `POST` | `/api/v1/sessions/<id>/documents/<doc_id>/summarize/` | **Generate the 3 summaries** |
| `POST` | `/api/v1/sessions/<id>/generate/` | Generate a named quiz |
| `POST` | `/api/v1/sessions/<id>/quizzes/<quiz_id>/attempts/` | Submit & score an attempt |
| `GET/POST/DELETE` | `/api/v1/sessions/<id>/chat/` | AI tutor history / message / clear |
| `POST` | `/api/v1/accounts/oauth/google/` | Google sign-in |

---

## 8. Security & Auth

- **Google OAuth 2.0** — one-click sign in, accounts created automatically.
- **JWT in httpOnly cookies** — no tokens exposed to JavaScript.
- **Access token: 24 hours · Refresh token: 30 days** — sessions survive a full study day.
- Automatic silent token refresh in the frontend auth context.
- Per-user data isolation — every session, document, and quiz scoped to the owner.

---

## 9. What Makes PrepWise Different

- **Grounded AI** — the tutor and quizzes use *your* material, not generic knowledge.
- **Multi-format understanding** — read it three ways: a sentence, three bullets, or the full story.
- **Active learning by default** — every upload can become a quiz with instant evaluation.
- **Meaning-preserving summaries** — faithful to the source, never embellished.
- **Fast** — summaries are cached; attempts are scored server-side in one round trip.

---

## 10. Roadmap

- 📊 Spaced-repetition and mastery tracking per topic.
- 🧾 Export quizzes and summaries to PDF.
- 👥 Shared study groups and leaderboards.
- 🗣️ Voice-based tutoring.
- 🌐 Support for DOCX, slides, and images (OCR).

---

## 11. Thank You

**PrepWise** — *study smarter, not longer.*

Upload → Understand → Practice → Improve.

"""
AI service — wraps the OpenAI-compatible API.

Works with any provider that supports the OpenAI chat completions format:
OpenAI, Groq, Google Gemini (via their OpenAI-compatible endpoint), OpenRouter, etc.

The model, base URL, and API key all come from Django settings (loaded from .env).
"""

import json
import re

from django.conf import settings
from openai import OpenAI


def _get_client():
    return OpenAI(
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
    )


def _extract_json(text: str) -> str:
    """
    Strip markdown code fences if the model wrapped its JSON in ```json ... ```.
    Returns the raw JSON string.
    """
    text = text.strip()
    # Remove ```json ... ``` or ``` ... ``` fences
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text


# ─── Question generation ──────────────────────────────────────────────────────

QUESTION_SYSTEM_PROMPT = """You are an expert exam question generator for university students.

Given extracted text from a study document, generate practice questions that test understanding.

Return ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "questions": [
    {
      "question": "The question text",
      "type": "mcq",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "explanation": "Why this answer is correct"
    },
    {
      "question": "The question text",
      "type": "true_false",
      "options": ["True", "False"],
      "correct_answer": "True",
      "explanation": "Why this answer is correct"
    },
    {
      "question": "The question text",
      "type": "short_answer",
      "options": [],
      "correct_answer": "The expected answer",
      "explanation": "Key points the answer should cover"
    }
  ],
  "study_recommendation": "2-3 sentence personalised study tip based on the topics found in this document"
}

Rules:
- Generate exactly the number of questions requested
- Mix question types: roughly 60% MCQ, 20% true/false, 20% short answer
- Questions must test actual understanding, not just memorisation
- Keep questions clear and unambiguous
- The study_recommendation should be specific to the topics in the document
"""


def generate_questions(extracted_text: str, num_questions: int = 10) -> dict:
    """
    Send extracted PDF text to the LLM and get back structured questions
    plus a study recommendation.

    Returns a dict with keys: questions (list), study_recommendation (str)
    Raises ValueError on parse failure, re-raises OpenAI exceptions as-is.
    """
    # Truncate to ~12 000 chars to stay well within token limits for gpt-4o-mini
    MAX_CHARS = 12_000
    text_snippet = extracted_text[:MAX_CHARS]
    if len(extracted_text) > MAX_CHARS:
        text_snippet += "\n\n[Document truncated for processing]"

    user_prompt = (
        f"Generate {num_questions} practice questions from the following study material.\n\n"
        f"---\n{text_snippet}\n---"
    )

    client = _get_client()
    response = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[
            {"role": "system", "content": QUESTION_SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=4000,
    )

    raw = response.choices[0].message.content
    json_str = _extract_json(raw)

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {exc}\n\nRaw response:\n{raw}") from exc

    if "questions" not in data:
        raise ValueError("LLM response missing 'questions' key")

    return data


# ─── Study recommendation (standalone, for existing question sets) ─────────────

RECOMMENDATION_SYSTEM_PROMPT = """You are a helpful study coach for university students.

Given a list of topics from a student's study material, give a concise, actionable study recommendation.

Return ONLY a JSON object:
{
  "recommendation": "Your recommendation here (2-4 sentences)",
  "focus_areas": ["topic 1", "topic 2", "topic 3"],
  "study_time_estimate": "e.g. 3-4 hours"
}
"""


def get_study_recommendation(topics_text: str) -> dict:
    """
    Given a short description of topics, return a study recommendation.
    """
    client = _get_client()
    response = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[
            {"role": "system", "content": RECOMMENDATION_SYSTEM_PROMPT},
            {"role": "user",   "content": f"Topics from my study material:\n{topics_text[:3000]}"},
        ],
        temperature=0.5,
        max_tokens=500,
    )

    raw = response.choices[0].message.content
    json_str = _extract_json(raw)

    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        # Fallback — return raw text as recommendation
        return {"recommendation": raw, "focus_areas": [], "study_time_estimate": ""}


# ─── PDF summarisation ────────────────────────────────────────────────────────

SUMMARY_SYSTEM_PROMPT = """You are a precise academic summariser.

You will be given text extracted from a study document. Produce three summaries in one
JSON object. Preserve the original meaning faithfully — do not add, infer, or omit facts.

Return ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "one_line": "A single sentence that captures the whole document.",
  "bullets": ["Point 1", "Point 2", "Point 3"],
  "detailed": "A thorough multi-paragraph summary of the material."
}

Rules:
- "one_line" must be exactly one sentence.
- "bullets" must contain exactly 3 concise bullet points.
- "detailed" should be several paragraphs covering the key ideas in order.
- Never change the meaning of the source material.
"""


def summarize_text(extracted_text: str) -> dict:
    """
    Send extracted PDF text to the LLM and get back three summaries:
    one_line (str), bullets (list of 3 str), detailed (str).

    Raises ValueError on parse failure, re-raises OpenAI exceptions as-is.
    """
    MAX_CHARS = 12_000
    text_snippet = extracted_text[:MAX_CHARS]
    if len(extracted_text) > MAX_CHARS:
        text_snippet += "\n\n[Document truncated for processing]"

    client = _get_client()
    response = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user",   "content": f"Summarise the following study material.\n\n---\n{text_snippet}\n---"},
        ],
        temperature=0.3,
        max_tokens=1500,
    )

    raw = response.choices[0].message.content
    json_str = _extract_json(raw)

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {exc}\n\nRaw response:\n{raw}") from exc

    bullets = data.get("bullets") or []
    if not isinstance(bullets, list):
        bullets = []

    return {
        "one_line": str(data.get("one_line", "")).strip(),
        "bullets":  [str(b).strip() for b in bullets if str(b).strip()],
        "detailed": str(data.get("detailed", "")).strip(),
    }


# ─── AI Tutor chat ────────────────────────────────────────────────────────────

TUTOR_SYSTEM_PROMPT = """You are PrepWise Tutor, a helpful and encouraging AI study assistant.

You have been given the full text extracted from the student's uploaded study material.
Answer questions strictly based on that material. If the answer is not in the material, say so clearly.

Guidelines:
- Be concise but thorough — explain concepts clearly
- Use examples from the material when relevant
- Encourage the student and highlight what they got right
- If a student asks to explain a concept, break it down step by step
- Never make up facts not present in the material
- Keep responses under 300 words unless a detailed explanation is needed
"""


def chat_with_tutor(context_text: str, history: list, user_message: str) -> str:
    """
    Send a message to the AI tutor with the PDF text as context.

    context_text : combined extracted text from all ready documents
    history      : list of {"role": "user"|"assistant", "content": "..."} dicts (last 10)
    user_message : the new user message

    Returns the assistant's reply as a plain string.
    """
    MAX_CONTEXT = 10_000  # chars — keep the system prompt lean
    context_snippet = context_text[:MAX_CONTEXT]
    if len(context_text) > MAX_CONTEXT:
        context_snippet += "\n\n[Material truncated]"

    system_content = (
        TUTOR_SYSTEM_PROMPT
        + "\n\n--- STUDY MATERIAL ---\n"
        + context_snippet
        + "\n--- END OF MATERIAL ---"
    )

    messages = [{"role": "system", "content": system_content}]
    # Include recent history (last 10 turns = 20 messages)
    messages.extend(history[-20:])
    messages.append({"role": "user", "content": user_message})

    client = _get_client()
    response = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=messages,
        temperature=0.5,
        max_tokens=600,
    )
    return response.choices[0].message.content.strip()

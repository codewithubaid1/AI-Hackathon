import { API_URL } from "../auth-context";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const { body, formData, method = "GET", headers: extraHeaders, ...rest } = options;

  let fetchBody = undefined;
  const headers = { ...extraHeaders };

  if (formData) {
    fetchBody = formData;
  } else if (body !== undefined) {
    fetchBody = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers,
    body: fetchBody,
    ...rest,
  });

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }

  if (!response.ok) {
    const message =
      data?.detail || data?.message ||
      (Array.isArray(data) ? data.join(" ") : null) ||
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const sessionsApi = {
  list:   ()        => request("/api/v1/sessions/"),
  create: (payload) => request("/api/v1/sessions/", { method: "POST", body: payload }),
  get:    (id)      => request(`/api/v1/sessions/${id}/`),
  delete: (id)      => request(`/api/v1/sessions/${id}/`, { method: "DELETE" }),
};

// ─── Documents ────────────────────────────────────────────────────────────────
export const documentsApi = {
  upload: (sessionId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request(`/api/v1/sessions/${sessionId}/documents/`, { method: "POST", formData: fd });
  },
  delete: (sessionId, docId) =>
    request(`/api/v1/sessions/${sessionId}/documents/${docId}/`, { method: "DELETE" }),
  summarize: (sessionId, docId) =>
    request(`/api/v1/sessions/${sessionId}/documents/${docId}/summarize/`, { method: "POST" }),
};

// ─── AI generation ────────────────────────────────────────────────────────────
export const questionsApi = {
  generate: (sessionId, numQuestions = 10, name = "") =>
    request(`/api/v1/sessions/${sessionId}/generate/`, {
      method: "POST",
      body: { num_questions: numQuestions, name },
    }),
};

// ─── Quiz attempts ────────────────────────────────────────────────────────────
export const attemptsApi = {
  submit: (sessionId, answers) =>
    request(`/api/v1/sessions/${sessionId}/attempts/`, {
      method: "POST",
      body: { answers },
    }),
  submitQuiz: (sessionId, quizId, answers) =>
    request(`/api/v1/sessions/${sessionId}/quizzes/${quizId}/attempts/`, {
      method: "POST",
      body: { answers },
    }),
  list: (sessionId) =>
    request(`/api/v1/sessions/${sessionId}/attempts/list/`),
};

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const chatApi = {
  history: (sessionId)          => request(`/api/v1/sessions/${sessionId}/chat/`),
  send:    (sessionId, message) => request(`/api/v1/sessions/${sessionId}/chat/`, {
    method: "POST",
    body: { message },
  }),
  clear:   (sessionId)          => request(`/api/v1/sessions/${sessionId}/chat/`, { method: "DELETE" }),
};

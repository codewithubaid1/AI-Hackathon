import uuid
from django.conf import settings
from django.db import models


class ExamSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_sessions",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    study_recommendation = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.user})"


class Document(models.Model):
    class Status(models.TextChoices):
        PENDING    = "pending",    "Pending"
        PROCESSING = "processing", "Processing"
        READY      = "ready",      "Ready"
        ERROR      = "error",      "Error"

    id                = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session           = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name="documents")
    original_filename = models.CharField(max_length=255)
    file              = models.FileField(upload_to="documents/%Y/%m/")
    extracted_text    = models.TextField(blank=True, default="")
    page_count        = models.PositiveIntegerField(default=0)
    status            = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    error_message     = models.TextField(blank=True, default="")
    # AI-generated summaries (cached so we don't re-call the LLM)
    summary_one_line = models.TextField(blank=True, default="")
    summary_bullets  = models.JSONField(default=list)
    summary_detailed = models.TextField(blank=True, default="")
    uploaded_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.original_filename} ({self.session.title})"


class Quiz(models.Model):
    """
    A named quiz inside a session. Each generation creates a new Quiz so a
    session can hold several quizzes, shown as individual collapsible cards.
    """
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session    = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name="quizzes")
    name       = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.name} ({self.session.title})"


class Question(models.Model):
    class QuestionType(models.TextChoices):
        MCQ        = "mcq",          "Multiple Choice"
        TRUE_FALSE = "true_false",   "True / False"
        SHORT      = "short_answer", "Short Answer"

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session        = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name="questions")
    quiz           = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions", null=True, blank=True)
    question       = models.TextField()
    question_type  = models.CharField(max_length=20, choices=QuestionType.choices, default=QuestionType.MCQ)
    options        = models.JSONField(default=list)
    correct_answer = models.TextField()
    explanation    = models.TextField(blank=True, default="")
    order          = models.PositiveIntegerField(default=0)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "created_at"]

    def __str__(self):
        return f"Q{self.order}: {self.question[:60]}"


class QuizAttempt(models.Model):
    """
    One quiz attempt = user completes all questions in a session at a point in time.
    Stores the per-question answers and the computed score.
    """
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session    = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name="attempts")
    quiz       = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts", null=True, blank=True)
    # answers: { "<question_uuid>": "<user_answer_string>" }
    answers    = models.JSONField(default=dict)
    # score fields — calculated on save
    score      = models.PositiveIntegerField(default=0)   # number correct
    total      = models.PositiveIntegerField(default=0)   # total questions answered
    percentage = models.FloatField(default=0.0)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-completed_at"]

    def __str__(self):
        return f"{self.session.title} — {self.percentage:.0f}% ({self.completed_at:%Y-%m-%d})"


class ChatMessage(models.Model):
    """
    One message in the AI tutor conversation for a session.
    Role is 'user' or 'assistant'.
    """
    class Role(models.TextChoices):
        USER      = "user",      "User"
        ASSISTANT = "assistant", "Assistant"

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session    = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name="chat_messages")
    role       = models.CharField(max_length=10, choices=Role.choices)
    content    = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.role}] {self.content[:60]}"

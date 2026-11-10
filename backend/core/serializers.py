from rest_framework import serializers
from .models import ExamSession, Document, Question, Quiz, QuizAttempt, ChatMessage


class DocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id", "original_filename", "file_url",
            "page_count", "status", "error_message",
            "extracted_text", "uploaded_at",
            "summary_one_line", "summary_bullets", "summary_detailed",
        ]
        read_only_fields = fields

    def get_file_url(self, obj):
        request = self.context.get("request")
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class DocumentUploadSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, value):
        if not value.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("Only PDF files are accepted.")
        if value.size > 50 * 1024 * 1024:
            raise serializers.ValidationError("File size must be under 50 MB.")
        return value


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = [
            "id", "question", "question_type",
            "options", "correct_answer", "explanation", "order",
        ]
        read_only_fields = fields


class QuizAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizAttempt
        fields = ["id", "answers", "score", "total", "percentage", "completed_at"]
        read_only_fields = ["id", "score", "total", "percentage", "completed_at"]


class QuizSerializer(serializers.ModelSerializer):
    questions     = QuestionSerializer(many=True, read_only=True)
    attempts      = QuizAttemptSerializer(many=True, read_only=True)
    attempt_count = serializers.SerializerMethodField()
    best_score    = serializers.SerializerMethodField()
    is_submitted  = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = [
            "id", "name", "created_at",
            "questions", "attempts",
            "attempt_count", "best_score", "is_submitted",
        ]
        read_only_fields = fields

    def get_attempt_count(self, obj):
        return obj.attempts.count()

    def get_best_score(self, obj):
        best = obj.attempts.order_by("-percentage").first()
        return round(best.percentage) if best else None

    def get_is_submitted(self, obj):
        return obj.attempts.exists()


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["id", "role", "content", "created_at"]
        read_only_fields = ["id", "role", "created_at"]


class ExamSessionSerializer(serializers.ModelSerializer):
    document_count = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()
    best_score     = serializers.SerializerMethodField()
    attempt_count  = serializers.SerializerMethodField()
    documents      = DocumentSerializer(many=True, read_only=True)
    questions      = QuestionSerializer(many=True, read_only=True)
    quizzes        = QuizSerializer(many=True, read_only=True)
    attempts       = QuizAttemptSerializer(many=True, read_only=True)

    class Meta:
        model = ExamSession
        fields = [
            "id", "title", "description",
            "study_recommendation",
            "document_count", "question_count",
            "best_score", "attempt_count",
            "documents", "questions", "quizzes", "attempts",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "study_recommendation",
            "document_count", "question_count",
            "best_score", "attempt_count",
            "documents", "questions", "quizzes", "attempts",
            "created_at", "updated_at",
        ]

    def get_document_count(self, obj):
        return obj.documents.count()

    def get_question_count(self, obj):
        return obj.questions.count()

    def get_best_score(self, obj):
        best = obj.attempts.order_by("-percentage").first()
        return round(best.percentage) if best else None

    def get_attempt_count(self, obj):
        return obj.attempts.count()

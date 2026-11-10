from urllib.parse import urlencode

import pymupdf as fitz  # PyMuPDF

from django.conf import settings
from django.shortcuts import redirect, get_object_or_404
from rest_framework.exceptions import APIException
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser, FormParser

from drf_auth.managers.oauth_manager import OAuthManager
from drf_auth.managers.token_response import TokenManager

from .models import ExamSession, Document, Question, Quiz, QuizAttempt, ChatMessage
from .serializers import (
    ExamSessionSerializer,
    DocumentSerializer,
    DocumentUploadSerializer,
    QuestionSerializer,
    QuizAttemptSerializer,
    ChatMessageSerializer,
)
from .ai_service import generate_questions, chat_with_tutor, summarize_text


CLIENT_URL = (getattr(settings, "CLIENT_URL", None) or "http://localhost:3000").rstrip("/")


# ─── OAuth views (untouched) ──────────────────────────────────────────────────

def _login_error(message):
    return redirect(f"{CLIENT_URL}/?{urlencode({'oauth_error': message})}")


class FrontendOAuthLoginAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, provider):
        session = OAuthManager.create_session(provider=provider, transport="cookie")
        state = OAuthManager.create_state(session=session)
        authorization_url = OAuthManager.get_authorization_url(provider=provider, state=state)
        return redirect(authorization_url)


class FrontendOAuthCallbackAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, provider):
        if request.query_params.get("error"):
            return _login_error("Google sign-in was cancelled.")

        state = request.query_params.get("state")
        code  = request.query_params.get("code")
        if not state or not code:
            return _login_error("The Google sign-in response was incomplete.")

        try:
            session = OAuthManager.verify_state(state)
        except APIException as exc:
            return _login_error(str(exc.detail))

        try:
            user = OAuthManager.authenticate(provider=provider, code=code)
        except APIException as exc:
            session.delete()
            return _login_error(str(exc.detail))

        session.delete()
        response = TokenManager.create_login_response(user=user, transport="cookie")
        response.status_code = 302
        response["Location"] = f"{CLIENT_URL}/?oauth=success"
        return response


class FrontendLogoutAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            TokenManager.blacklist_refresh_token(request.COOKIES.get("refresh_token", ""))
        except Exception:
            pass
        return TokenManager.create_logout_response(transport="cookie")


# ─── Exam Session views ───────────────────────────────────────────────────────

class ExamSessionListCreateView(generics.ListCreateAPIView):
    serializer_class   = ExamSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ExamSession.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ExamSessionDetailView(generics.RetrieveDestroyAPIView):
    serializer_class   = ExamSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ExamSession.objects.filter(user=self.request.user)


# ─── Document views ───────────────────────────────────────────────────────────

class DocumentUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request, session_id):
        session = get_object_or_404(ExamSession, pk=session_id, user=request.user)

        upload_serializer = DocumentUploadSerializer(data=request.data)
        upload_serializer.is_valid(raise_exception=True)
        file = upload_serializer.validated_data["file"]

        doc = Document.objects.create(
            session=session,
            original_filename=file.name,
            file=file,
            status=Document.Status.PROCESSING,
        )

        try:
            pdf        = fitz.open(stream=doc.file.read(), filetype="pdf")
            pages      = []
            for page in pdf:
                text = page.get_text()
                if text.strip():
                    pages.append(text)
            page_count = pdf.page_count
            pdf.close()

            doc.extracted_text = "\n\n".join(pages)
            doc.page_count     = page_count
            doc.status         = Document.Status.READY
        except Exception as exc:
            doc.status        = Document.Status.ERROR
            doc.error_message = str(exc)

        doc.save()

        serializer = DocumentSerializer(doc, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DocumentDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, session_id, doc_id):
        session = get_object_or_404(ExamSession, pk=session_id, user=request.user)
        doc     = get_object_or_404(Document, pk=doc_id, session=session)

        if doc.file:
            try:
                doc.file.delete(save=False)
            except Exception:
                pass

        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── AI Question Generation ───────────────────────────────────────────────────

class GenerateQuestionsView(APIView):
    """
    POST /api/v1/sessions/<session_id>/generate/

    Body (JSON, optional):
        { "num_questions": 10, "name": "Chapter 3 quiz" }
        num_questions defaults to 10; name defaults to "Quiz N".

    Flow:
    1. Gather all extracted text from READY documents in the session
    2. Send to LLM via ai_service.generate_questions()
    3. Create a new named Quiz and save its Question objects
    4. Save study_recommendation on the session
    5. Return the full updated session
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        exam_session = get_object_or_404(ExamSession, pk=session_id, user=request.user)

        # Collect text from all ready documents
        ready_docs = exam_session.documents.filter(status=Document.Status.READY)
        if not ready_docs.exists():
            return Response(
                {"detail": "No ready documents found. Upload and process a PDF first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        combined_text = "\n\n---\n\n".join(
            f"[{doc.original_filename}]\n{doc.extracted_text}"
            for doc in ready_docs
            if doc.extracted_text.strip()
        )

        if not combined_text.strip():
            return Response(
                {"detail": "The uploaded PDFs contain no extractable text (they may be scanned images)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        num_questions = int(request.data.get("num_questions", 10))
        num_questions = max(3, min(num_questions, 30))  # clamp 3–30

        name = (request.data.get("name") or "").strip()
        if not name:
            name = f"Quiz {exam_session.quizzes.count() + 1}"
        name = name[:200]

        # Call the LLM
        try:
            result = generate_questions(combined_text, num_questions=num_questions)
        except Exception as exc:
            return Response(
                {"detail": f"AI generation failed: {str(exc)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Create a new quiz and its questions (existing quizzes are kept)
        quiz = Quiz.objects.create(session=exam_session, name=name)

        questions_data = result.get("questions", [])
        for idx, q in enumerate(questions_data):
            Question.objects.create(
                session        = exam_session,
                quiz           = quiz,
                question       = q.get("question", ""),
                question_type  = q.get("type", Question.QuestionType.MCQ),
                options        = q.get("options", []),
                correct_answer = q.get("correct_answer", ""),
                explanation    = q.get("explanation", ""),
                order          = idx + 1,
            )

        # Save study recommendation on the session
        exam_session.study_recommendation = result.get("study_recommendation", "")
        exam_session.save()

        # Return the full updated session
        serializer = ExamSessionSerializer(exam_session, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


# ─── Quiz Attempt (score tracking) ───────────────────────────────────────────

class SubmitAttemptView(APIView):
    """
    POST /api/v1/sessions/<session_id>/attempts/

    Body: { "answers": { "<question_id>": "<user_answer>", ... } }

    Scores the attempt against stored correct answers, saves the result,
    and returns the attempt + a breakdown per question.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        exam_session = get_object_or_404(ExamSession, pk=session_id, user=request.user)

        answers = request.data.get("answers", {})
        if not isinstance(answers, dict) or not answers:
            return Response(
                {"detail": "Provide an 'answers' dict mapping question IDs to your answers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        questions = {str(q.id): q for q in exam_session.questions.all()}
        score = 0
        total = 0
        breakdown = []

        for qid, user_answer in answers.items():
            question = questions.get(qid)
            if not question:
                continue
            total += 1
            correct = question.correct_answer.strip().lower() == str(user_answer).strip().lower()
            if correct:
                score += 1
            breakdown.append({
                "question_id":     qid,
                "question":        question.question,
                "user_answer":     user_answer,
                "correct_answer":  question.correct_answer,
                "is_correct":      correct,
                "explanation":     question.explanation,
            })

        percentage = round((score / total * 100), 1) if total else 0.0

        attempt = QuizAttempt.objects.create(
            session    = exam_session,
            answers    = answers,
            score      = score,
            total      = total,
            percentage = percentage,
        )

        return Response({
            "attempt":    QuizAttemptSerializer(attempt).data,
            "breakdown":  breakdown,
            "score":      score,
            "total":      total,
            "percentage": percentage,
        }, status=status.HTTP_201_CREATED)


class AttemptListView(generics.ListAPIView):
    """
    GET /api/v1/sessions/<session_id>/attempts/
    Returns all attempts for a session, most recent first.
    """
    serializer_class   = QuizAttemptSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        session = get_object_or_404(ExamSession, pk=self.kwargs["session_id"], user=self.request.user)
        return session.attempts.all()


class SubmitQuizAttemptView(APIView):
    """
    POST /api/v1/sessions/<session_id>/quizzes/<quiz_id>/attempts/

    Body: { "answers": { "<question_id>": "<user_answer>", ... } }

    Scores the attempt against the quiz's stored correct answers, saves the
    result, and returns the attempt + a per-question breakdown.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id, quiz_id):
        exam_session = get_object_or_404(ExamSession, pk=session_id, user=request.user)
        quiz         = get_object_or_404(Quiz, pk=quiz_id, session=exam_session)

        answers = request.data.get("answers", {})
        if not isinstance(answers, dict) or not answers:
            return Response(
                {"detail": "Provide an 'answers' dict mapping question IDs to your answers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        questions = {str(q.id): q for q in quiz.questions.all()}
        score = 0
        total = 0
        breakdown = []

        for qid, user_answer in answers.items():
            question = questions.get(qid)
            if not question:
                continue
            total += 1
            correct = question.correct_answer.strip().lower() == str(user_answer).strip().lower()
            if correct:
                score += 1
            breakdown.append({
                "question_id":     qid,
                "question":        question.question,
                "user_answer":     user_answer,
                "correct_answer":  question.correct_answer,
                "is_correct":      correct,
                "explanation":     question.explanation,
            })

        percentage = round((score / total * 100), 1) if total else 0.0

        attempt = QuizAttempt.objects.create(
            session    = exam_session,
            quiz       = quiz,
            answers    = answers,
            score      = score,
            total      = total,
            percentage = percentage,
        )

        return Response({
            "attempt":    QuizAttemptSerializer(attempt).data,
            "breakdown":  breakdown,
            "score":      score,
            "total":      total,
            "percentage": percentage,
        }, status=status.HTTP_201_CREATED)


# ─── PDF summarisation ────────────────────────────────────────────────────────

class SummarizeDocumentView(APIView):
    """
    POST /api/v1/sessions/<session_id>/documents/<doc_id>/summarize/

    Generates three summaries (one-line, 3 bullets, detailed) from the
    document's extracted text and caches them on the document.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id, doc_id):
        exam_session = get_object_or_404(ExamSession, pk=session_id, user=request.user)
        doc          = get_object_or_404(Document, pk=doc_id, session=exam_session)

        if not doc.extracted_text.strip():
            return Response(
                {"detail": "This PDF has no extractable text to summarise."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = summarize_text(doc.extracted_text)
        except Exception as exc:
            return Response(
                {"detail": f"AI summarisation failed: {str(exc)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        doc.summary_one_line = result["one_line"]
        doc.summary_bullets  = result["bullets"]
        doc.summary_detailed = result["detailed"]
        doc.save(update_fields=["summary_one_line", "summary_bullets", "summary_detailed"])

        return Response(DocumentSerializer(doc, context={"request": request}).data)


# ─── AI Tutor Chat ────────────────────────────────────────────────────────────

class ChatView(APIView):
    """
    GET  /api/v1/sessions/<session_id>/chat/   → fetch message history
    POST /api/v1/sessions/<session_id>/chat/   → send a message, get AI reply
    DELETE /api/v1/sessions/<session_id>/chat/ → clear chat history
    """
    permission_classes = [IsAuthenticated]

    def _get_session(self, request, session_id):
        return get_object_or_404(ExamSession, pk=session_id, user=request.user)

    def get(self, request, session_id):
        exam_session = self._get_session(request, session_id)
        messages = exam_session.chat_messages.all()
        return Response(ChatMessageSerializer(messages, many=True).data)

    def post(self, request, session_id):
        exam_session = self._get_session(request, session_id)

        user_message = (request.data.get("message") or "").strip()
        if not user_message:
            return Response({"detail": "Message cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        # Build context from all ready documents
        ready_docs = exam_session.documents.filter(status=Document.Status.READY)
        context_text = "\n\n---\n\n".join(
            f"[{doc.original_filename}]\n{doc.extracted_text}"
            for doc in ready_docs
            if doc.extracted_text.strip()
        )

        if not context_text.strip():
            context_text = "No study material has been uploaded yet. Answer general study questions helpfully."

        # Build history from DB (last 20 messages)
        history_qs = exam_session.chat_messages.order_by("-created_at")[:20]
        history = [
            {"role": msg.role, "content": msg.content}
            for msg in reversed(list(history_qs))
        ]

        # Save user message
        ChatMessage.objects.create(
            session=exam_session, role=ChatMessage.Role.USER, content=user_message
        )

        # Call AI
        try:
            reply = chat_with_tutor(context_text, history, user_message)
        except Exception as exc:
            return Response(
                {"detail": f"AI tutor failed: {str(exc)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Save assistant reply
        assistant_msg = ChatMessage.objects.create(
            session=exam_session, role=ChatMessage.Role.ASSISTANT, content=reply
        )

        return Response(ChatMessageSerializer(assistant_msg).data, status=status.HTTP_201_CREATED)

    def delete(self, request, session_id):
        exam_session = self._get_session(request, session_id)
        exam_session.chat_messages.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

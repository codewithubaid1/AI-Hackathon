import django.db.models.deletion
import uuid
from django.db import migrations, models


def backfill_quizzes(apps, schema_editor):
    """
    Existing sessions stored questions directly on the session. Wrap those into
    a single named quiz per session so nothing disappears from the UI, and link
    any existing attempts to it.
    """
    ExamSession = apps.get_model("core", "ExamSession")
    Quiz = apps.get_model("core", "Quiz")
    Question = apps.get_model("core", "Question")
    QuizAttempt = apps.get_model("core", "QuizAttempt")

    for session in ExamSession.objects.all():
        questions = Question.objects.filter(session=session)
        attempts = QuizAttempt.objects.filter(session=session)
        if not questions.exists() and not attempts.exists():
            continue

        quiz = Quiz.objects.create(session=session, name="Quiz 1")
        questions.update(quiz=quiz)
        attempts.update(quiz=quiz)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_chatmessage_quizattempt'),
    ]

    operations = [
        migrations.CreateModel(
            name='Quiz',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='quizzes', to='core.examsession')),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
        migrations.AddField(
            model_name='document',
            name='summary_one_line',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='document',
            name='summary_bullets',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='document',
            name='summary_detailed',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='question',
            name='quiz',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='questions', to='core.quiz'),
        ),
        migrations.AddField(
            model_name='quizattempt',
            name='quiz',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='attempts', to='core.quiz'),
        ),
        migrations.RunPython(backfill_quizzes, migrations.RunPython.noop),
    ]

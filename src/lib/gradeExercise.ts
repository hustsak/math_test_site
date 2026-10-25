import { isCorrect } from './grade';
import type { Question, QuestionResult } from './types';

/** Grades a whole answer sheet. Shared by submit and regrade so they can never disagree. */
export function gradeQuestions(questions: Question[], answers: Record<string, string>) {
  let score = 0;
  let total = 0;
  const details: QuestionResult[] = questions.map((q) => {
    const raw = String(answers[q.id] ?? '').slice(0, 200);
    const ok = isCorrect(q.kind, raw, q.answer);
    const earned = ok ? q.points : 0;
    score += earned;
    total += q.points;

    let given = raw;
    let correctAnswer = q.answer.split('|')[0].trim();
    if (q.kind === 'choice') {
      given = raw ? q.choices?.[Number(raw)] ?? '' : '';
      correctAnswer = q.choices?.[Number(q.answer)] ?? '';
    }

    return {
      id: q.id,
      given,
      raw,
      correct: ok,
      earned,
      points: q.points,
      correctAnswer,
      explanation: q.explanation || '',
    };
  });
  return { score, total, details };
}

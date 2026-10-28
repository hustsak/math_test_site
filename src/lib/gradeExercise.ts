import { isCorrect } from './grade';
import { toText } from './textValue';
import type { Question, QuestionResult } from './types';

/** Grades a whole answer sheet. Shared by submit and regrade so they can never disagree. */
export function gradeQuestions(questions: Question[], answers: Record<string, string>) {
  let score = 0;
  let total = 0;
  const details: QuestionResult[] = questions.map((q) => {
    const raw = String(answers[q.id] ?? '').slice(0, 200);
    // toText: stored answers/choices/explanations are always turned into plain text, never "[object Object]"
    const answerSpec = toText(q.answer);
    const ok = isCorrect(q.kind, raw, answerSpec);
    const earned = ok ? q.points : 0;
    score += earned;
    total += q.points;

    let given = raw;
    let correctAnswer = answerSpec.split('|')[0].trim();
    if (q.kind === 'choice') {
      given = raw ? toText(q.choices?.[Number(raw)]) : '';
      correctAnswer = toText(q.choices?.[Number(answerSpec)]);
    }

    return {
      id: q.id,
      given,
      raw,
      correct: ok,
      earned,
      points: q.points,
      correctAnswer,
      explanation: toText(q.explanation),
    };
  });
  return { score, total, details };
}

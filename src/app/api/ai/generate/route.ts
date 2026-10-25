import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { callClaude } from '@/lib/ai';
import { parseNumber } from '@/lib/grade';
import type { Question } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const newId = () => Math.random().toString(36).slice(2, 10);

const SYSTEM = `You are an experienced, careful mathematics teacher writing exercises.
Return ONLY a JSON array, with no commentary and no markdown fences.
Each element has exactly these keys:
- "prompt": the question text. Put math in LaTeX between single dollar signs, e.g. "Compute $\\\\frac{3}{4}+\\\\frac{1}{2}$".
- "kind": "number" (answer is a number or a fraction like 5/4) or "choice" (multiple choice).
- "answer": for "number": the answer as plain text such as "-5", "1.25" or "5/4" (no LaTeX, no units).
           for "choice": the zero-based INDEX of the correct option as a number.
- "choices": for "choice" only, an array of 4 option strings (math in $...$ allowed); exactly one is correct.
- "explanation": a short, correct, step-by-step explanation of how to solve it.
Rules: double-check every answer by solving the problem yourself. Make sure each question has exactly one correct answer.
Remember this is JSON: every backslash in LaTeX must be written as two backslashes.`;

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const topic = String(body?.topic ?? '').trim().slice(0, 300);
    const level = String(body?.level ?? '').trim().slice(0, 60);
    const count = Math.min(20, Math.max(1, Number(body?.count) || 5));
    const mode: 'number' | 'choice' | 'mixed' = ['number', 'choice', 'mixed'].includes(body?.mode)
      ? body.mode
      : 'mixed';
    const lang: 'km' | 'en' = body?.language === 'en' ? 'en' : 'km';
    if (!topic) return NextResponse.json({ error: 'Please enter a topic.' }, { status: 400 });

    const langRule =
      lang === 'km'
        ? 'Write the question text, the option text and the explanation in Khmer (ភាសាខ្មែរ). Keep all mathematical expressions in LaTeX.'
        : 'Write everything in English.';
    const modeRule =
      mode === 'mixed'
        ? 'Use a mix of "number" and "choice" questions.'
        : `Use only "${mode}" questions.`;

    const user = `Write ${count} math questions.
Topic: ${topic}
Level: ${level || 'not specified'}
${modeRule}
${langRule}`;

    const text = await callClaude(SYSTEM, user, 6000);

    // Tolerate stray text around the array
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    let raw: any[];
    try {
      raw = JSON.parse(text.slice(start, end + 1));
      if (!Array.isArray(raw)) throw new Error('not an array');
    } catch {
      return NextResponse.json({ error: 'The AI reply could not be read. Please try again.' }, { status: 502 });
    }

    const questions: Question[] = [];
    for (const r of raw.slice(0, count)) {
      const prompt = String(r?.prompt ?? '').trim();
      if (!prompt) continue;
      const explanation = String(r?.explanation ?? '').trim();

      if (r?.kind === 'choice' && Array.isArray(r.choices)) {
        const choices = r.choices.map((c: unknown) => String(c ?? '').trim()).filter(Boolean).slice(0, 6);
        const idx = Number(r.answer);
        if (choices.length < 2 || !Number.isInteger(idx) || idx < 0 || idx >= choices.length) continue;
        questions.push({
          id: newId(),
          prompt,
          kind: 'choice',
          choices,
          answer: String(idx),
          points: 1,
          explanation,
          aiGenerated: true,
        });
      } else {
        const answer = String(r?.answer ?? '').trim();
        if (!answer) continue;
        // If the answer is not a clean number/fraction, store it as a text answer instead.
        const kind = parseNumber(answer) !== null ? 'number' : 'text';
        questions.push({ id: newId(), prompt, kind, answer, points: 1, explanation, aiGenerated: true });
      }
    }

    if (!questions.length) {
      return NextResponse.json({ error: 'No usable questions were returned. Please try again.' }, { status: 502 });
    }
    return NextResponse.json({ questions });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

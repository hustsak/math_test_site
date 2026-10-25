import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { gradeQuestions } from '@/lib/gradeExercise';
import type { Exercise, Submission } from '@/lib/types';

export const dynamic = 'force-dynamic';

const GRACE_MS = 15_000; // network slack on top of the time limit

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const attemptId = String(body?.attemptId ?? '');
    const answers: Record<string, string> =
      body?.answers && typeof body.answers === 'object' ? body.answers : {};
    if (!attemptId) return NextResponse.json({ error: 'Missing attempt.' }, { status: 400 });

    const db = adminDb();
    const exSnap = await db.collection('exercises').doc(params.id).get();
    const subRef = db.collection('submissions').doc(attemptId);
    if (!exSnap.exists) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    const ex = exSnap.data() as Exercise;

    const subSnap = await subRef.get();
    if (!subSnap.exists) return NextResponse.json({ error: 'Attempt not found.' }, { status: 404 });
    const sub = subSnap.data() as Submission;
    if (sub.exerciseId !== params.id) {
      return NextResponse.json({ error: 'Attempt does not match this exercise.' }, { status: 400 });
    }
    if (sub.status === 'submitted') {
      return NextResponse.json({ error: 'Already submitted.' }, { status: 409 });
    }

    const now = Date.now();
    const limitMs = (ex.timeLimitMinutes || 0) * 60_000;
    const late = limitMs > 0 && now - sub.startedAt > limitMs + GRACE_MS;

    const { score, total, details } = gradeQuestions(ex.questions, answers);

    await subRef.update({ status: 'submitted', submittedAt: now, late, score, total, details });

    return NextResponse.json({ score, total, late, details });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

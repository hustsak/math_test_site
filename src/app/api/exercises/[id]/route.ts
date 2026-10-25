import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import type { Exercise, PublicExercise } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Public: returns the exercise WITHOUT answers or explanations.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const snap = await adminDb().collection('exercises').doc(params.id).get();
    if (!snap.exists) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    const ex = snap.data() as Exercise;
    if (!ex.published) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });

    const closed = !!ex.deadline && Date.now() > new Date(ex.deadline).getTime();
    const pub: PublicExercise = {
      id: snap.id,
      title: ex.title,
      description: ex.description,
      timeLimitMinutes: ex.timeLimitMinutes || 0,
      deadline: ex.deadline,
      shuffleQuestions: !!ex.shuffleQuestions,
      questions: ex.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        kind: q.kind,
        ...(q.kind === 'choice' ? { choices: q.choices ?? [] } : {}),
        points: q.points,
      })),
    };
    return NextResponse.json({ exercise: pub, closed, serverNow: Date.now() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

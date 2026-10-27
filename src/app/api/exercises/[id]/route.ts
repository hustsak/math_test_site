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
    if (!ex.published || ex.publicationMode === 'draft') {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    }

    const now = Date.now();
    if (ex.publicationMode === 'scheduled' && ex.scheduledPublishAt) {
      const pubMs = typeof ex.scheduledPublishAt === 'number' ? ex.scheduledPublishAt : new Date(ex.scheduledPublishAt).getTime();
      if (now < pubMs) {
        return NextResponse.json({ error: 'Exercise is scheduled for a future release.' }, { status: 403 });
      }
    }

    const closed = !!ex.deadline && now > new Date(ex.deadline).getTime();
    const pub: PublicExercise = {
      id: snap.id,
      title: ex.title,
      description: ex.description,
      chapter: ex.chapter,
      topic: ex.topic,
      timeLimitMinutes: ex.timeLimitMinutes || 0,
      deadline: ex.deadline,
      shuffleQuestions: !!ex.shuffleQuestions,
      gradeLevels: ex.gradeLevels,
      scheduledPublishAt: ex.scheduledPublishAt,
      isSample: !!ex.isSample,
      questions: ex.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        kind: q.kind,
        ...(q.kind === 'choice' ? { choices: q.choices ?? [] } : {}),
        points: q.points,
      })),
    };
    const response = NextResponse.json({ exercise: pub, closed, serverNow: now });
    response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');
    return response;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

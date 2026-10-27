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
    let submissionResult = null;
    const urlObj = new URL(_req.url);
    const tokenQuery = (urlObj.searchParams.get('token') || '').trim();
    const studentNameQuery = (urlObj.searchParams.get('studentName') || '').trim();

    if (tokenQuery || studentNameQuery) {
      let matchedStudentId: string | null = null;
      let matchedNameKey = '';

      if (tokenQuery) {
        const studentSnap = await adminDb()
          .collection('students')
          .where('studentToken', '==', tokenQuery)
          .limit(1)
          .get();
        if (!studentSnap.empty) {
          matchedStudentId = studentSnap.docs[0].id;
          matchedNameKey = studentSnap.docs[0].data().nameKey || '';
        }
      }

      const subsQuery = matchedStudentId
        ? adminDb().collection('submissions').where('studentId', '==', matchedStudentId).where('exerciseId', '==', params.id).limit(5).get()
        : adminDb().collection('submissions').where('exerciseId', '==', params.id).where('nameKey', '==', matchedNameKey || studentNameQuery.toLowerCase()).limit(5).get();

      const subsSnap = await subsQuery;
      const submittedDoc = subsSnap.docs
        .map((d) => d.data())
        .find((s) => s.status === 'submitted');

      if (submittedDoc) {
        submissionResult = {
          score: submittedDoc.score ?? 0,
          total: submittedDoc.total ?? 0,
          late: !!submittedDoc.late,
          details: submittedDoc.details || [],
          studentName: submittedDoc.studentName || '',
          className: submittedDoc.className || '',
        };
      }
    }

    const response = NextResponse.json({
      exercise: pub,
      closed,
      serverNow: now,
      ...(submissionResult ? { submission: submissionResult } : {}),
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { normalize } from '@/lib/grade';
import type { Exercise, Student, Submission, StudentViewData, StudentViewExercise } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        }
      );
    }

    const token = (params?.token || '').trim();
    if (!token) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = adminDb();

    // Look up student by studentToken
    const studentSnap = await db
      .collection('students')
      .where('studentToken', '==', token)
      .where('active', '!=', false)
      .limit(1)
      .get();

    if (studentSnap.empty) {
      // Generic 404 to avoid token probing
      return NextResponse.json(
        { error: 'Student link not found or inactive.' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        }
      );
    }

    const studentDoc = studentSnap.docs[0];
    const student = studentDoc.data() as Student;
    const studentId = studentDoc.id;

    // Fetch published exercises
    const exercisesSnap = await db
      .collection('exercises')
      .where('published', '==', true)
      .get();

    const exList: Array<{ id: string; data: Exercise }> = exercisesSnap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Exercise,
    }));

    // Fetch student's submissions by studentId
    const subsByIdSnap = await db
      .collection('submissions')
      .where('studentId', '==', studentId)
      .get();

    // Also fetch submissions matching nameKey (for backward compatibility with older attempts)
    const nameKey = normalize(student.name);
    const subsByNameSnap = await db
      .collection('submissions')
      .where('nameKey', '==', nameKey)
      .get();

    const submissionMap = new Map<string, Submission>();

    for (const d of [...subsByIdSnap.docs, ...subsByNameSnap.docs]) {
      const sub = d.data() as Submission;
      const existing = submissionMap.get(sub.exerciseId);
      if (
        !existing ||
        (sub.status === 'submitted' && existing.status !== 'submitted') ||
        ((sub.submittedAt || sub.startedAt) > (existing.submittedAt || existing.startedAt))
      ) {
        submissionMap.set(sub.exerciseId, sub);
      }
    }

    const now = Date.now();
    const exercises: StudentViewExercise[] = exList.map(({ id, data: ex }) => {
      const sub = submissionMap.get(id);
      const isClosed = !!(ex.deadline && now > new Date(ex.deadline).getTime());
      const isDone = sub?.status === 'submitted';

      return {
        id,
        title: ex.title,
        description: ex.description || '',
        deadline: ex.deadline,
        timeLimitMinutes: ex.timeLimitMinutes || 0,
        questionCount: ex.questions.length,
        isClosed,
        isDone,
        score: sub?.score,
        total: sub?.total,
        submittedAt: sub?.submittedAt,
      };
    });

    // Sort: open & not done first, then done, then closed
    exercises.sort((a, b) => {
      if (!a.isDone && b.isDone) return -1;
      if (a.isDone && !b.isDone) return 1;
      if (!a.isClosed && b.isClosed) return -1;
      if (a.isClosed && !b.isClosed) return 1;
      return 0;
    });

    const responseData: StudentViewData = {
      student: {
        id: studentId,
        name: student.name,
        className: student.className || '',
      },
      exercises,
    };

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Server error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }
}

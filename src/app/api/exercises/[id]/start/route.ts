import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalize } from '@/lib/grade';
import type { Exercise, Submission } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const studentToken = typeof body?.studentToken === 'string' ? body.studentToken.trim() : '';
    let studentName = String(body?.studentName ?? '').trim().slice(0, 80);
    let studentId: string | undefined = undefined;

    const db = adminDb();

    // If studentToken is provided, look up the student in the roster
    if (studentToken) {
      const studentSnap = await db
        .collection('students')
        .where('studentToken', '==', studentToken)
        .where('active', '!=', false)
        .limit(1)
        .get();

      if (!studentSnap.empty) {
        const studentDoc = studentSnap.docs[0];
        const studentData = studentDoc.data();
        studentId = studentDoc.id;
        studentName = studentData.name || studentName;
      }
    }

    if (!studentName) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });

    const snap = await db.collection('exercises').doc(params.id).get();
    if (!snap.exists || !(snap.data() as Exercise).published) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    }
    const ex = snap.data() as Exercise;

    if (ex.deadline && Date.now() > new Date(ex.deadline).getTime()) {
      return NextResponse.json({ error: 'This exercise is closed.' }, { status: 403 });
    }

    const nameKey = normalize(studentName);

    if (ex.oneAttemptPerName) {
      if (studentId) {
        const dup = await db
          .collection('submissions')
          .where('exerciseId', '==', params.id)
          .where('studentId', '==', studentId)
          .limit(1)
          .get();
        if (!dup.empty) {
          return NextResponse.json(
            { error: 'You have already started or submitted this exercise.' },
            { status: 409 },
          );
        }
      } else {
        const dup = await db
          .collection('submissions')
          .where('exerciseId', '==', params.id)
          .where('nameKey', '==', nameKey)
          .limit(1)
          .get();
        if (!dup.empty) {
          return NextResponse.json(
            { error: 'This name has already started or submitted this exercise.' },
            { status: 409 },
          );
        }
      }
    }

    const startedAt = Date.now();
    const sub: Submission = {
      exerciseId: params.id,
      studentName,
      ...(studentId ? { studentId } : {}),
      nameKey,
      status: 'started',
      startedAt,
    };
    const ref = await db.collection('submissions').add(sub);

    return NextResponse.json({
      attemptId: ref.id,
      startedAt,
      serverNow: Date.now(),
      timeLimitMinutes: ex.timeLimitMinutes || 0,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

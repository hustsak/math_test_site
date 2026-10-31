import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { gradeQuestions } from '@/lib/gradeExercise';
import { verifyClaimSecret } from '@/lib/profiles';
import { ACCESS_ERRORS } from '@/lib/studentAccess';
import type { Exercise, Submission, Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

const GRACE_MS = 15_000; // network slack on top of the time limit

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const attemptId = String(body?.attemptId ?? '');
    const answers: Record<string, string> =
      body?.answers && typeof body.answers === 'object' ? body.answers : {};
    const incomingProfileId = typeof body?.profileId === 'string' ? body.profileId.trim() : '';
    const incomingClaimSecret = typeof body?.claimSecret === 'string' ? body.claimSecret.trim() : '';

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
      return NextResponse.json({
        score: sub.score ?? 0,
        total: sub.total ?? 0,
        late: !!sub.late,
        details: sub.details || [],
        alreadySubmitted: true,
      });
    }

    // Policy check: If the teacher explicitly blocked the student during the test, halt submission.
    // However, if the student's expiration date passed during the attempt, they are allowed to finish.
    // Free sample exercises are never blocked.
    if (sub.studentId && !ex.isSample) {
      const studentDoc = await db.collection('students').doc(sub.studentId).get();
      if (studentDoc.exists) {
        const studentData = studentDoc.data();
        const accessEnabled = studentData?.accessEnabled !== undefined
          ? !!studentData.accessEnabled
          : studentData?.active !== false;

        if (!accessEnabled) {
          return NextResponse.json(
            {
              error: ACCESS_ERRORS.ACCESS_BLOCKED.message,
              code: ACCESS_ERRORS.ACCESS_BLOCKED.code,
            },
            { status: 403 }
          );
        }
      }
    }

    const now = Date.now();
    const limitMs = (ex.timeLimitMinutes || 0) * 60_000;
    const late = limitMs > 0 && now - sub.startedAt > limitMs + GRACE_MS;

    const { score, total, details } = gradeQuestions(ex.questions, answers);

    await subRef.update({
      status: 'submitted',
      submittedAt: now,
      late,
      score,
      total,
      answers,
      exerciseTitle: ex.title || sub.exerciseTitle || 'Math Exercise',
      details,
    });

    // Check if the request is from the owner device of this profile
    let parentLink: string | null = null;
    const targetProfileId = sub.profileId || incomingProfileId;

    if (targetProfileId && incomingClaimSecret) {
      const profileSnap = await db.collection('profiles').doc(targetProfileId).get();
      if (profileSnap.exists) {
        const profile = profileSnap.data() as Profile;
        if (verifyClaimSecret(incomingClaimSecret, profile.claimSecretHash)) {
          const urlObj = new URL(req.url);
          const origin = urlObj.origin;
          parentLink = `${origin}/p/${profile.parentToken}`;
        }
      }
    }

    return NextResponse.json({
      score,
      total,
      late,
      details,
      ...(parentLink ? { parentLink } : {}),
    });
  } catch (e) {
    console.error('Submit error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

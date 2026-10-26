import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { buildParentViewData } from '@/lib/parentTracking';
import type { Exercise, Submission, Profile, AppSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  // 1. Rate limiting: 60 requests per 10 minutes per IP
  const clientIp = getClientIp(req);
  const allowed = checkRateLimit(clientIp, 60, 10 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  const { token } = params;
  if (!token || typeof token !== 'string' || token.trim().length < 24) {
    return NextResponse.json({ error: 'Information not found' }, { status: 404 });
  }

  try {
    const db = adminDb();

    // 2. Look up profile by parentToken
    const profileSnap = await db
      .collection('profiles')
      .where('parentToken', '==', token.trim())
      .limit(1)
      .get();

    if (profileSnap.empty) {
      return NextResponse.json({ error: 'Information not found' }, { status: 404 });
    }

    const profileDoc = profileSnap.docs[0];
    const profile = { id: profileDoc.id, ...profileDoc.data() } as Profile;

    if (profile.hidden) {
      return NextResponse.json({ error: 'Information not found' }, { status: 404 });
    }

    // 3. Fetch published exercises, settings, and submissions for this profile
    const [exercisesSnap, settingsSnap, submissionsSnap] = await Promise.all([
      db.collection('exercises').where('published', '==', true).get(),
      db.collection('settings').doc('app').get(),
      db.collection('submissions').where('profileId', '==', profile.id).get(),
    ]);

    // Fallback: match by nameKey for older submissions before automatic profiles
    const rawNameKey = profile.profileKey ? profile.profileKey.split('|')[0] : '';
    const fallbackSnap = rawNameKey
      ? await db.collection('submissions').where('nameKey', '==', rawNameKey).get()
      : null;

    const allSubsMap = new Map<string, Submission>();
    submissionsSnap.docs.forEach((d) => allSubsMap.set(d.id, d.data() as Submission));
    if (fallbackSnap) {
      fallbackSnap.docs.forEach((d) => {
        if (!allSubsMap.has(d.id)) {
          allSubsMap.set(d.id, d.data() as Submission);
        }
      });
    }

    const submissionsForChild = Array.from(allSubsMap.values());

    const appSettings = settingsSnap.exists
      ? (settingsSnap.data() as AppSettings)
      : { showClassAverageToParents: false };

    const showClassAverage = !!appSettings.showClassAverageToParents;

    // 4. Compute class average percent per exercise if setting enabled
    const classAverageMap: Record<string, number> = {};
    if (showClassAverage && !exercisesSnap.empty) {
      const allSubmittedSnap = await db
        .collection('submissions')
        .where('status', '==', 'submitted')
        .get();

      const exerciseScores: Record<string, number[]> = {};
      allSubmittedSnap.forEach((d) => {
        const sub = d.data() as Submission;
        if (sub.exerciseId && typeof sub.score === 'number' && typeof sub.total === 'number' && sub.total > 0) {
          if (!exerciseScores[sub.exerciseId]) {
            exerciseScores[sub.exerciseId] = [];
          }
          exerciseScores[sub.exerciseId].push(Math.round((sub.score / sub.total) * 100));
        }
      });

      for (const [exId, scores] of Object.entries(exerciseScores)) {
        if (scores.length > 0) {
          const sum = scores.reduce((a, b) => a + b, 0);
          classAverageMap[exId] = Math.round(sum / scores.length);
        }
      }
    }

    const publishedExercises = exercisesSnap.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as Exercise,
    }));

    // 5. Build sanitized parent view data
    const parentData = buildParentViewData({
      childName: profile.name,
      className: profile.className || undefined,
      publishedExercises,
      submissionsForStudent: submissionsForChild,
      classAverageMap,
      showClassAverage,
    });

    const response = NextResponse.json(parentData);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return response;
  } catch (err: any) {
    console.error('Parent route error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

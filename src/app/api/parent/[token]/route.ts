import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { buildParentViewData } from '@/lib/parentTracking';
import { getProfileKey, getProfileId } from '@/lib/profiles';
import { normalizeStudentName } from '@/lib/studentAccess';
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

  const rawToken = params.token ? String(params.token).trim() : '';
  if (!rawToken || rawToken.length < 4) {
    return NextResponse.json({ error: 'Information not found' }, { status: 404 });
  }

  try {
    const db = adminDb();

    // 2. Look up profile by parentToken
    let profile: Profile | null = null;
    let studentId: string | undefined = undefined;
    let studentGrade: number | undefined = undefined;

    // Check profiles collection
    const profileSnap = await db
      .collection('profiles')
      .where('parentToken', '==', rawToken)
      .limit(1)
      .get();

    if (!profileSnap.empty) {
      const pDoc = profileSnap.docs[0];
      profile = { id: pDoc.id, ...pDoc.data() } as Profile;
    }

    // Fallback A: check students collection for parentToken
    if (!profile) {
      const studentSnap = await db
        .collection('students')
        .where('parentToken', '==', rawToken)
        .limit(1)
        .get();

      if (!studentSnap.empty) {
        const sDoc = studentSnap.docs[0];
        const sData = sDoc.data();
        studentId = sDoc.id;
        studentGrade = typeof sData.grade === 'number' ? sData.grade : (parseInt(sData.grade, 10) || undefined);

        const pKey = getProfileKey(sData.name, sData.className);
        const pId = getProfileId(pKey);

        profile = {
          id: pId,
          name: sData.name,
          className: sData.className || null,
          profileKey: pKey,
          parentToken: rawToken,
          claimSecretHash: '',
          createdAt: Date.now(),
        };

        // Sync or merge this profile to profiles collection
        await db.collection('profiles').doc(pId).set(profile, { merge: true }).catch(() => {});
      }
    }

    // Fallback B: check if token was studentToken by mistake
    if (!profile) {
      const studentTokenSnap = await db
        .collection('students')
        .where('studentToken', '==', rawToken)
        .limit(1)
        .get();

      if (!studentTokenSnap.empty) {
        const sDoc = studentTokenSnap.docs[0];
        const sData = sDoc.data();
        studentId = sDoc.id;
        studentGrade = typeof sData.grade === 'number' ? sData.grade : (parseInt(sData.grade, 10) || undefined);

        const pKey = getProfileKey(sData.name, sData.className);
        const pId = getProfileId(pKey);

        profile = {
          id: pId,
          name: sData.name,
          className: sData.className || null,
          profileKey: pKey,
          parentToken: sData.parentToken || rawToken,
          claimSecretHash: '',
          createdAt: Date.now(),
        };
      }
    }

    if (!profile || profile.hidden) {
      return NextResponse.json({ error: 'Information not found' }, { status: 404 });
    }

    // 3. Find matching student record in `students` if not already resolved
    const normNameKey = normalizeStudentName(profile.name);
    const rawNameKey = profile.profileKey ? profile.profileKey.split('|')[0] : '';

    if (!studentId) {
      const sSnap = await db
        .collection('students')
        .where('nameKey', '==', normNameKey)
        .limit(1)
        .get();
      if (!sSnap.empty) {
        studentId = sSnap.docs[0].id;
        const sData = sSnap.docs[0].data();
        if (!studentGrade) {
          studentGrade = typeof sData.grade === 'number' ? sData.grade : (parseInt(sData.grade, 10) || undefined);
        }
      }
    }

    // 4. Fetch published exercises, settings, and ALL submissions for this child
    const subQueries = [
      db.collection('submissions').where('profileId', '==', profile.id).get(),
      db.collection('submissions').where('nameKey', '==', normNameKey).get(),
    ];
    if (studentId) {
      subQueries.push(db.collection('submissions').where('studentId', '==', studentId).get());
    }
    if (rawNameKey && rawNameKey !== normNameKey) {
      subQueries.push(db.collection('submissions').where('nameKey', '==', rawNameKey).get());
    }
    subQueries.push(db.collection('submissions').where('studentName', '==', profile.name).get());

    const [exercisesSnap, settingsSnap, ...subResults] = await Promise.all([
      db.collection('exercises').where('published', '==', true).get(),
      db.collection('settings').doc('app').get(),
      ...subQueries,
    ]);

    const allSubsMap = new Map<string, Submission>();
    for (const snap of subResults) {
      snap.docs.forEach((d) => {
        allSubsMap.set(d.id, d.data() as Submission);
      });
    }

    const submissionsForChild = Array.from(allSubsMap.values());

    const appSettings = settingsSnap.exists
      ? (settingsSnap.data() as AppSettings)
      : { showClassAverageToParents: false };

    const showClassAverage = !!appSettings.showClassAverageToParents;

    // 5. Compute class average percent per exercise if setting enabled
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

    // If student completed exercises that are currently unpublished or archived, fetch their exercise details
    const loadedExIds = new Set(publishedExercises.map((p) => p.id));
    const missingExIds = Array.from(
      new Set(
        submissionsForChild
          .map((s) => s.exerciseId)
          .filter((id) => id && !loadedExIds.has(id))
      )
    );

    if (missingExIds.length > 0) {
      const extraDocs = await Promise.all(
        missingExIds.map((id) => db.collection('exercises').doc(id).get().catch(() => null))
      );
      for (const exDoc of extraDocs) {
        if (exDoc && exDoc.exists) {
          publishedExercises.push({
            id: exDoc.id,
            data: exDoc.data() as Exercise,
          });
        }
      }
    }

    // Calculate student's latest active timestamp
    let lastActiveAt: number | null = null;
    if (profile.lastActivityAt) lastActiveAt = profile.lastActivityAt;
    for (const sub of submissionsForChild) {
      if (sub.submittedAt && (!lastActiveAt || sub.submittedAt > lastActiveAt)) {
        lastActiveAt = sub.submittedAt;
      }
      if (sub.startedAt && (!lastActiveAt || sub.startedAt > lastActiveAt)) {
        lastActiveAt = sub.startedAt;
      }
    }

    // 6. Build sanitized parent view data
    const parentData = buildParentViewData({
      childName: profile.name,
      className: profile.className || undefined,
      studentGrade,
      lastActiveAt,
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

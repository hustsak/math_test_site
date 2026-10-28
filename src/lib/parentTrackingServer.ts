import { adminDb } from '@/lib/firebaseAdmin';
import { buildParentViewData } from '@/lib/parentTracking';
import { getProfileKey, getProfileId } from '@/lib/profiles';
import { normalizeStudentName } from '@/lib/studentAccess';
import type { Exercise, Submission, Profile, AppSettings, ParentViewData } from '@/lib/types';

// In-memory cache for published exercises and app settings (TTL 5 seconds for fast real-time updates)
let cachedExercises: { data: Array<{ id: string; data: Exercise }>; expiresAt: number } | null = null;
let cachedSettings: { data: AppSettings; expiresAt: number } | null = null;

export function invalidatePublishedExercisesCache() {
  cachedExercises = null;
  cachedSettings = null;
}

export async function getCachedPublishedExercises() {
  const now = Date.now();
  if (cachedExercises && cachedExercises.expiresAt > now) {
    return cachedExercises.data;
  }
  const db = adminDb();
  const snap = await db.collection('exercises').where('published', '==', true).get();
  const data = snap.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as Exercise,
  }));
  cachedExercises = { data, expiresAt: now + 5000 };
  return data;
}

async function getCachedAppSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (cachedSettings && cachedSettings.expiresAt > now) {
    return cachedSettings.data;
  }
  const db = adminDb();
  const snap = await db.collection('settings').doc('app').get();
  const data = snap.exists ? (snap.data() as AppSettings) : { showClassAverageToParents: false };
  cachedSettings = { data, expiresAt: now + 60000 };
  return data;
}

export async function fetchParentViewData(rawToken: string): Promise<ParentViewData | null> {
  const token = (rawToken || '').trim();
  if (!token || token.length < 4) return null;

  try {
    const db = adminDb();

    // 1. Look up profile
    let profile: Profile | null = null;
    let studentId: string | undefined = undefined;
    let studentGrade: number | undefined = undefined;

    const profileSnap = await db
      .collection('profiles')
      .where('parentToken', '==', token)
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
        .where('parentToken', '==', token)
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
          parentToken: token,
          claimSecretHash: '',
          createdAt: Date.now(),
        };

        // Asynchronously sync profile
        db.collection('profiles').doc(pId).set(profile, { merge: true }).catch(() => {});
      }
    }

    // Fallback B: check if token was studentToken by mistake
    if (!profile) {
      const studentTokenSnap = await db
        .collection('students')
        .where('studentToken', '==', token)
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
          parentToken: sData.parentToken || token,
          claimSecretHash: '',
          createdAt: Date.now(),
        };
      }
    }

    if (!profile || profile.hidden) {
      return null;
    }

    // 2. Find student ID if needed
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

    // 3. Parallel fetch of published exercises, settings, and submissions
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

    const [publishedExercisesRaw, appSettings, ...subResults] = await Promise.all([
      getCachedPublishedExercises(),
      getCachedAppSettings(),
      ...subQueries,
    ]);

    const allSubsMap = new Map<string, Submission>();
    for (const snap of subResults) {
      snap.docs.forEach((d) => {
        allSubsMap.set(d.id, d.data() as Submission);
      });
    }

    const submissionsForChild = Array.from(allSubsMap.values());
    const publishedExercises = [...publishedExercisesRaw];

    // Fetch details for any submitted exercise not currently in published list
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

    // 4. Build sanitized parent view data
    const parentData = buildParentViewData({
      childName: profile.name,
      className: profile.className || undefined,
      studentGrade,
      lastActiveAt,
      publishedExercises,
      submissionsForStudent: submissionsForChild,
      classAverageMap: {},
      showClassAverage: false,
    });

    return parentData;
  } catch (err) {
    console.error('fetchParentViewData error:', err);
    return null;
  }
}

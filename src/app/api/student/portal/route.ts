import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  normalizeStudentName,
  normalizeClassName,
  evaluateExerciseAvailability,
  formatCambodiaDate,
  ACCESS_ERRORS,
} from '@/lib/studentAccess';
import type { Exercise, Submission } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawName = String(body?.studentName || '').trim();
    const rawClass = body?.className ? String(body.className).trim() : '';

    if (!rawName) {
      return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    }

    const nameKey = normalizeStudentName(rawName);
    const classKey = normalizeClassName(rawClass);

    if (!nameKey) {
      return NextResponse.json({ error: 'Invalid name provided.' }, { status: 400 });
    }

    const db = adminDb();

    // 1. Find matching approved student in `students`
    const studentSnap = await db
      .collection('students')
      .where('nameKey', '==', nameKey)
      .get();

    if (studentSnap.empty) {
      return NextResponse.json(
        {
          error: ACCESS_ERRORS.NOT_APPROVED.message,
          code: ACCESS_ERRORS.NOT_APPROVED.code,
        },
        { status: 403 }
      );
    }

    let targetDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    if (studentSnap.docs.length === 1) {
      targetDoc = studentSnap.docs[0];
    } else {
      if (classKey) {
        targetDoc = studentSnap.docs.find((d) => d.data().classKey === classKey) || null;
      }
      if (!targetDoc) {
        return NextResponse.json(
          {
            error: ACCESS_ERRORS.AMBIGUOUS_NAME.message,
            code: ACCESS_ERRORS.AMBIGUOUS_NAME.code,
          },
          { status: 403 }
        );
      }
    }

    const sData = targetDoc.data();
    const studentId = targetDoc.id;
    const accessEnabled = sData.accessEnabled !== undefined ? !!sData.accessEnabled : sData.active !== false;

    if (!accessEnabled) {
      return NextResponse.json(
        {
          error: ACCESS_ERRORS.ACCESS_BLOCKED.message,
          code: ACCESS_ERRORS.ACCESS_BLOCKED.code,
        },
        { status: 403 }
      );
    }

    const now = Date.now();
    let expiresAtMs = now + 30 * 24 * 60 * 60 * 1000;
    if (sData.expiresAt?.toMillis) {
      expiresAtMs = sData.expiresAt.toMillis();
    } else if (typeof sData.expiresAt === 'number') {
      expiresAtMs = sData.expiresAt;
    } else if (sData.expiresAt?._seconds) {
      expiresAtMs = sData.expiresAt._seconds * 1000;
    }

    if (now >= expiresAtMs) {
      return NextResponse.json(
        {
          error: ACCESS_ERRORS.ACCESS_EXPIRED.message,
          code: ACCESS_ERRORS.ACCESS_EXPIRED.code,
        },
        { status: 403 }
      );
    }

    const rawGrades = Array.isArray(sData.grades) && sData.grades.length > 0
      ? sData.grades.map((g: any) => parseInt(g, 10)).filter((g: number) => !isNaN(g) && g >= 7 && g <= 12)
      : null;
    const defaultGrade = typeof sData.grade === 'number' ? sData.grade : (parseInt(sData.grade, 10) || (rawGrades ? rawGrades[0] : 7));
    const enrolledGrades: number[] = rawGrades && rawGrades.length > 0 ? Array.from(new Set(rawGrades)) : [defaultGrade];

    // Security check: Verify requested grade against student's approved grades in database
    const rawRequestedGrade = body?.requestedGrade;
    let activeGrade = defaultGrade;

    if (rawRequestedGrade !== undefined && rawRequestedGrade !== null) {
      const requestedGradeNum = typeof rawRequestedGrade === 'number' ? rawRequestedGrade : parseInt(String(rawRequestedGrade), 10);
      if (!isNaN(requestedGradeNum)) {
        if (!enrolledGrades.includes(requestedGradeNum)) {
          const gradesLabel = enrolledGrades.map((g) => `ថ្នាក់ទី ${g}`).join(' និង ');
          return NextResponse.json(
            {
              error: `ឈ្មោះរបស់អ្នកស្ថិតក្នុង ${gradesLabel}។ អ្នកមិនអាចចូលមើលលំហាត់ថ្នាក់ទី ${requestedGradeNum} បានទេ។ (Access restricted to your enrolled Grade ${enrolledGrades.join(', ')}).`,
              code: 'GRADE_MISMATCH',
              actualGrade: defaultGrade,
              enrolledGrades,
            },
            { status: 403 }
          );
        }
        activeGrade = requestedGradeNum;
      }
    }

    const studentGrade = activeGrade;

    // 2. Fetch cached published exercises (avoids hammering Firestore for every student visit)
    const { getCachedPublishedExercises } = await import('@/lib/parentTrackingServer');
    const cachedExList = await getCachedPublishedExercises();

    // 3. Fetch submissions for this student with selected fields and a sensible limit (e.g. 150 latest)
    const [subByIdSnap, subByNameSnap] = await Promise.all([
      db.collection('submissions')
        .where('studentId', '==', studentId)
        .orderBy('startedAt', 'desc')
        .limit(150)
        .get()
        .catch(() => db.collection('submissions').where('studentId', '==', studentId).limit(150).get()),
      db.collection('submissions')
        .where('nameKey', '==', nameKey)
        .orderBy('startedAt', 'desc')
        .limit(150)
        .get()
        .catch(() => db.collection('submissions').where('nameKey', '==', nameKey).limit(150).get()),
    ]);

    const completedSubsMap = new Map<string, Submission & { id: string }>();

    const recordSub = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = doc.data() as Submission;
      if (data.status === 'submitted') {
        const existing = completedSubsMap.get(data.exerciseId);
        if (!existing || (data.submittedAt || 0) > (existing.submittedAt || 0)) {
          completedSubsMap.set(data.exerciseId, { id: doc.id, ...data });
        }
      }
    };

    subByIdSnap.docs.forEach(recordSub);
    subByNameSnap.docs.forEach(recordSub);

    const availableNow: any[] = [];
    const upcoming: any[] = [];
    const completed: any[] = [];
    const closed: any[] = [];

    const paymentStatus = sData.paymentStatus || 'approved';
    const isUnpaid = paymentStatus === 'pending';

    cachedExList.forEach(({ id: exId, data: ex }) => {

      // Filter: exercise must be assigned to student's grade (or be untargeted/all grades)
      if (Array.isArray(ex.gradeLevels) && ex.gradeLevels.length > 0) {
        if (!ex.gradeLevels.includes(studentGrade)) {
          return; // Skip exercises not for this student's grade
        }
      }

      // Check if already completed
      const sub = completedSubsMap.get(exId);
      const questionCount = ex.questions?.length || 0;
      const totalPoints = ex.questions?.reduce((s, q) => s + (Number(q.points) || 0), 0) || 0;
      const isSample = !!ex.isSample;
      const isLockedForPayment = isUnpaid && !isSample;

      if (sub) {
        completed.push({
          exerciseId: exId,
          submissionId: sub.id,
          title: ex.title || sub.exerciseTitle || 'Math Exercise',
          description: ex.description || '',
          score: sub.score ?? 0,
          total: sub.total ?? totalPoints,
          percentage: sub.total && sub.total > 0 ? Math.round(((sub.score || 0) / sub.total) * 100) : 0,
          submittedAt: sub.submittedAt || sub.startedAt,
          late: !!sub.late,
          questionCount,
          isSample,
        });
        return;
      }

      // If not completed, evaluate availability
      const availability = evaluateExerciseAvailability(ex, studentGrade, now);

      if (availability.available) {
        availableNow.push({
          id: exId,
          title: ex.title,
          description: ex.description || '',
          chapter: ex.chapter || null,
          topic: ex.topic || null,
          timeLimitMinutes: ex.timeLimitMinutes || 0,
          deadline: ex.deadline || null,
          gradeLevels: ex.gradeLevels || [studentGrade],
          questionCount,
          totalPoints,
          isSample,
          isLockedForPayment,
        });
      } else if (availability.upcoming) {
        upcoming.push({
          id: exId,
          title: ex.title,
          description: ex.description || '',
          chapter: ex.chapter || null,
          topic: ex.topic || null,
          scheduledPublishAt: ex.scheduledPublishAt || null,
          timeLimitMinutes: ex.timeLimitMinutes || 0,
          deadline: ex.deadline || null,
          gradeLevels: ex.gradeLevels || [studentGrade],
          questionCount,
          totalPoints,
          isSample,
          isLockedForPayment,
        });
      } else if (availability.closed) {
        closed.push({
          id: exId,
          title: ex.title,
          description: ex.description || '',
          chapter: ex.chapter || null,
          topic: ex.topic || null,
          deadline: ex.deadline || null,
          questionCount,
          totalPoints,
          isSample,
          isLockedForPayment,
        });
      }
    });

    // Sort availableNow: sample exercises first, then unlocked first, then deadline asc
    availableNow.sort((a, b) => {
      if (a.isSample && !b.isSample) return -1;
      if (!a.isSample && b.isSample) return 1;
      if (!a.isLockedForPayment && b.isLockedForPayment) return -1;
      if (a.isLockedForPayment && !b.isLockedForPayment) return 1;
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });

    // Sort upcoming by scheduledPublishAt asc
    upcoming.sort((a, b) => {
      const aTime = a.scheduledPublishAt ? new Date(a.scheduledPublishAt).getTime() : 0;
      const bTime = b.scheduledPublishAt ? new Date(b.scheduledPublishAt).getTime() : 0;
      return aTime - bTime;
    });

    // Sort completed by submittedAt desc
    completed.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

    return NextResponse.json({
      student: {
        id: studentId,
        name: sData.name,
        grade: studentGrade,
        grades: enrolledGrades,
        className: sData.className || null,
        expirationDate: formatCambodiaDate(expiresAtMs),
        parentToken: sData.parentToken || null,
        studentToken: sData.studentToken || null,
        paymentStatus,
      },
      availableNow,
      upcoming,
      completed,
      closed,
    });
  } catch (e: any) {
    console.error('Student portal error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

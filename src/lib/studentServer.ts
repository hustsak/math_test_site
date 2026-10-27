import { adminDb } from '@/lib/firebaseAdmin';
import { normalize } from '@/lib/grade';
import { getCachedPublishedExercises } from '@/lib/parentTrackingServer';
import type { Student, Submission, StudentViewData, StudentViewExercise } from '@/lib/types';

export async function fetchStudentPortalData(rawToken: string): Promise<StudentViewData | null> {
  const token = (rawToken || '').trim();
  if (!token) return null;

  try {
    const db = adminDb();

    // Look up student by studentToken
    const studentSnap = await db
      .collection('students')
      .where('studentToken', '==', token)
      .limit(1)
      .get();

    if (studentSnap.empty) {
      return null;
    }

    const studentDoc = studentSnap.docs[0];
    const student = studentDoc.data() as Student;
    const studentId = studentDoc.id;

    // Check if student access is blocked
    const accessEnabled = student.accessEnabled !== undefined ? !!student.accessEnabled : (student as any).active !== false;
    if (!accessEnabled) {
      return null;
    }

    const studentGrade = typeof student.grade === 'number' ? student.grade : (parseInt(String(student.grade), 10) || undefined);

    // Parallel fetch: cached published exercises and student's submissions
    const nameKey = normalize(student.name);

    const [exListRaw, subsByIdSnap, subsByNameSnap] = await Promise.all([
      getCachedPublishedExercises(),
      db.collection('submissions').where('studentId', '==', studentId).limit(150).get(),
      db.collection('submissions').where('nameKey', '==', nameKey).limit(150).get(),
    ]);

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

    // Filter exercises by student grade if set
    const exList = exListRaw.filter(({ data: ex }) => {
      if (studentGrade && Array.isArray(ex.gradeLevels) && ex.gradeLevels.length > 0) {
        return ex.gradeLevels.includes(studentGrade);
      }
      return true;
    });

    const paymentStatus = student.paymentStatus || 'approved';
    const isUnpaid = paymentStatus === 'pending';

    const now = Date.now();
    const exercises: StudentViewExercise[] = exList.map(({ id, data: ex }) => {
      const sub = submissionMap.get(id);
      const isClosed = !!(ex.deadline && now > new Date(ex.deadline).getTime());
      const isDone = sub?.status === 'submitted';
      const isSample = !!ex.isSample;
      const isLockedForPayment = isUnpaid && !isSample;

      return {
        id,
        title: ex.title,
        description: ex.description || '',
        deadline: ex.deadline,
        timeLimitMinutes: ex.timeLimitMinutes || 0,
        questionCount: ex.questions.length,
        isClosed,
        isDone,
        isSample,
        isLockedForPayment,
        score: sub?.score,
        total: sub?.total,
        submittedAt: sub?.submittedAt,
      };
    });

    // Sort: open & sample/not-locked first, then done, then locked, then closed
    exercises.sort((a, b) => {
      if (a.isSample && !b.isSample) return -1;
      if (!a.isSample && b.isSample) return 1;
      if (!a.isLockedForPayment && b.isLockedForPayment) return -1;
      if (a.isLockedForPayment && !b.isLockedForPayment) return 1;
      if (!a.isDone && b.isDone) return -1;
      if (a.isDone && !b.isDone) return 1;
      if (!a.isClosed && b.isClosed) return -1;
      if (a.isClosed && !b.isClosed) return 1;
      return 0;
    });

    return {
      student: {
        id: studentId,
        name: student.name,
        className: student.className || '',
        paymentStatus,
        studentToken: token,
      },
      exercises,
    };
  } catch (err) {
    console.error('fetchStudentPortalData error:', err);
    return null;
  }
}

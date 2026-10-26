import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { normalize } from '@/lib/grade';
import { buildParentViewData } from '@/lib/parentTracking';
import type { AppSettings, Exercise, Student, Submission } from '@/lib/types';

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
        { error: 'Parent link not found or expired.' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        }
      );
    }

    const db = adminDb();

    // Look up student by parentToken
    const studentSnap = await db
      .collection('students')
      .where('parentToken', '==', token)
      .where('active', '!=', false)
      .limit(1)
      .get();

    if (studentSnap.empty) {
      // Generic 404 to avoid token probing
      return NextResponse.json(
        { error: 'Parent link not found or expired.' },
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

    // Check App Settings (e.g. showClassAverageToParents)
    let showClassAverage = false;
    try {
      const settingsSnap = await db.collection('settings').doc('app').get();
      if (settingsSnap.exists) {
        const settings = settingsSnap.data() as AppSettings;
        showClassAverage = !!settings.showClassAverageToParents;
      }
    } catch (e) {
      // Default to false if settings doc does not exist
      showClassAverage = false;
    }

    // Fetch published exercises
    const exercisesSnap = await db
      .collection('exercises')
      .where('published', '==', true)
      .get();

    const publishedExercises: Array<{ id: string; data: Exercise }> = exercisesSnap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Exercise,
    }));

    // Fetch this child's submissions
    const subsByIdSnap = await db
      .collection('submissions')
      .where('studentId', '==', studentId)
      .get();

    const nameKey = normalize(student.name);
    const subsByNameSnap = await db
      .collection('submissions')
      .where('nameKey', '==', nameKey)
      .get();

    const submissionsForStudent: Submission[] = [];
    const seenAttemptIds = new Set<string>();

    for (const d of [...subsByIdSnap.docs, ...subsByNameSnap.docs]) {
      if (!seenAttemptIds.has(d.id)) {
        seenAttemptIds.add(d.id);
        submissionsForStudent.push(d.data() as Submission);
      }
    }

    // Compute class average if enabled
    const classAverageMap: Record<string, number> = {};
    if (showClassAverage && publishedExercises.length > 0) {
      // For each exercise, calculate the class average percentage
      for (const { id: exId } of publishedExercises) {
        const allSubsSnap = await db
          .collection('submissions')
          .where('exerciseId', '==', exId)
          .where('status', '==', 'submitted')
          .get();

        if (!allSubsSnap.empty) {
          let sumPercent = 0;
          let count = 0;
          for (const s of allSubsSnap.docs) {
            const data = s.data() as Submission;
            if (data.total && data.total > 0 && typeof data.score === 'number') {
              sumPercent += (data.score / data.total) * 100;
              count++;
            }
          }
          if (count > 0) {
            classAverageMap[exId] = Math.round(sumPercent / count);
          }
        }
      }
    }

    // Build sanitized output - zero leakage of other students or unsubmitted answers
    const parentData = buildParentViewData({
      childName: student.name,
      className: student.className || '',
      studentId,
      publishedExercises,
      submissionsForStudent,
      classAverageMap,
      showClassAverage,
    });

    return NextResponse.json(parentData, {
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

import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  normalizeStudentName,
  normalizeClassName,
  evaluateExerciseAvailability,
  ACCESS_ERRORS,
} from '@/lib/studentAccess';
import {
  getProfileKey,
  getProfileId,
  generateToken,
  generateClaimSecret,
  hashClaimSecret,
  verifyClaimSecret,
} from '@/lib/profiles';
import type { Exercise, Submission, Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    // 1. Rate limiting on start requests to mitigate brute-force name guessing
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp, 40, 5 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment before trying again.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    let studentName = String(body?.studentName ?? '').trim().slice(0, 80);
    const className = body?.className ? String(body.className).trim().slice(0, 40) : '';
    const incomingClaimSecret = typeof body?.claimSecret === 'string' ? body.claimSecret.trim() : '';
    const studentToken = typeof body?.studentToken === 'string' ? body.studentToken.trim() : '';

    if (!studentName) {
      return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    }

    const db = adminDb();

    // 2. Validate exercise existence, published status, and deadline
    const exSnap = await db.collection('exercises').doc(params.id).get();
    if (!exSnap.exists || !(exSnap.data() as Exercise).published) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    }
    const ex = exSnap.data() as Exercise;

    if (ex.deadline && Date.now() > new Date(ex.deadline).getTime()) {
      return NextResponse.json({ error: 'This exercise is closed.' }, { status: 403 });
    }

    // 3. Normalize student name consistently
    const nameKey = normalizeStudentName(studentName);
    const classKey = normalizeClassName(className);

    if (!nameKey) {
      return NextResponse.json({ error: 'Please enter a valid student name.' }, { status: 400 });
    }

    // 4. Find matching approved student in `students` collection
    let studentId: string | undefined = undefined;
    let approvedStudentName = studentName;

    // If studentToken is provided from student link
    let targetDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    if (studentToken) {
      const tokenSnap = await db
        .collection('students')
        .where('studentToken', '==', studentToken)
        .limit(1)
        .get();

      if (!tokenSnap.empty) {
        targetDoc = tokenSnap.docs[0];
        studentId = targetDoc.id;
        approvedStudentName = targetDoc.data().name || studentName;
      }
    }

    if (!targetDoc) {
      // Search by normalized nameKey
      const studentsSnap = await db
        .collection('students')
        .where('nameKey', '==', nameKey)
        .get();

      if (studentsSnap.empty) {
        // Name not on approved list
        return NextResponse.json(
          {
            error: ACCESS_ERRORS.NOT_APPROVED.message,
            code: ACCESS_ERRORS.NOT_APPROVED.code,
          },
          { status: 403 }
        );
      }

      if (studentsSnap.docs.length === 1) {
        targetDoc = studentsSnap.docs[0];
      } else {
        // Multiple records exist for this nameKey across different classes
        if (classKey) {
          targetDoc = studentsSnap.docs.find((d) => d.data().classKey === classKey) || null;
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
    }

    const studentData = targetDoc.data();
    studentId = targetDoc.id;
    approvedStudentName = studentData.name || studentName;

    // 5. Verify accessEnabled (or legacy active)
    const accessEnabled = studentData.accessEnabled !== undefined
      ? !!studentData.accessEnabled
      : studentData.active !== false;

    if (!accessEnabled) {
      return NextResponse.json(
        {
          error: ACCESS_ERRORS.ACCESS_BLOCKED.message,
          code: ACCESS_ERRORS.ACCESS_BLOCKED.code,
        },
        { status: 403 }
      );
    }

    // 5.1 Verify Payment Approval: if payment is pending, only sample exercises are allowed
    const paymentStatus = studentData.paymentStatus || 'approved';
    const isExerciseSample = !!ex.isSample;
    if (paymentStatus === 'pending' && !isExerciseSample) {
      return NextResponse.json(
        {
          error: ACCESS_ERRORS.PAYMENT_REQUIRED.message,
          code: ACCESS_ERRORS.PAYMENT_REQUIRED.code,
        },
        { status: 403 }
      );
    }

    // 6. Verify expiration boundary in Cambodia time
    const now = Date.now();
    let expiresAtMs = now + 30 * 24 * 60 * 60 * 1000;
    if (studentData.expiresAt?.toMillis) {
      expiresAtMs = studentData.expiresAt.toMillis();
    } else if (typeof studentData.expiresAt === 'number') {
      expiresAtMs = studentData.expiresAt;
    } else if (studentData.expiresAt?._seconds) {
      expiresAtMs = studentData.expiresAt._seconds * 1000;
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

    const rawGrades = Array.isArray(studentData.grades) && studentData.grades.length > 0
      ? studentData.grades.map((g: any) => parseInt(g, 10)).filter((g: number) => !isNaN(g) && g >= 7 && g <= 12)
      : null;
    const defaultGrade = typeof studentData.grade === 'number' ? studentData.grade : (parseInt(studentData.grade, 10) || (rawGrades ? rawGrades[0] : 7));
    const enrolledGrades: number[] = rawGrades && rawGrades.length > 0 ? Array.from(new Set(rawGrades)) : [defaultGrade];

    // If exercise specifies target grade levels, pick matching grade; otherwise fallback to defaultGrade
    let studentGrade = defaultGrade;
    if (Array.isArray(ex.gradeLevels) && ex.gradeLevels.length > 0) {
      const matched = enrolledGrades.find((g) => ex.gradeLevels!.includes(g));
      if (matched) studentGrade = matched;
    }

    // Verify exercise availability: scheduling (Asia/Phnom_Penh), publication, drip, and grade level match
    const studentCreatedAt = studentData.createdAt || null;
    const availability = evaluateExerciseAvailability(ex, studentGrade, now, studentCreatedAt);
    if (!availability.available) {
      return NextResponse.json(
        {
          error: availability.reason || 'This exercise is currently unavailable.',
          code: 'EXERCISE_UNAVAILABLE',
        },
        { status: 403 }
      );
    }

    // Update student's lastActivityAt timestamp upon authorized entry
    await targetDoc.ref
      .update({ lastActivityAt: admin.firestore.FieldValue.serverTimestamp() })
      .catch(() => {});

    // 7. Resolve or create Automatic Student Profile for Parent Tracking
    const profileKey = getProfileKey(approvedStudentName, studentData.className || className);
    const profileId = getProfileId(profileKey);
    const profileRef = db.collection('profiles').doc(profileId);
    const profileSnap = await profileRef.get();

    let isOwner = false;
    let claimSecretToReturn: string | null = null;

    if (!profileSnap.exists) {
      const parentToken = studentData.parentToken || generateToken(24);
      const newClaimSecret = generateClaimSecret(24);
      const claimSecretHash = hashClaimSecret(newClaimSecret);

      const newProfile: Profile = {
        id: profileId,
        name: approvedStudentName,
        className: studentData.className || className || null,
        profileKey,
        parentToken,
        claimSecretHash,
        createdAt: now,
        lastActivityAt: now,
      };

      await profileRef.set(newProfile);
      isOwner = true;
      claimSecretToReturn = newClaimSecret;
    } else {
      const profileData = profileSnap.data() as Profile;
      if (incomingClaimSecret && verifyClaimSecret(incomingClaimSecret, profileData.claimSecretHash)) {
        isOwner = true;
      } else {
        isOwner = false;
      }
      await profileRef.update({ lastActivityAt: now }).catch(() => {});
    }

    // 8. Check oneAttemptPerName if enabled
    if (ex.oneAttemptPerName) {
      const dupQuery = await db
        .collection('submissions')
        .where('exerciseId', '==', params.id)
        .where('profileId', '==', profileId)
        .limit(1)
        .get();

      if (!dupQuery.empty) {
        return NextResponse.json(
          { error: 'You have already started or submitted this exercise.' },
          { status: 409 }
        );
      }

      // Fallback check on nameKey
      const nameDup = await db
        .collection('submissions')
        .where('exerciseId', '==', params.id)
        .where('nameKey', '==', nameKey)
        .limit(1)
        .get();

      if (!nameDup.empty) {
        return NextResponse.json(
          { error: 'This name has already started or submitted this exercise.' },
          { status: 409 }
        );
      }
    }

    // 9. Create submission and begin timed attempt
    const startedAt = now;
    const sub: Submission = {
      exerciseId: params.id,
      exerciseTitle: ex.title || 'Math Exercise',
      studentName: approvedStudentName,
      nameKey,
      grade: studentGrade,
      profileId,
      ...(studentId ? { studentId } : {}),
      status: 'started',
      startedAt,
    };
    const ref = await db.collection('submissions').add(sub);

    return NextResponse.json({
      attemptId: ref.id,
      startedAt,
      serverNow: Date.now(),
      timeLimitMinutes: ex.timeLimitMinutes || 0,
      profileId,
      isOwner,
      ...(claimSecretToReturn ? { claimSecret: claimSecretToReturn } : {}),
    });
  } catch (e) {
    console.error('Start error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

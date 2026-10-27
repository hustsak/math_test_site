import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebaseAdmin';
import { generateToken } from '@/lib/tokens';
import {
  normalizeStudentName,
  normalizeClassName,
  getStudentAccessId,
  getEndOfDayCambodia,
  formatCambodiaDate,
  addDaysToCambodiaDate,
  getTodayCambodiaDate,
} from '@/lib/studentAccess';
import {
  getProfileKey,
  getProfileId,
  generateClaimSecret,
  hashClaimSecret,
} from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const grade = Math.min(12, Math.max(7, parseInt(body?.grade, 10) || 7));
    const className = body?.className ? String(body.className).trim().slice(0, 40) : null;

    if (!name || name.length > 80) {
      return NextResponse.json(
        {
          error: 'សូមបញ្ចូលឈ្មោះសិស្ស (Student name is required, max 80 characters).',
          code: 'INVALID_NAME',
        },
        { status: 400 }
      );
    }

    const nameKey = normalizeStudentName(name);
    const classKey = normalizeClassName(className);

    if (!nameKey) {
      return NextResponse.json(
        {
          error: 'ឈ្មោះសិស្សមិនត្រឹមត្រូវ (Invalid student name provided).',
          code: 'INVALID_NAME',
        },
        { status: 400 }
      );
    }

    const db = adminDb();
    const docId = getStudentAccessId(nameKey, classKey);

    // Default expiration: 30 days from today in Cambodia time (Asia/Phnom_Penh)
    const expirationDate = addDaysToCambodiaDate(getTodayCambodiaDate(), 30);
    const expiresAtMs = getEndOfDayCambodia(expirationDate);
    const expiresAtTimestamp = admin.firestore.Timestamp.fromMillis(expiresAtMs);
    const nowTimestamp = admin.firestore.Timestamp.now();

    // Check if student already exists
    const studentRef = db.collection('students').doc(docId);
    const existingDoc = await studentRef.get();

    if (existingDoc.exists) {
      const existingData = existingDoc.data() || {};
      const studentToken = existingData.studentToken || generateToken(24);
      const parentToken = existingData.parentToken || generateToken(24);
      const currentPaymentStatus = existingData.paymentStatus || 'approved';

      // If already exists, keep current payment status or default to approved if previously active
      await studentRef.update({
        grade: grade || existingData.grade || 7,
        className: className || existingData.className || null,
        classKey: classKey || existingData.classKey || '',
        accessEnabled: true,
        active: true,
        studentToken,
        parentToken,
        updatedAt: nowTimestamp,
      });

      return NextResponse.json({
        success: true,
        isExisting: true,
        message: 'ឈ្មោះនេះមានរួចហើយ និងត្រូវបានបើកដំណើរការសម្រាប់ការចូលធ្វើលំហាត់។',
        student: {
          id: docId,
          name: existingData.name || name,
          grade: grade || existingData.grade || 7,
          className: className || existingData.className || null,
          expirationDate,
          paymentStatus: currentPaymentStatus,
          studentToken,
        },
        studentToken,
        parentToken,
      });
    }

    // New student record: default paymentStatus to 'pending'
    const studentToken = generateToken(24);
    let parentToken = generateToken(24);
    while (parentToken === studentToken) {
      parentToken = generateToken(24);
    }

    const newStudentData = {
      name,
      nameKey,
      grade,
      className,
      classKey,
      accessEnabled: true,
      active: true,
      paymentStatus: 'pending', // Pending payment approval from teacher
      paidAt: null,
      expiresAt: expiresAtTimestamp,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
      lastActivityAt: null,
      studentToken,
      parentToken,
    };

    await studentRef.set(newStudentData);

    // Also auto-provision matching parent tracking profile in `profiles` collection
    try {
      const profileKey = getProfileKey(name, className);
      const profileId = getProfileId(profileKey);
      const profileRef = db.collection('profiles').doc(profileId);
      const profSnap = await profileRef.get();

      if (!profSnap.exists) {
        const claimSecret = generateClaimSecret();
        const claimSecretHash = hashClaimSecret(claimSecret);
        await profileRef.set({
          name,
          className,
          profileKey,
          parentToken,
          claimSecretHash,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastActivityAt: null,
        });
      }
    } catch (e) {
      console.warn('Profile provisioning note:', e);
    }

    return NextResponse.json({
      success: true,
      isExisting: false,
      message: 'បានចុះឈ្មោះសិស្សថ្មីដោយជោគជ័យ! អ្នកអាចធ្វើលំហាត់សាកល្បង (Sample Test) បានភ្លាមៗ ហើយបន្ទាប់ពីលោកគ្រូអនុម័តការបង់ប្រាក់ អ្នកនឹងអាចធ្វើលំហាត់ទាំងអស់បាន។',
      student: {
        id: docId,
        name,
        grade,
        className,
        expirationDate,
        paymentStatus: 'pending',
        studentToken,
      },
      studentToken,
      parentToken,
    });
  } catch (err: any) {
    console.error('Student registration error:', err);
    return NextResponse.json(
      { error: err?.message || 'Server error during registration' },
      { status: 500 }
    );
  }
}

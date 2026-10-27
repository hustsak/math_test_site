import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { generateToken } from '@/lib/tokens';
import {
  normalizeStudentName,
  normalizeClassName,
  getStudentAccessId,
  getEndOfDayCambodia,
  formatCambodiaDate,
  getStudentStatus,
  addDaysToCambodiaDate,
  getTodayCambodiaDate,
  type StudentAccess,
} from '@/lib/studentAccess';
import {
  getProfileKey,
  getProfileId,
  generateClaimSecret,
  hashClaimSecret,
} from '@/lib/profiles';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const db = adminDb();
    const snap = await db.collection('students').get();
    const now = Date.now();

    const students: StudentAccess[] = snap.docs.map((d) => {
      const data = d.data();
      const name = data.name || '';
      const nameKey = data.nameKey || normalizeStudentName(name);
      const className = data.className || null;
      const classKey = data.classKey !== undefined ? data.classKey : normalizeClassName(className);

      // Access enabled resolution (fallback to legacy active)
      const accessEnabled = data.accessEnabled !== undefined ? !!data.accessEnabled : data.active !== false;

      // Expiration resolution
      let expiresAtMs = now + 30 * 24 * 60 * 60 * 1000;
      if (data.expiresAt) {
        if (typeof data.expiresAt.toMillis === 'function') {
          expiresAtMs = data.expiresAt.toMillis();
        } else if (typeof data.expiresAt === 'number') {
          expiresAtMs = data.expiresAt;
        } else if (data.expiresAt._seconds) {
          expiresAtMs = data.expiresAt._seconds * 1000;
        }
      }

      // Timestamps
      let createdAt = now;
      if (data.createdAt) {
        if (typeof data.createdAt.toMillis === 'function') {
          createdAt = data.createdAt.toMillis();
        } else if (typeof data.createdAt === 'number') {
          createdAt = data.createdAt;
        }
      }

      let updatedAt = createdAt;
      if (data.updatedAt) {
        if (typeof data.updatedAt.toMillis === 'function') {
          updatedAt = data.updatedAt.toMillis();
        } else if (typeof data.updatedAt === 'number') {
          updatedAt = data.updatedAt;
        }
      }

      let lastActivityAt: number | null = null;
      if (data.lastActivityAt) {
        if (typeof data.lastActivityAt.toMillis === 'function') {
          lastActivityAt = data.lastActivityAt.toMillis();
        } else if (typeof data.lastActivityAt === 'number') {
          lastActivityAt = data.lastActivityAt;
        }
      }

      const expirationDate = formatCambodiaDate(expiresAtMs);
      const paymentStatus = data.paymentStatus || 'approved';
      const status = getStudentStatus(accessEnabled, expiresAtMs, now, paymentStatus);
      const grade = typeof data.grade === 'number' ? data.grade : (parseInt(data.grade, 10) || 7);

      return {
        id: d.id,
        name,
        nameKey,
        grade,
        className,
        classKey,
        accessEnabled,
        paymentStatus,
        paidAt: data.paidAt || null,
        expiresAt: expiresAtMs,
        expirationDate,
        createdAt,
        updatedAt,
        lastActivityAt,
        status,
        studentToken: data.studentToken,
        parentToken: data.parentToken,
        active: accessEnabled,
      };
    });

    // Sort by updatedAt desc, then createdAt desc
    students.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

    return NextResponse.json({ students });
  } catch (e: any) {
    console.error('List students error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const grade = Math.min(12, Math.max(7, parseInt(body?.grade, 10) || 7));
    const className = body?.className ? String(body.className).trim().slice(0, 40) : null;
    let expirationDate = String(body?.expirationDate || '').trim();
    const accessEnabled = body?.accessEnabled !== false;

    if (!name || name.length > 80) {
      return NextResponse.json(
        { error: 'Student name is required and must be between 1 and 80 characters.' },
        { status: 400 }
      );
    }

    // Default expiration date: 30 days from today in Cambodia time if not provided
    if (!expirationDate) {
      expirationDate = addDaysToCambodiaDate(getTodayCambodiaDate(), 30);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) {
      return NextResponse.json(
        { error: 'Invalid expiration date format. Please use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    const nameKey = normalizeStudentName(name);
    const classKey = normalizeClassName(className);

    if (!nameKey) {
      return NextResponse.json(
        { error: 'Invalid student name provided.' },
        { status: 400 }
      );
    }

    const db = adminDb();
    const docId = getStudentAccessId(nameKey, classKey);

    // 1. Prevent duplicate approved student records with the same normalized name and class
    const existingDoc = await db.collection('students').doc(docId).get();
    if (existingDoc.exists) {
      return NextResponse.json(
        {
          error: `A student named "${name}" in class "${className || 'Default'}" already exists.`,
          code: 'DUPLICATE_STUDENT',
        },
        { status: 409 }
      );
    }

    // Secondary check across existing documents to guarantee uniqueness
    const dupQuery = await db
      .collection('students')
      .where('nameKey', '==', nameKey)
      .where('classKey', '==', classKey)
      .limit(1)
      .get();

    if (!dupQuery.empty) {
      return NextResponse.json(
        {
          error: `A student named "${name}" in class "${className || 'Default'}" already exists.`,
          code: 'DUPLICATE_STUDENT',
        },
        { status: 409 }
      );
    }

    // Check if the same name appears in another class to warn teacher
    let conflictWarning: string | null = null;
    const sameNameQuery = await db
      .collection('students')
      .where('nameKey', '==', nameKey)
      .limit(5)
      .get();

    if (!sameNameQuery.empty) {
      const otherClasses = sameNameQuery.docs
        .map((d) => d.data().className || 'None')
        .join(', ');
      conflictWarning = `Note: Student with the same name exists in class (${otherClasses}). Because students only enter their name, ensure distinct identification.`;
    }

    // Calculate exclusive expiration boundary in Cambodia time
    const expiresAtMs = getEndOfDayCambodia(expirationDate);
    const expiresAtTimestamp = admin.firestore.Timestamp.fromMillis(expiresAtMs);
    const nowTimestamp = admin.firestore.Timestamp.now();
    const nowMs = Date.now();

    // Generate tokens for backward compatibility and parent tracking
    let studentToken = generateToken(24);
    let parentToken = generateToken(24);
    while (parentToken === studentToken) {
      parentToken = generateToken(24);
    }

    const paymentStatus = body?.paymentStatus === 'pending' ? 'pending' : 'approved';
    const paidAt = paymentStatus === 'approved' ? nowMs : null;

    const newStudentData = {
      name,
      nameKey,
      grade,
      className,
      classKey,
      accessEnabled,
      active: accessEnabled,
      paymentStatus,
      paidAt,
      expiresAt: expiresAtTimestamp,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
      lastActivityAt: null,
      studentToken,
      parentToken,
    };

    await db.collection('students').doc(docId).set(newStudentData);

    // Also ensure automatic Profile exists so parent tracking link & QR code work immediately
    const profileKey = getProfileKey(name, className);
    const profileId = getProfileId(profileKey);
    const profileRef = db.collection('profiles').doc(profileId);
    const profileSnap = await profileRef.get();

    if (!profileSnap.exists) {
      const claimSecret = generateClaimSecret(24);
      const claimSecretHash = hashClaimSecret(claimSecret);
      const newProfile: Profile = {
        id: profileId,
        name,
        className: className || null,
        profileKey,
        parentToken,
        claimSecretHash,
        createdAt: nowMs,
        lastActivityAt: null,
      };
      await profileRef.set(newProfile);
    }

    const status = getStudentStatus(accessEnabled, expiresAtMs, nowMs, paymentStatus);

    const createdStudent: StudentAccess = {
      id: docId,
      name,
      nameKey,
      grade,
      className,
      classKey,
      accessEnabled,
      paymentStatus,
      paidAt,
      expiresAt: expiresAtMs,
      expirationDate,
      createdAt: nowMs,
      updatedAt: nowMs,
      lastActivityAt: null,
      status,
      studentToken,
      parentToken,
      active: accessEnabled,
    };

    return NextResponse.json({
      success: true,
      student: createdStudent,
      ...(conflictWarning ? { warning: conflictWarning } : {}),
    });
  } catch (e: any) {
    console.error('Create student error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  normalizeStudentName,
  normalizeClassName,
  getEndOfDayCambodia,
  formatCambodiaDate,
  getStudentStatus,
  addDaysToCambodiaDate,
  getTodayCambodiaDate,
  type StudentAccess,
} from '@/lib/studentAccess';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Missing student ID.' }, { status: 400 });
  }

  try {
    const db = adminDb();
    const docRef = db.collection('students').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Student record not found.' }, { status: 404 });
    }

    const currentData = snap.data() || {};
    const body = await req.json().catch(() => ({}));

    let updatedName = currentData.name;
    let updatedClassName = currentData.className;
    let nameKey = currentData.nameKey || normalizeStudentName(updatedName);
    let classKey = currentData.classKey !== undefined ? currentData.classKey : normalizeClassName(updatedClassName);

    if (body.name !== undefined) {
      const cleanName = String(body.name).trim();
      if (!cleanName || cleanName.length > 80) {
        return NextResponse.json({ error: 'Name must be between 1 and 80 characters.' }, { status: 400 });
      }
      updatedName = cleanName;
      nameKey = normalizeStudentName(cleanName);
    }

    if (body.className !== undefined) {
      updatedClassName = body.className ? String(body.className).trim().slice(0, 40) : null;
      classKey = normalizeClassName(updatedClassName);
    }

    // Check for collisions if identity changed
    if (body.name !== undefined || body.className !== undefined) {
      const dupQuery = await db
        .collection('students')
        .where('nameKey', '==', nameKey)
        .where('classKey', '==', classKey)
        .limit(2)
        .get();

      const hasDuplicate = dupQuery.docs.some((d) => d.id !== id);
      if (hasDuplicate) {
        return NextResponse.json(
          {
            error: `Another student named "${updatedName}" in class "${updatedClassName || 'Default'}" already exists.`,
            code: 'DUPLICATE_STUDENT',
          },
          { status: 409 }
        );
      }
    }

    // Expiration date update or extension
    let expiresAtMs: number;
    if (currentData.expiresAt?.toMillis) {
      expiresAtMs = currentData.expiresAt.toMillis();
    } else if (typeof currentData.expiresAt === 'number') {
      expiresAtMs = currentData.expiresAt;
    } else {
      expiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    }

    if (body.expirationDate) {
      const dateStr = String(body.expirationDate).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return NextResponse.json({ error: 'Invalid expiration date format (YYYY-MM-DD).' }, { status: 400 });
      }
      expiresAtMs = getEndOfDayCambodia(dateStr);
    } else if (typeof body.extensionDays === 'number' && body.extensionDays > 0) {
      // If currently expired, extend from today in Cambodia; otherwise extend from current expiration
      const now = Date.now();
      const baseDate = expiresAtMs > now ? formatCambodiaDate(expiresAtMs) : getTodayCambodiaDate(now);
      const newDateStr = addDaysToCambodiaDate(baseDate, body.extensionDays);
      expiresAtMs = getEndOfDayCambodia(newDateStr);
    }

    // Access enabled / disabled (Block or Activate)
    let accessEnabled = currentData.accessEnabled !== undefined ? currentData.accessEnabled : currentData.active !== false;
    if (body.accessEnabled !== undefined) {
      accessEnabled = !!body.accessEnabled;
    }

    let updatedGrades: number[] = Array.isArray(currentData.grades) && currentData.grades.length > 0
      ? currentData.grades.map((g: any) => parseInt(g, 10)).filter((g: number) => !isNaN(g) && g >= 7 && g <= 12)
      : [];

    let updatedGrade = typeof currentData.grade === 'number' ? currentData.grade : (parseInt(currentData.grade, 10) || 7);
    if (body.grades !== undefined && Array.isArray(body.grades) && body.grades.length > 0) {
      updatedGrades = Array.from(
        new Set(
          body.grades
            .map((g: any) => parseInt(g, 10))
            .filter((g: number) => !isNaN(g) && g >= 7 && g <= 12)
        )
      );
      if (updatedGrades.length > 0) {
        updatedGrade = updatedGrades[0];
      }
    } else if (body.grade !== undefined) {
      updatedGrade = Math.min(12, Math.max(7, parseInt(body.grade, 10) || 7));
      if (!updatedGrades.includes(updatedGrade)) {
        updatedGrades = [updatedGrade];
      }
    }

    if (updatedGrades.length === 0) {
      updatedGrades = [updatedGrade];
    }

    let paymentStatus = currentData.paymentStatus || 'approved';
    let paidAt = currentData.paidAt || null;
    if (body.paymentStatus !== undefined) {
      paymentStatus = body.paymentStatus === 'pending' ? 'pending' : 'approved';
      if (paymentStatus === 'approved' && !paidAt) {
        paidAt = Date.now();
      } else if (paymentStatus === 'pending') {
        paidAt = null;
      }
    }

    const nowTimestamp = admin.firestore.Timestamp.now();
    const expiresAtTimestamp = admin.firestore.Timestamp.fromMillis(expiresAtMs);

    const updatePayload: Record<string, any> = {
      name: updatedName,
      nameKey,
      grade: updatedGrade,
      grades: updatedGrades,
      className: updatedClassName,
      classKey,
      accessEnabled,
      active: accessEnabled,
      paymentStatus,
      paidAt,
      expiresAt: expiresAtTimestamp,
      updatedAt: nowTimestamp,
    };

    await docRef.update(updatePayload);

    const nowMs = Date.now();
    const expirationDate = formatCambodiaDate(expiresAtMs);
    const status = getStudentStatus(accessEnabled, expiresAtMs, nowMs, paymentStatus);

    const updatedStudent: StudentAccess = {
      id,
      name: updatedName,
      nameKey,
      grade: updatedGrade,
      grades: updatedGrades,
      className: updatedClassName,
      classKey,
      accessEnabled,
      paymentStatus,
      paidAt,
      expiresAt: expiresAtMs,
      expirationDate,
      createdAt: currentData.createdAt?.toMillis ? currentData.createdAt.toMillis() : (currentData.createdAt || nowMs),
      updatedAt: nowMs,
      lastActivityAt: currentData.lastActivityAt?.toMillis ? currentData.lastActivityAt.toMillis() : (currentData.lastActivityAt || null),
      status,
      studentToken: currentData.studentToken,
      parentToken: currentData.parentToken,
      active: accessEnabled,
    };

    return NextResponse.json({ success: true, student: updatedStudent });
  } catch (e: any) {
    console.error('Update student error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Missing student ID.' }, { status: 400 });
  }

  try {
    const db = adminDb();
    const docRef = db.collection('students').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Student record not found.' }, { status: 404 });
    }

    // Deleting a student only removes their access permission.
    // Historical exercise submissions and parent tracking data are strictly preserved.
    await docRef.delete();

    return NextResponse.json({ success: true, studentId: id });
  } catch (e: any) {
    console.error('Delete student error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

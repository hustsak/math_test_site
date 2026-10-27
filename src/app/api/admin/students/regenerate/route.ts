import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { generateToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const studentId = String(body?.studentId || '').trim();

    if (!studentId) {
      return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection('students').doc(studentId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    const currentData = snap.data();
    const target = body?.target || 'parent'; // 'parent' or 'student'

    if (target === 'student') {
      let newStudentToken = generateToken(24);
      while (newStudentToken === currentData?.parentToken) {
        newStudentToken = generateToken(24);
      }

      await docRef.update({
        studentToken: newStudentToken,
        updatedAt: Date.now(),
      });

      return NextResponse.json({
        success: true,
        studentId,
        studentToken: newStudentToken,
      });
    }

    let newParentToken = generateToken(24);
    // Ensure parentToken != studentToken
    while (newParentToken === currentData?.studentToken) {
      newParentToken = generateToken(24);
    }

    // Immediately updates Firestore, invalidating previous link
    await docRef.update({
      parentToken: newParentToken,
      updatedAt: Date.now(),
    });

    // Also sync to matching profile if exists
    try {
      const studentName = currentData?.name;
      if (studentName) {
        const { getProfileKey, getProfileId } = await import('@/lib/profiles');
        const pKey = getProfileKey(studentName, currentData?.className);
        const pId = getProfileId(pKey);
        await db.collection('profiles').doc(pId).set(
          {
            parentToken: newParentToken,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn('Could not sync regenerated parentToken to profile:', err);
    }

    return NextResponse.json({
      success: true,
      studentId,
      parentToken: newParentToken,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { generateToken } from '@/lib/tokens';
import { createInvite } from '@/lib/studentInvite';
import { firestoreInviteStore } from '@/lib/studentInviteStore';

export const dynamic = 'force-dynamic';

/**
 * Teacher only.
 *  { studentId }                  -> makes a one-time invite link for that student and locks their
 *                                    /s/<token> link to the devices that open an invite.
 *  { studentId, unlock: true }    -> removes the lock (the plain /s/<token> link works for anyone again).
 */
export async function POST(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const studentId = String(body?.studentId || '').trim();
    if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });

    const db = adminDb();
    const ref = db.collection('students').doc(studentId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });

    if (body?.unlock === true) {
      await ref.update({ linkLocked: false });
      return NextResponse.json({ success: true, studentId, linkLocked: false });
    }

    const data = snap.data() || {};
    let studentToken = typeof data.studentToken === 'string' ? data.studentToken : '';
    const update: Record<string, unknown> = { linkLocked: true };
    if (!studentToken) {
      studentToken = generateToken(24);
      while (studentToken === data.parentToken) studentToken = generateToken(24);
      update.studentToken = studentToken;
    }

    const { inviteToken, expiresAt } = await createInvite(firestoreInviteStore(db), studentId);
    await ref.update(update);

    return NextResponse.json({
      success: true,
      studentId,
      inviteToken,
      path: `/s/invite/${inviteToken}`,
      expiresAt,
      linkLocked: true,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

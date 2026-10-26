import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const studentId = String(body?.studentId || '').trim();
    const active = !!body?.active;

    if (!studentId) {
      return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });
    }

    const db = adminDb();
    await db.collection('students').doc(studentId).update({
      active,
      accessEnabled: active,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true, studentId, active });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

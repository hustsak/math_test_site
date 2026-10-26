import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import type { AppSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const db = adminDb();
    const snap = await db.collection('settings').doc('app').get();
    const data = (snap.exists ? snap.data() : {}) as AppSettings;

    return NextResponse.json({
      showClassAverageToParents: !!data.showClassAverageToParents,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const showClassAverageToParents = !!body?.showClassAverageToParents;

    const db = adminDb();
    await db.collection('settings').doc('app').set(
      {
        showClassAverageToParents,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      showClassAverageToParents,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

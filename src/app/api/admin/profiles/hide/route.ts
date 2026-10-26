import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { profileId, hidden } = await req.json().catch(() => ({}));
    if (!profileId || typeof profileId !== 'string') {
      return NextResponse.json({ error: 'Profile ID required.' }, { status: 400 });
    }

    const db = adminDb();
    await db.collection('profiles').doc(profileId).update({
      hidden: typeof hidden === 'boolean' ? hidden : true,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Toggle profile hide error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

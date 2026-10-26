import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { generateToken } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { profileId } = await req.json().catch(() => ({}));
    if (!profileId || typeof profileId !== 'string') {
      return NextResponse.json({ error: 'Profile ID required.' }, { status: 400 });
    }

    const db = adminDb();
    const profileRef = db.collection('profiles').doc(profileId);
    const snap = await profileRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    const newParentToken = generateToken(24);
    await profileRef.update({
      parentToken: newParentToken,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true, parentToken: newParentToken });
  } catch (err: any) {
    console.error('Regenerate profile parent token error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

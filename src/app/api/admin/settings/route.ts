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
      customGrades: Array.isArray(data.customGrades) && data.customGrades.length > 0
        ? data.customGrades
        : [7, 8, 9, 10, 11, 12],
      customClasses: Array.isArray(data.customClasses) ? data.customClasses : [],
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
    
    const updatePayload: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (typeof body.showClassAverageToParents === 'boolean') {
      updatePayload.showClassAverageToParents = body.showClassAverageToParents;
    }

    if (Array.isArray(body.customGrades)) {
      // Validate array of positive integers, deduplicate & sort
      const validGrades = Array.from(
        new Set<number>(
          body.customGrades
            .map((g: any) => parseInt(g, 10))
            .filter((g: number) => !isNaN(g) && g >= 1 && g <= 30)
        )
      ).sort((a: number, b: number) => a - b);
      updatePayload.customGrades = validGrades.length > 0 ? validGrades : [7, 8, 9, 10, 11, 12];
    }

    if (Array.isArray(body.customClasses)) {
      // Validate unique, trimmed non-empty strings
      const validClasses = Array.from(
        new Set(
          body.customClasses
            .map((c: any) => String(c || '').trim())
            .filter((c: string) => c.length > 0)
        )
      );
      updatePayload.customClasses = validClasses;
    }

    const db = adminDb();
    await db.collection('settings').doc('app').set(updatePayload, { merge: true });

    const snap = await db.collection('settings').doc('app').get();
    const data = (snap.exists ? snap.data() : {}) as AppSettings;

    return NextResponse.json({
      success: true,
      showClassAverageToParents: !!data.showClassAverageToParents,
      customGrades: Array.isArray(data.customGrades) && data.customGrades.length > 0
        ? data.customGrades
        : [7, 8, 9, 10, 11, 12],
      customClasses: Array.isArray(data.customClasses) ? data.customClasses : [],
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

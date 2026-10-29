import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import type { AppSettings } from '@/lib/types';
import { assignGradeCodes, findGradeCodeConflict, missingGradeCodes } from '@/lib/gradeLabels';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const db = adminDb();
    const snap = await db.collection('settings').doc('app').get();
    const data = (snap.exists ? snap.data() : {}) as AppSettings;
    const customGrades = Array.isArray(data.customGrades) && data.customGrades.length > 0
      ? data.customGrades
      : [7, 8, 9, 10, 11, 12];

    // A named class (e.g. វិញ្ញាសាពេទ្យ) needs its own grade number; hand one out once.
    let gradeCodes = data.gradeCodes || {};
    if (missingGradeCodes(customGrades, gradeCodes)) {
      gradeCodes = assignGradeCodes(customGrades, gradeCodes);
      await db.collection('settings').doc('app').set({ gradeCodes }, { merge: true });
    }

    return NextResponse.json({
      showClassAverageToParents: !!data.showClassAverageToParents,
      customGrades,
      gradeCodes,
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
      // Validate array of grades (can be numbers or text names, e.g. 7, 8, "Foundation", "12A")
      const seen = new Set<string>();
      const validGrades: (number | string)[] = [];
      for (const item of body.customGrades) {
        if (typeof item === 'number' && !isNaN(item) && item >= 1 && item <= 100) {
          const key = String(item);
          if (!seen.has(key)) {
            seen.add(key);
            validGrades.push(item);
          }
        } else if (typeof item === 'string') {
          const trimmed = item.trim();
          if (trimmed.length > 0 && trimmed.length <= 40) {
            const num = Number(trimmed);
            const val = !isNaN(num) && Number.isInteger(num) && num >= 1 && num <= 100 ? num : trimmed;
            const key = String(val).toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              validGrades.push(val);
            }
          }
        }
      }
      const finalGrades = validGrades.length > 0 ? validGrades : [7, 8, 9, 10, 11, 12];

      // Every named class keeps one permanent grade number; a numbered grade cannot reuse it.
      const currentSnap = await adminDb().collection('settings').doc('app').get();
      const currentCodes = ((currentSnap.exists ? currentSnap.data() : {}) as AppSettings).gradeCodes || {};
      const conflict = findGradeCodeConflict(finalGrades, currentCodes);
      if (conflict) {
        return NextResponse.json(
          { error: `Grade ${conflict.grade} is already used by the class "${conflict.name}". Please use another number.` },
          { status: 400 }
        );
      }
      updatePayload.customGrades = finalGrades;
      updatePayload.gradeCodes = assignGradeCodes(finalGrades, currentCodes);
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
      gradeCodes: data.gradeCodes || {},
      customClasses: Array.isArray(data.customClasses) ? data.customClasses : [],
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

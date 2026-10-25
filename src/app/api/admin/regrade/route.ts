import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { gradeQuestions } from '@/lib/gradeExercise';
import type { Exercise, Submission } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Re-grades every submitted attempt of an exercise against its CURRENT answer key.
export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const exerciseId = String(body?.exerciseId ?? '');
    if (!exerciseId) return NextResponse.json({ error: 'Missing exercise.' }, { status: 400 });

    const db = adminDb();
    const exSnap = await db.collection('exercises').doc(exerciseId).get();
    if (!exSnap.exists) return NextResponse.json({ error: 'Exercise not found.' }, { status: 404 });
    const ex = exSnap.data() as Exercise;

    const subs = await db.collection('submissions').where('exerciseId', '==', exerciseId).get();
    let updated = 0;
    let changed = 0;
    let batch = db.batch();
    let inBatch = 0;

    for (const doc of subs.docs) {
      const s = doc.data() as Submission;
      if (s.status !== 'submitted' || !s.details) continue;
      const answers: Record<string, string> = {};
      for (const d of s.details) answers[d.id] = d.raw ?? d.given;
      const { score, total, details } = gradeQuestions(ex.questions, answers);
      if (score !== s.score || total !== s.total) changed++;
      batch.update(doc.ref, { score, total, details });
      updated++;
      if (++inBatch === 400) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
    if (inBatch) await batch.commit();

    return NextResponse.json({ updated, changed });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

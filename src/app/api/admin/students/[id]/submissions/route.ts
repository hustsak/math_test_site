import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import type { Submission } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Missing student ID.' }, { status: 400 });
  }

  try {
    const db = adminDb();
    const studentDoc = await db.collection('students').doc(id).get();
    if (!studentDoc.exists) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    const studentData = studentDoc.data() || {};
    const nameKey = studentData.nameKey || '';

    // Query submissions by studentId
    const byIdSnap = await db
      .collection('submissions')
      .where('studentId', '==', id)
      .get();

    const subsMap = new Map<string, Submission & { id: string }>();

    byIdSnap.docs.forEach((d) => {
      subsMap.set(d.id, { id: d.id, ...(d.data() as Submission) });
    });

    // Also query by nameKey to capture earlier attempts
    if (nameKey) {
      const byNameSnap = await db
        .collection('submissions')
        .where('nameKey', '==', nameKey)
        .get();

      byNameSnap.docs.forEach((d) => {
        if (!subsMap.has(d.id)) {
          subsMap.set(d.id, { id: d.id, ...(d.data() as Submission) });
        }
      });
    }

    const submissions = Array.from(subsMap.values());
    submissions.sort((a, b) => (b.submittedAt || b.startedAt || 0) - (a.submittedAt || a.startedAt || 0));

    return NextResponse.json({
      student: {
        id,
        name: studentData.name,
        grade: studentData.grade || 7,
        className: studentData.className || null,
      },
      submissions,
    });
  } catch (e: any) {
    console.error('Fetch student submissions error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

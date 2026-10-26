import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { generateToken } from '@/lib/tokens';
import type { Student } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const db = adminDb();
    const snap = await db.collection('students').orderBy('createdAt', 'desc').get();
    const list: Student[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        className: data.className || '',
        studentToken: data.studentToken,
        parentToken: data.parentToken,
        active: data.active !== false,
        createdAt: data.createdAt || 0,
      };
    });

    return NextResponse.json({ students: list });
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
    const db = adminDb();
    const now = Date.now();

    // Support both single student creation and bulk creation
    const rawNames: string[] = Array.isArray(body?.names)
      ? body.names
      : typeof body?.name === 'string'
      ? [body.name]
      : [];

    const className = String(body?.className || '').trim();

    const cleanNames = rawNames
      .map((n) => String(n).trim())
      .filter((n) => n.length > 0 && n.length <= 80);

    if (cleanNames.length === 0) {
      return NextResponse.json(
        { error: 'Please provide at least one student name.' },
        { status: 400 }
      );
    }

    const createdStudents: Student[] = [];

    for (const name of cleanNames) {
      let studentToken = generateToken(24);
      let parentToken = generateToken(24);
      while (parentToken === studentToken) {
        parentToken = generateToken(24);
      }

      const docRef = await db.collection('students').add({
        name,
        className,
        studentToken,
        parentToken,
        active: true,
        createdAt: now,
      });

      createdStudents.push({
        id: docRef.id,
        name,
        className,
        studentToken,
        parentToken,
        active: true,
        createdAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      count: createdStudents.length,
      students: createdStudents,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

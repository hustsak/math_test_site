import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    adminDb(); // Ensure admin app is initialized
    const userRecord = await getAuth().createUser({
      email,
      password,
    });

    return NextResponse.json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
      },
    });
  } catch (e: any) {
    console.error('Error creating teacher account:', e);
    const code = e?.code || '';
    if (code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 });
    }
    if (code === 'auth/invalid-password') {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }
    if (code === 'auth/invalid-email') {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    return NextResponse.json({ error: e?.message || 'Failed to create teacher account.' }, { status: 500 });
  }
}

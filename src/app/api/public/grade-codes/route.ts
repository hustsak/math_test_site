import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

// Always read fresh from the server (then cached briefly by the CDN, see below)
export const dynamic = 'force-dynamic';

/**
 * Public and tiny: the class names and their grade numbers (e.g. { "វិញ្ញាសាពេទ្យ": 30 }), so
 * the student pages can show a class name without loading the whole Firestore client library.
 * This is the same information the public registration page already shows.
 */
export async function GET() {
  let gradeCodes: Record<string, number> = {};
  try {
    const snap = await adminDb().collection('settings').doc('app').get();
    const codes = snap.exists ? snap.data()?.gradeCodes : null;
    if (codes && typeof codes === 'object') gradeCodes = codes as Record<string, number>;
  } catch {
    // fall through with no names: the pages then show "ថ្នាក់ទី 7" style labels
  }
  return NextResponse.json(
    { gradeCodes },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=86400' } }
  );
}

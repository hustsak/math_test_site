import { getAuth } from 'firebase-admin/auth';
import { adminDb } from './firebaseAdmin';

/** True only if the request carries a valid Firebase ID token for the admin email. */
export async function requireAdmin(req: Request): Promise<boolean> {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return false;
  adminDb(); // make sure the Admin app is initialised
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const admin = (process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || '')
      .trim()
      .toLowerCase();
    return !!admin && decoded.email?.toLowerCase() === admin;
  } catch {
    return false;
  }
}

import { adminDb } from '@/lib/firebaseAdmin';
import { canAccessStudentLink } from '@/lib/studentInvite';
import { firestoreInviteStore } from '@/lib/studentInviteStore';

/** Thrown by fetchStudentPortalData when the link is locked and this browser has no session. */
export class StudentLinkLockedError extends Error {
  constructor() {
    super('Student link is locked to the device that opened it first.');
    this.name = 'StudentLinkLockedError';
  }
}

/** Bilingual message shown when a locked link is opened on another device. */
export const LINK_LOCKED_MESSAGE =
  'តំណនេះអាចប្រើបានតែលើឧបករណ៍ដែលបានបើកវាដំបូងប៉ុណ្ណោះ។ សូមសុំតំណថ្មីពីគ្រូបង្រៀនរបស់អ្នក។ / This link only works on the device that opened it first. Please ask your teacher for a new link.';

/**
 * Server-side gate for every route that accepts a student link token.
 * Unlocked students (the teacher never copied a new link) always pass, so links already sent
 * keep working. Locked students need the session cookie from their invite.
 */
export function studentLinkAllowed(args: {
  student: { linkLocked?: unknown } | null | undefined;
  studentId: string;
  studentToken: string;
  cookieHeader: string | null | undefined;
}): Promise<boolean> {
  return canAccessStudentLink(firestoreInviteStore(adminDb()), args);
}

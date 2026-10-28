import crypto from 'crypto';
import { normalize } from './grade';

export const CAMBODIA_TIMEZONE = 'Asia/Phnom_Penh';
export const CAMBODIA_OFFSET_HOURS = 7;
export const CAMBODIA_OFFSET_MS = 7 * 60 * 60 * 1000;
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Turns whatever Firestore gives us for a date into UTC milliseconds, or null.
 * Students are saved with a Firestore Timestamp (toMillis / _seconds), but older or
 * test data may hold a plain number, a Date or an ISO string.
 */
export function timestampToMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'object') {
    const v = value as { toMillis?: () => number; _seconds?: number; seconds?: number; _nanoseconds?: number; nanoseconds?: number };
    if (typeof v.toMillis === 'function') {
      const t = v.toMillis();
      return Number.isFinite(t) ? t : null;
    }
    const sec = typeof v._seconds === 'number' ? v._seconds : v.seconds;
    if (typeof sec === 'number' && Number.isFinite(sec)) {
      const ns = typeof v._nanoseconds === 'number' ? v._nanoseconds : (v.nanoseconds ?? 0);
      return sec * 1000 + Math.floor((Number(ns) || 0) / 1e6);
    }
  }
  return null;
}

/** Days of the week (0 = Sunday) on which a drip exercise can unlock: Monday to Friday. */
export const DRIP_SCHOOL_WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * When drip Day N unlocks for a student who registered at `registeredAtMs` (UTC ms).
 *
 * - Day 1 unlocks immediately, at the moment of registration.
 * - Every later day unlocks at 00:00 Cambodia time (Asia/Phnom_Penh) on the next school
 *   day (Monday to Friday), so students get 1 exercise per day, 5 days per week,
 *   and nothing new unlocks on Saturday or Sunday.
 *
 * Example: registered Wednesday -> Day 2 Thursday, Day 3 Friday, Day 4 Monday.
 * Registered on a weekend -> Day 1 right away, Day 2 on Monday.
 */
export function getDripUnlockMs(registeredAtMs: number, dripDay: number): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Never loop on a bad date (NaN would otherwise never reach a weekday).
  if (!Number.isFinite(registeredAtMs)) return registeredAtMs;
  const day = Math.min(Math.max(Math.floor(Number(dripDay)) || 1, 1), 1000);
  if (day <= 1) return registeredAtMs;

  // Midnight (Cambodia time) at the start of the registration day.
  let cursor = Math.floor((registeredAtMs + CAMBODIA_OFFSET_MS) / DAY_MS) * DAY_MS - CAMBODIA_OFFSET_MS;
  let remaining = day - 1;
  while (remaining > 0) {
    cursor += DAY_MS;
    const weekday = new Date(cursor + CAMBODIA_OFFSET_MS).getUTCDay();
    if (DRIP_SCHOOL_WEEKDAYS.includes(weekday)) remaining--;
  }
  return cursor;
}

export type StudentAccessStatus = 'active' | 'expiring_soon' | 'expired' | 'blocked' | 'pending_payment';

export interface StudentAccess {
  id: string;
  name: string;
  nameKey: string;
  grade: number; // Grade 7 to 12
  grades?: number[]; // Enrolled grades (e.g. [7, 8])
  className: string | null;
  classKey: string;
  accessEnabled: boolean;
  paymentStatus?: 'approved' | 'pending';
  paidAt?: number | null;
  expiresAt: number; // UTC ms of exclusive end-of-day boundary
  expirationDate: string; // "YYYY-MM-DD" in Asia/Phnom_Penh
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number | null;
  status: StudentAccessStatus;
  studentToken?: string;
  parentToken?: string;
  active?: boolean;
}

/**
 * Checks if an exercise is currently open and available for a student:
 * - Must be published (and not draft)
 * - If scheduledPublishAt is set, current time must be >= scheduledPublishAt (in Cambodia timezone)
 * - If deadline is set, current time must be <= deadline
 * - If gradeLevels is set on the exercise, it must include studentGrade (Grades 7-12)
 */
export function evaluateExerciseAvailability(
  ex: {
    published: boolean;
    publicationMode?: 'instant' | 'scheduled' | 'drip' | 'draft';
    scheduledPublishAt?: string | number | null;
    dripDay?: number | null;
    deadline?: string | null;
    gradeLevels?: number[];
  },
  studentGrade?: number,
  nowMs: number = Date.now(),
  studentCreatedAt?: unknown
): {
  available: boolean;
  upcoming: boolean;
  closed: boolean;
  reason?: string;
  dripUnlockMs?: number;
} {
  // Drafts and unpublished exercises are never visible to students
  if (!ex.published || ex.publicationMode === 'draft') {
    return { available: false, upcoming: false, closed: false, reason: 'Exercise is a draft or unpublished.' };
  }

  // Drip Mode Check: unlocks on Day N relative to student's own registration date
  if ((ex.publicationMode === 'drip' || (typeof ex.dripDay === 'number' && ex.dripDay > 0)) && typeof ex.dripDay === 'number' && ex.dripDay > 0) {
    const registeredAtMs = timestampToMs(studentCreatedAt);
    if (registeredAtMs) {
      // Day 1 unlocks immediately; later days unlock on the next school days (Mon-Fri, Cambodia time)
      const dripUnlockMs = getDripUnlockMs(registeredAtMs, ex.dripDay);

      if (nowMs < dripUnlockMs) {
        return {
          available: false,
          upcoming: true,
          closed: false,
          reason: `លំហាត់នេះនឹងដោះសោនៅថ្ងៃទី ${ex.dripDay} គិតពីថ្ងៃដែលអ្នកបានចុះឈ្មោះ។`,
          dripUnlockMs,
        };
      }
    }
  }

  // Grade matching: if exercise targets specific grades, student's grade must match
  if (studentGrade && Array.isArray(ex.gradeLevels) && ex.gradeLevels.length > 0) {
    if (!ex.gradeLevels.includes(studentGrade)) {
      return {
        available: false,
        upcoming: false,
        closed: false,
        reason: `This exercise is for Grade ${ex.gradeLevels.join(', ')}, but you are Grade ${studentGrade}.`,
      };
    }
  }

  // Scheduling check (Cambodia Asia/Phnom_Penh)
  if (ex.scheduledPublishAt) {
    const publishTimeMs =
      typeof ex.scheduledPublishAt === 'number'
        ? ex.scheduledPublishAt
        : new Date(ex.scheduledPublishAt).getTime();

    if (nowMs < publishTimeMs) {
      return {
        available: false,
        upcoming: true,
        closed: false,
        reason: 'This exercise is scheduled for a future release.',
      };
    }
  }

  // Deadline check
  if (ex.deadline) {
    const deadlineMs = new Date(ex.deadline).getTime();
    if (nowMs > deadlineMs) {
      return {
        available: false,
        upcoming: false,
        closed: true,
        reason: 'The deadline for this exercise has passed.',
      };
    }
  }

  return { available: true, upcoming: false, closed: false };
}

/**
 * Normalizes student name consistently for lookup and storage:
 * - Trims leading/trailing whitespace
 * - Converts to lower case
 * - Strips zero-width and invisible formatting characters (\u200B, \u200C, etc.)
 * - Preserves all meaningful Khmer letters, diacritics, subscripts, and vowels
 * - Strips all internal whitespace so "Sok Dara", "Sok   Dara", and "sokdara" match identically
 */
export function normalizeStudentName(name: string): string {
  const cleaned = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '');
  return normalize(cleaned);
}

/**
 * Normalizes optional class name (e.g. "7A", "7 a", "  7A  " -> "7a")
 */
export function normalizeClassName(className?: string | null): string {
  if (!className) return '';
  return String(className)
    .trim()
    .toLowerCase()
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Derives a deterministic document ID from normalized name and class.
 * Uses SHA-256 hex digest.
 */
export function getStudentAccessId(nameKey: string, classKey: string = ''): string {
  return crypto.createHash('sha256').update(`${nameKey}|${classKey}`).digest('hex');
}

/**
 * Calculates the exclusive expiration boundary as a UTC timestamp (ms)
 * representing the next local midnight in Asia/Phnom_Penh for a given calendar date "YYYY-MM-DD".
 *
 * For example:
 *   dateStr: "2026-10-26"
 *   Next day midnight in Cambodia: 2026-10-27T00:00:00+07:00
 *   In UTC: 2026-10-26T17:00:00.000Z
 *
 * Throughout October 26 in Cambodia, currentTime < boundary is true.
 * Starting October 27 at 00:00:00 in Cambodia, currentTime >= boundary is true (expired).
 */
export function getEndOfDayCambodia(dateStr: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!match) {
    throw new Error(`Invalid expiration date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // UTC timestamp for next local midnight in Cambodia (UTC+7)
  const nextDayUtcMidnight = Date.UTC(year, month - 1, day + 1, 0, 0, 0) - CAMBODIA_OFFSET_MS;
  return nextDayUtcMidnight;
}

/**
 * Formats an exclusive boundary timestamp back to the calendar date "YYYY-MM-DD" in Asia/Phnom_Penh.
 */
export function formatCambodiaDate(boundaryMs: number): string {
  // Subtract 1ms so we land on 23:59:59.999 of the calendar day
  const cambodiaMs = boundaryMs - 1 + CAMBODIA_OFFSET_MS;
  const d = new Date(cambodiaMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's date "YYYY-MM-DD" in Asia/Phnom_Penh.
 */
export function getTodayCambodiaDate(nowMs: number = Date.now()): string {
  const cambodiaMs = nowMs + CAMBODIA_OFFSET_MS;
  const d = new Date(cambodiaMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds N days to a Cambodia date string "YYYY-MM-DD" and returns the new "YYYY-MM-DD".
 */
export function addDaysToCambodiaDate(dateStr: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!match) return getTodayCambodiaDate();
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  const utcMs = Date.UTC(year, month - 1, day + days, 12, 0, 0);
  const d = new Date(utcMs);
  const resYear = d.getUTCFullYear();
  const resMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
  const resDay = String(d.getUTCDate()).padStart(2, '0');
  return `${resYear}-${resMonth}-${resDay}`;
}

/**
 * Evaluates the display access status:
 * - 'blocked': Access disabled by teacher (takes precedence)
 * - 'pending_payment': Student registered but payment has not been approved
 * - 'expired': Expiration boundary has passed
 * - 'expiring_soon': Enabled, paid, and expires within the next 7 days
 * - 'active': Enabled, paid, and expires more than 7 days away
 */
export function getStudentStatus(
  accessEnabled: boolean,
  expiresAtMs: number,
  nowMs: number = Date.now(),
  paymentStatus?: 'approved' | 'pending'
): StudentAccessStatus {
  if (!accessEnabled) {
    return 'blocked';
  }
  if (paymentStatus === 'pending') {
    return 'pending_payment';
  }
  if (nowMs >= expiresAtMs) {
    return 'expired';
  }
  if (expiresAtMs - nowMs <= SEVEN_DAYS_MS) {
    return 'expiring_soon';
  }
  return 'active';
}

/**
 * Core authorization check for starting an exercise:
 * accessEnabled === true && currentTime < expiresAt
 * If payment is pending, only sample exercises (isSample === true) can be started.
 */
export function isStudentAuthorized(
  accessEnabled: boolean,
  expiresAtMs: number,
  nowMs: number = Date.now(),
  paymentStatus?: 'approved' | 'pending',
  isExerciseSample?: boolean
): { authorized: boolean; reason?: 'blocked' | 'expired' | 'payment_required' } {
  if (!accessEnabled) {
    return { authorized: false, reason: 'blocked' };
  }
  if (nowMs >= expiresAtMs) {
    return { authorized: false, reason: 'expired' };
  }
  if (paymentStatus === 'pending' && !isExerciseSample) {
    return { authorized: false, reason: 'payment_required' };
  }
  return { authorized: true };
}

/**
 * Khmer-first student-facing error messages
 */
export const ACCESS_ERRORS = {
  NOT_APPROVED: {
    code: 'NOT_APPROVED',
    kh: 'ឈ្មោះរបស់អ្នកមិនទាន់ត្រូវបានអនុញ្ញាតទេ។ សូមទាក់ទងគ្រូរបស់អ្នក។',
    en: 'Your name has not been approved yet. Please contact your teacher.',
    message:
      'ឈ្មោះរបស់អ្នកមិនទាន់ត្រូវបានអនុញ្ញាតទេ។ សូមទាក់ទងគ្រូរបស់អ្នក។ (Your name has not been approved yet. Please contact your teacher.)',
  },
  PAYMENT_REQUIRED: {
    code: 'PAYMENT_REQUIRED',
    kh: 'ការទូទាត់ប្រាក់មិនទាន់ត្រូវបានអនុម័តទេ។ អ្នកអាចធ្វើបានតែលំហាត់សាកល្បង (Sample Exercise) ប៉ុណ្ណោះ។ សូមទាក់ទងលោកគ្រូដើម្បីអនុម័តការបង់ប្រាក់។',
    en: 'Payment has not been approved yet. You can only access sample test exercises. Please contact your teacher to approve payment.',
    message:
      'ការទូទាត់ប្រាក់មិនទាន់ត្រូវបានអនុម័តទេ។ អ្នកអាចធ្វើបានតែលំហាត់សាកល្បងប៉ុណ្ណោះ។ សូមទាក់ទងលោកគ្រូ។ (Payment approval required to access all exercises. Sample exercises available.)',
  },
  ACCESS_EXPIRED: {
    code: 'ACCESS_EXPIRED',
    kh: 'ការប្រើប្រាស់របស់អ្នកបានផុតកំណត់ហើយ។ សូមទាក់ទងគ្រូ ដើម្បីបន្តការប្រើប្រាស់។',
    en: 'Your access has expired. Please contact your teacher to renew it.',
    message:
      'ការប្រើប្រាស់របស់អ្នកបានផុតកំណត់ហើយ។ សូមទាក់ទងគ្រូ ដើម្បីបន្តការប្រើប្រាស់។ (Your access has expired. Please contact your teacher to renew it.)',
  },
  ACCESS_BLOCKED: {
    code: 'ACCESS_BLOCKED',
    kh: 'ការចូលប្រើរបស់អ្នកត្រូវបានផ្អាក។ សូមទាក់ទងគ្រូរបស់អ្នក។',
    en: 'Your access has been paused. Please contact your teacher.',
    message:
      'ការចូលប្រើរបស់អ្នកត្រូវបានផ្អាក។ សូមទាក់ទងគ្រូរបស់អ្នក។ (Your access has been paused. Please contact your teacher.)',
  },
  AMBIGUOUS_NAME: {
    code: 'AMBIGUOUS_NAME',
    kh: 'មានឈ្មោះដូចគ្នាច្រើនក្នុងថ្នាក់ផ្សេងគ្នា។ សូមទាក់ទងគ្រូរបស់អ្នកដើម្បីបញ្ជាក់ថ្នាក់។',
    en: 'Multiple student records match this name across different classes. Please contact your teacher.',
    message:
      'មានឈ្មោះដូចគ្នាច្រើនក្នុងថ្នាក់ផ្សេងគ្នា។ សូមទាក់ទងគ្រូរបស់អ្នកដើម្បីបញ្ជាក់ថ្នាក់។ (Multiple records found for this name. Please contact your teacher.)',
  },
};

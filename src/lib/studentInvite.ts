/**
 * Single-use student invite links.
 *
 * Problem: /s/<studentToken> is a bearer link. Whoever has the URL can open that student's
 * portal, so a student can forward it and the other person gets in too.
 *
 * How it works now:
 *  1. Each time the teacher clicks "Copy Link", the server makes a ONE-TIME invite token
 *     (/s/invite/<inviteToken>) and marks that student as `linkLocked`.
 *  2. The first browser that opens the invite uses it up. The server gives that browser a
 *     private session cookie and redirects to /s/<studentToken>, so the invite token disappears
 *     from the address bar.
 *  3. While a student is locked, /s/<studentToken> (and the APIs behind it) only work in a
 *     browser that holds a valid session cookie. If the student forwards the invite, it is
 *     already used. If they forward the address-bar URL, the other person has no cookie.
 *     Both give an error.
 *
 * Students the teacher has never copied a new link for are NOT locked, so every link that was
 * already sent keeps working until the teacher chooses to lock it.
 *
 * Only hashes (SHA-256) of invite tokens and session secrets are stored, never the secrets.
 * Pure logic: storage is injected (InviteStore), so it can be tested without Firebase.
 */
import crypto from 'node:crypto';
import { generateToken, isValidTokenFormat } from './tokens';

/** An unused invite stops working after this long (the teacher can copy a fresh one). */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Session cookie lifetime in seconds (400 days is the browser maximum). */
export const SESSION_MAX_AGE_S = 400 * 24 * 60 * 60;
/** Most devices that can be signed in per student at once; the oldest sessions are dropped. */
export const MAX_SESSIONS_PER_STUDENT = 10;

export interface InviteDoc {
  studentId: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

export interface SessionDoc {
  studentId: string;
  createdAt: number;
  inviteHash: string;
}

export type ClaimResult =
  | { status: 'ok'; studentId: string }
  | { status: 'invalid' }
  | { status: 'used'; studentId: string }
  | { status: 'expired'; studentId: string };

export interface InviteStore {
  putInvite(hash: string, doc: InviteDoc): Promise<void>;
  getInvite(hash: string): Promise<InviteDoc | null>;
  /**
   * ATOMIC: if the invite exists, is unused and not expired, mark it used and create the
   * session in the same step. Two people opening the same invite at once: exactly one wins.
   */
  claimInvite(inviteHash: string, sessionHash: string, now: number): Promise<ClaimResult>;
  getSession(hash: string): Promise<SessionDoc | null>;
  listSessions(studentId: string): Promise<{ hash: string; createdAt: number }[]>;
  deleteSessions(hashes: string[]): Promise<void>;
}

export const sha256Hex = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Cookie name for a student's session. Derived from the student's current link token, so
 * "Regenerate link" (new token) automatically cuts off every old session.
 */
export function sessionCookieName(studentToken: string): string {
  return 'ss_' + sha256Hex(studentToken).slice(0, 24);
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in out) continue; // first occurrence wins
    let value = part.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/**
 * Link-preview robots (Telegram, WhatsApp, Facebook, Slack...) fetch a link the moment it is
 * pasted into a chat. They must not use up a single-use invite before the student opens it.
 */
const PREVIEW_BOT = /bot\b|crawler|spider|facebookexternalhit|facebot|whatsapp|telegrambot|slack|discord|skypeuripreview|embedly|preview|linkedin|pinterest|vkshare|google-read-aloud|headlesschrome|lighthouse/i;
export function isPreviewBot(userAgent: string | null | undefined, method = 'GET'): boolean {
  if (method.toUpperCase() === 'HEAD') return true;
  if (!userAgent) return true; // real browsers always send a User-Agent
  return PREVIEW_BOT.test(userAgent);
}

/** Only students the teacher has locked need a session; everyone else keeps working as before. */
export function isLinkLocked(student: { linkLocked?: unknown } | null | undefined): boolean {
  return student?.linkLocked === true;
}

export async function createInvite(
  store: InviteStore,
  studentId: string,
  now: number = Date.now(),
): Promise<{ inviteToken: string; expiresAt: number }> {
  const inviteToken = generateToken(24);
  const expiresAt = now + INVITE_TTL_MS;
  await store.putInvite(sha256Hex(inviteToken), { studentId, createdAt: now, expiresAt, usedAt: null });
  return { inviteToken, expiresAt };
}

/** True if this browser's cookie holds a live session for exactly this student. */
export async function hasValidSession(
  store: InviteStore,
  args: { studentId: string; studentToken: string; cookieHeader: string | null | undefined },
): Promise<boolean> {
  if (!args.studentToken || !args.studentId) return false;
  const secret = parseCookies(args.cookieHeader)[sessionCookieName(args.studentToken)];
  if (!secret || !isValidTokenFormat(secret)) return false;
  const session = await store.getSession(sha256Hex(secret));
  return !!session && session.studentId === args.studentId;
}

/** The gate used by every route that accepts a student link token. */
export async function canAccessStudentLink(
  store: InviteStore,
  args: {
    student: { linkLocked?: unknown } | null | undefined;
    studentId: string;
    studentToken: string;
    cookieHeader: string | null | undefined;
  },
): Promise<boolean> {
  if (!isLinkLocked(args.student)) return true;
  return hasValidSession(store, args);
}

export type OpenInviteResult =
  | { action: 'redirect'; studentToken: string; setCookie?: { name: string; value: string; maxAge: number } }
  | { action: 'error'; reason: 'invalid' | 'used' | 'expired' };

/**
 * What happens when someone opens /s/invite/<inviteToken>.
 *  - already signed in on this browser (refresh / back button): just go to the portal
 *  - first valid open: use up the invite, create a session cookie, go to the portal
 *  - otherwise (forwarded, already used, expired, unknown): error
 */
export async function openInvite(
  store: InviteStore,
  args: {
    inviteToken: string;
    cookieHeader: string | null | undefined;
    /** Looks up the student's CURRENT link token; null if the student no longer exists. */
    getStudentToken: (studentId: string) => Promise<string | null>;
    now?: number;
  },
): Promise<OpenInviteResult> {
  const now = args.now ?? Date.now();
  if (!isValidTokenFormat(args.inviteToken)) return { action: 'error', reason: 'invalid' };

  const inviteHash = sha256Hex(args.inviteToken);
  const invite = await store.getInvite(inviteHash);
  if (!invite) return { action: 'error', reason: 'invalid' };

  const studentToken = await args.getStudentToken(invite.studentId);
  if (!studentToken) return { action: 'error', reason: 'invalid' };

  if (await hasValidSession(store, { studentId: invite.studentId, studentToken, cookieHeader: args.cookieHeader })) {
    return { action: 'redirect', studentToken };
  }

  const sessionSecret = generateToken(32);
  const claim = await store.claimInvite(inviteHash, sha256Hex(sessionSecret), now);
  if (claim.status !== 'ok') return { action: 'error', reason: claim.status };

  // Keep the number of signed-in devices per student bounded (drop the oldest).
  const sessions = await store.listSessions(invite.studentId);
  if (sessions.length > MAX_SESSIONS_PER_STUDENT) {
    const keep = sha256Hex(sessionSecret);
    const drop = sessions
      .filter((s) => s.hash !== keep)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, sessions.length - MAX_SESSIONS_PER_STUDENT)
      .map((s) => s.hash);
    if (drop.length) await store.deleteSessions(drop);
  }

  return {
    action: 'redirect',
    studentToken,
    setCookie: { name: sessionCookieName(studentToken), value: sessionSecret, maxAge: SESSION_MAX_AGE_S },
  };
}

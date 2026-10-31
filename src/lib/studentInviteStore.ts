/**
 * Firestore implementation of InviteStore (see studentInvite.ts).
 *
 * Collections `studentInvites` and `studentSessions` are written only by the server (Admin SDK).
 * firestore.rules denies every client read/write to them (the catch-all rule), so a browser can
 * never list or tamper with invites or sessions.
 *
 * `db` is passed in (not imported) so this file has no Firebase dependency and can be tested
 * against a small fake.
 */
import type { ClaimResult, InviteDoc, InviteStore, SessionDoc } from './studentInvite';

export function firestoreInviteStore(db: any): InviteStore {
  const invites = db.collection('studentInvites');
  const sessions = db.collection('studentSessions');

  return {
    async putInvite(hash, doc) {
      await invites.doc(hash).set(doc);
    },

    async getInvite(hash) {
      const snap = await invites.doc(hash).get();
      return snap.exists ? (snap.data() as InviteDoc) : null;
    },

    claimInvite(inviteHash, sessionHash, now): Promise<ClaimResult> {
      return db.runTransaction(async (tx: any): Promise<ClaimResult> => {
        const ref = invites.doc(inviteHash);
        const snap = await tx.get(ref);
        if (!snap.exists) return { status: 'invalid' };
        const invite = snap.data() as InviteDoc;
        if (invite.usedAt) return { status: 'used', studentId: invite.studentId };
        if (now > invite.expiresAt) return { status: 'expired', studentId: invite.studentId };
        tx.update(ref, { usedAt: now });
        const session: SessionDoc = { studentId: invite.studentId, createdAt: now, inviteHash };
        tx.set(sessions.doc(sessionHash), session);
        return { status: 'ok', studentId: invite.studentId };
      });
    },

    async getSession(hash) {
      const snap = await sessions.doc(hash).get();
      return snap.exists ? (snap.data() as SessionDoc) : null;
    },

    async listSessions(studentId) {
      // Single equality filter: no composite index needed (sorted by the caller).
      const snap = await sessions.where('studentId', '==', studentId).get();
      return snap.docs.map((d: any) => ({ hash: d.id as string, createdAt: Number(d.data().createdAt) || 0 }));
    },

    async deleteSessions(hashes) {
      if (!hashes.length) return;
      const batch = db.batch();
      for (const h of hashes) batch.delete(sessions.doc(h));
      await batch.commit();
    },
  };
}

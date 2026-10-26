import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalize } from '@/lib/grade';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { sourceProfileId, targetProfileId, newName, newClass } = body;

    if (!sourceProfileId || typeof sourceProfileId !== 'string') {
      return NextResponse.json({ error: 'sourceProfileId is required.' }, { status: 400 });
    }

    const db = adminDb();
    const sourceRef = db.collection('profiles').doc(sourceProfileId);
    const sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) {
      return NextResponse.json({ error: 'Source profile not found.' }, { status: 404 });
    }
    const source = sourceSnap.data() as Profile;

    // Case 1: Merge into an existing target profile
    if (targetProfileId && typeof targetProfileId === 'string' && targetProfileId !== sourceProfileId) {
      const targetRef = db.collection('profiles').doc(targetProfileId);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) {
        return NextResponse.json({ error: 'Target profile not found.' }, { status: 404 });
      }
      const target = targetSnap.data() as Profile;

      // Find all submissions associated with source profile
      const [byProfileSnap, byNameSnap] = await Promise.all([
        db.collection('submissions').where('profileId', '==', sourceProfileId).get(),
        source.profileKey
          ? db
              .collection('submissions')
              .where('nameKey', '==', source.profileKey.split('|')[0])
              .get()
          : null,
      ]);

      const subDocsMap = new Map();
      byProfileSnap.docs.forEach((d) => subDocsMap.set(d.id, d));
      if (byNameSnap) {
        byNameSnap.docs.forEach((d) => subDocsMap.set(d.id, d));
      }

      const batch = db.batch();
      const targetNameKey = target.profileKey ? target.profileKey.split('|')[0] : normalize(target.name);

      for (const [docId, subDoc] of subDocsMap.entries()) {
        batch.update(subDoc.ref, {
          profileId: target.id,
          studentName: target.name,
          nameKey: targetNameKey,
          updatedAt: Date.now(),
        });
      }

      // Delete the duplicate source profile
      batch.delete(sourceRef);

      await batch.commit();

      return NextResponse.json({
        success: true,
        action: 'merged',
        movedCount: subDocsMap.size,
      });
    }

    // Case 2: Rename profile
    if (newName && typeof newName === 'string' && newName.trim().length > 0) {
      const trimmedName = newName.trim();
      const trimmedClass = typeof newClass === 'string' ? newClass.trim() : source.className;
      const newNameKey = normalize(trimmedName);

      // Update submissions
      const subsSnap = await db
        .collection('submissions')
        .where('profileId', '==', sourceProfileId)
        .get();

      const batch = db.batch();
      subsSnap.docs.forEach((d) => {
        batch.update(d.ref, {
          studentName: trimmedName,
          nameKey: newNameKey,
          updatedAt: Date.now(),
        });
      });

      batch.update(sourceRef, {
        name: trimmedName,
        className: trimmedClass || null,
        updatedAt: Date.now(),
      });

      await batch.commit();

      return NextResponse.json({
        success: true,
        action: 'renamed',
        newName: trimmedName,
      });
    }

    return NextResponse.json({ error: 'Please provide targetProfileId or newName.' }, { status: 400 });
  } catch (err: any) {
    console.error('Merge profile error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

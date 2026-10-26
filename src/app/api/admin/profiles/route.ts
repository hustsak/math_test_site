import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { adminDb } from '@/lib/firebaseAdmin';
import type { Profile, Submission, ProfileWithStats } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = adminDb();
    const [profilesSnap, subsSnap] = await Promise.all([
      db.collection('profiles').orderBy('createdAt', 'desc').get(),
      db.collection('submissions').where('status', '==', 'submitted').get(),
    ]);

    const subs = subsSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Submission),
    }));

    // Group submissions by profileId and nameKey
    const subsByProfileId = new Map<string, Submission[]>();
    const subsByNameKey = new Map<string, Submission[]>();

    for (const sub of subs) {
      if (sub.profileId) {
        const list = subsByProfileId.get(sub.profileId) || [];
        list.push(sub);
        subsByProfileId.set(sub.profileId, list);
      }
      if (sub.nameKey) {
        const list = subsByNameKey.get(sub.nameKey) || [];
        list.push(sub);
        subsByNameKey.set(sub.nameKey, list);
      }
    }

    const profiles: ProfileWithStats[] = profilesSnap.docs.map((d) => {
      const p = { id: d.id, ...(d.data() as any) } as Profile;
      const rawNameKey = p.profileKey ? p.profileKey.split('|')[0] : '';

      // Combine submissions matching profileId or nameKey
      const profileSubsMap = new Map<string, Submission>();
      (subsByProfileId.get(p.id) || []).forEach((s) => profileSubsMap.set(s.exerciseId, s));
      if (rawNameKey) {
        (subsByNameKey.get(rawNameKey) || []).forEach((s) => {
          if (!profileSubsMap.has(s.exerciseId)) {
            profileSubsMap.set(s.exerciseId, s);
          }
        });
      }

      const childSubs = Array.from(profileSubsMap.values());
      const completedCount = childSubs.length;

      let averagePercent: number | null = null;
      const validScores = childSubs.filter(
        (s) => typeof s.score === 'number' && typeof s.total === 'number' && s.total > 0
      );
      if (validScores.length > 0) {
        const sumPct = validScores.reduce(
          (acc, s) => acc + Math.round(((s.score || 0) / (s.total || 1)) * 100),
          0
        );
        averagePercent = Math.round(sumPct / validScores.length);
      }

      // Determine latest activity timestamp
      let lastActivity = p.lastActivityAt || p.createdAt || null;
      for (const s of childSubs) {
        const ts = s.submittedAt || s.startedAt;
        if (ts && (!lastActivity || ts > lastActivity)) {
          lastActivity = ts;
        }
      }

      return {
        ...p,
        completedCount,
        averagePercent,
        lastActivity,
      };
    });

    return NextResponse.json({ profiles });
  } catch (err: any) {
    console.error('List profiles error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

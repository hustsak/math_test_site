import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { toText } from '@/lib/textValue';
import { studentLinkAllowed } from '@/lib/studentLinkAccess';
import type { Exercise, PublicExercise, Submission } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface CachedExercise {
  pub: PublicExercise;
  published: boolean;
  publicationMode?: string;
  scheduledPublishAt?: any;
  deadline?: string | null;
  expiresAt: number;
}

const publicExerciseCache = new Map<string, CachedExercise>();

function invalidateExerciseCache(id?: string) {
  if (id) publicExerciseCache.delete(id);
  else publicExerciseCache.clear();
}

// Public: returns the exercise WITHOUT answers or explanations.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const now = Date.now();
    let cached = publicExerciseCache.get(params.id);

    if (!cached || cached.expiresAt <= now) {
      const snap = await adminDb().collection('exercises').doc(params.id).get();
      if (!snap.exists) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
      const ex = snap.data() as Exercise;
      if (!ex.published || ex.publicationMode === 'draft') {
        return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
      }

      const pub: PublicExercise = {
        id: snap.id,
        title: ex.title,
        description: ex.description,
        chapter: ex.chapter,
        topic: ex.topic,
        timeLimitMinutes: ex.timeLimitMinutes || 0,
        deadline: ex.deadline,
        shuffleQuestions: !!ex.shuffleQuestions,
        gradeLevels: ex.gradeLevels,
        scheduledPublishAt: ex.scheduledPublishAt,
        isSample: !!ex.isSample,
        questions: ex.questions.map((q) => ({
          id: q.id,
          prompt: toText(q.prompt),
          kind: q.kind,
          // Choices are sent as plain text (a stored { id, text } object becomes its text).
          ...(q.kind === 'choice' ? { choices: (q.choices ?? []).map((c) => toText(c)) } : {}),
          points: q.points,
        })),
      };

      cached = {
        pub,
        published: !!ex.published,
        publicationMode: ex.publicationMode,
        scheduledPublishAt: ex.scheduledPublishAt,
        deadline: ex.deadline,
        expiresAt: now + 30000, // 30s in-memory cache
      };
      publicExerciseCache.set(params.id, cached);
    }

    if (cached.publicationMode === 'scheduled' && cached.scheduledPublishAt) {
      const pubMs = typeof cached.scheduledPublishAt === 'number' ? cached.scheduledPublishAt : new Date(cached.scheduledPublishAt).getTime();
      if (now < pubMs) {
        return NextResponse.json({ error: 'Exercise is scheduled for a future release.' }, { status: 403 });
      }
    }

    const closed = !!cached.deadline && now > new Date(cached.deadline).getTime();
    const pub = cached.pub;

    let submissionResult = null;
    let matchedStudentInfo: { name: string; className: string } | null = null;
    const urlObj = new URL(_req.url);
    const tokenQuery = (urlObj.searchParams.get('token') || '').trim();
    const studentNameQuery = (urlObj.searchParams.get('studentName') || '').trim();

    if (tokenQuery || studentNameQuery) {
      let matchedStudentId: string | null = null;
      let matchedNameKey = '';

      if (tokenQuery) {
        const studentSnap = await adminDb()
          .collection('students')
          .where('studentToken', '==', tokenQuery)
          .limit(1)
          .get();
        if (!studentSnap.empty) {
          const sData = studentSnap.docs[0].data();
          // A locked student's token only identifies them in the browser that opened their invite.
          const tokenOk = await studentLinkAllowed({
            student: sData,
            studentId: studentSnap.docs[0].id,
            studentToken: tokenQuery,
            cookieHeader: _req.headers.get('cookie'),
          });
          if (tokenOk) {
            matchedStudentId = studentSnap.docs[0].id;
            matchedNameKey = sData.nameKey || '';
            matchedStudentInfo = {
              name: sData.name || '',
              className: sData.className || '',
            };
          }
        }
      }

      if (!matchedNameKey && studentNameQuery) {
        matchedNameKey = studentNameQuery.toLowerCase().replace(/[^a-z0-9\u1780-\u17ff]/gi, '');
      }

      // Query submissions matching studentId or nameKey
      const queries = [];
      if (matchedStudentId) {
        queries.push(
          adminDb()
            .collection('submissions')
            .where('studentId', '==', matchedStudentId)
            .where('exerciseId', '==', params.id)
            .limit(10)
            .get()
        );
      }
      if (matchedNameKey) {
        queries.push(
          adminDb()
            .collection('submissions')
            .where('nameKey', '==', matchedNameKey)
            .where('exerciseId', '==', params.id)
            .limit(10)
            .get()
        );
      }

      const results = await Promise.all(queries);
      const allDocs = results.flatMap((r) => r.docs.map((d) => d.data() as Submission));
      const submittedDoc = allDocs.find((s) => s.status === 'submitted');

      if (submittedDoc) {
        submissionResult = {
          score: submittedDoc.score ?? 0,
          total: submittedDoc.total ?? 0,
          late: !!submittedDoc.late,
          details: submittedDoc.details || [],
          studentName: submittedDoc.studentName || '',
          className: (submittedDoc as any).className || '',
        };
      }
    }

    const response = NextResponse.json({
      exercise: pub,
      closed,
      serverNow: now,
      ...(matchedStudentInfo ? { student: matchedStudentInfo } : {}),
      ...(submissionResult ? { submission: submissionResult } : {}),
    });

    if (!tokenQuery && !studentNameQuery) {
      // Allow CDN / edge caching for public links (fastest mobile loading)
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    } else {
      response.headers.set('Cache-Control', 'private, no-cache');
    }
    return response;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

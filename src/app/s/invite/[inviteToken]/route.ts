import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isPreviewBot, openInvite } from '@/lib/studentInvite';
import { firestoreInviteStore } from '@/lib/studentInviteStore';

export const dynamic = 'force-dynamic';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

function page(status: number, titleKh: string, bodyKh: string, titleEn: string, bodyEn: string) {
  const html = `<!doctype html><html lang="km"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${titleEn}</title>
<style>body{font-family:system-ui,"Noto Sans Khmer",sans-serif;background:#f6f7f9;color:#1b2559;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:28px;max-width:520px;text-align:center;line-height:1.7}h1{font-size:1.3rem;margin:.2em 0}p{margin:.4em 0;color:#555}a{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:10px;background:#4a67d6;color:#fff;text-decoration:none;font-weight:700}</style></head>
<body><div class="c"><div style="font-size:2rem">🔒</div><h1>${titleKh}</h1><p>${bodyKh}</p><p>${bodyEn}</p><a href="/student">👉 ចូលតាមឈ្មោះសិស្ស (Login by Name)</a></div></body></html>`;
  return new NextResponse(html, { status, headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' } });
}

// Link-preview robots (Telegram, WhatsApp, Facebook...) fetch a link as soon as it is pasted into
// a chat. They get a harmless page and must NOT use up the single-use invite.
function previewPage() {
  return new NextResponse(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>កិច្ចការសិស្ស / Student Portal</title></head><body>Student link</body></html>',
    { status: 200, headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function HEAD() {
  // Explicit HEAD: Next would otherwise run GET (and use up the invite).
  return new NextResponse(null, { status: 200, headers: NO_STORE });
}

export async function GET(req: Request, { params }: { params: { inviteToken: string } }) {
  if (isPreviewBot(req.headers.get('user-agent'), 'GET')) return previewPage();

  if (!checkRateLimit(getClientIp(req))) {
    return page(429, 'សូមរង់ចាំបន្តិច', 'សំណើច្រើនពេក។ សូមព្យាយាមម្តងទៀតបន្តិចទៀត។', 'Please wait', 'Too many requests. Please try again shortly.');
  }

  try {
    const db = adminDb();
    const result = await openInvite(firestoreInviteStore(db), {
      inviteToken: (params?.inviteToken || '').trim(),
      cookieHeader: req.headers.get('cookie'),
      getStudentToken: async (studentId) => {
        const snap = await db.collection('students').doc(studentId).get();
        const token = snap.exists ? snap.data()?.studentToken : null;
        return typeof token === 'string' && token ? token : null;
      },
    });

    if (result.action === 'redirect') {
      // Relative redirect: the invite token is gone from the address bar, and it works behind any proxy/host.
      const res = new NextResponse(null, {
        status: 302,
        headers: { ...NO_STORE, Location: `/s/${encodeURIComponent(result.studentToken)}` },
      });
      if (result.setCookie) {
        const secure = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')) === 'https';
        res.cookies.set(result.setCookie.name, result.setCookie.value, {
          httpOnly: true,
          sameSite: 'lax',
          secure,
          path: '/',
          maxAge: result.setCookie.maxAge,
        });
      }
      return res;
    }

    if (result.reason === 'used') {
      return page(
        410,
        'តំណនេះត្រូវបានប្រើរួចហើយ',
        'តំណនេះអាចប្រើបានតែម្តងប៉ុណ្ណោះ ហើយត្រូវបានបើករួចហើយ។ សូមសុំតំណថ្មីពីគ្រូបង្រៀនរបស់អ្នក។',
        'This link was already used',
        'This link can only be used once and has already been opened. Please ask your teacher for a new link.'
      );
    }
    if (result.reason === 'expired') {
      return page(
        410,
        'តំណនេះផុតកំណត់ហើយ',
        'តំណនេះផុតកំណត់ហើយ។ សូមសុំតំណថ្មីពីគ្រូបង្រៀនរបស់អ្នក។',
        'This link has expired',
        'This link has expired. Please ask your teacher for a new link.'
      );
    }
    return page(
      404,
      'រកមិនឃើញតំណនេះទេ',
      'តំណនេះមិនត្រឹមត្រូវ។ សូមពិនិត្យតំណ ឬសុំតំណថ្មីពីគ្រូបង្រៀនរបស់អ្នក។',
      'Link not found',
      'This link is not valid. Please check it or ask your teacher for a new link.'
    );
  } catch (e) {
    console.error('student invite error:', e);
    return page(500, 'មានបញ្ហា', 'មានបញ្ហាម៉ាស៊ីនបម្រើ។ សូមព្យាយាមម្តងទៀត។', 'Server error', 'Something went wrong. Please try again.');
  }
}

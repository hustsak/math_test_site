import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { fetchStudentPortalData } from '@/lib/studentServer';
import { LINK_LOCKED_MESSAGE, StudentLinkLockedError } from '@/lib/studentLinkAccess';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        }
      );
    }

    const token = (params?.token || '').trim();
    if (!token) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let data;
    try {
      data = await fetchStudentPortalData(token, req.headers.get('cookie'));
    } catch (e) {
      if (e instanceof StudentLinkLockedError) {
        return NextResponse.json(
          { error: LINK_LOCKED_MESSAGE, code: 'LINK_LOCKED' },
          { status: 403, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'X-Robots-Tag': 'noindex, nofollow' } }
        );
      }
      throw e;
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Student link not found or inactive.' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        }
      );
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Server error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }
}

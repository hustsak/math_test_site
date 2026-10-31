import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { fetchParentViewData } from '@/lib/parentTrackingServer';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  // 1. Rate limiting: 60 requests per 10 minutes per IP
  const clientIp = getClientIp(req);
  const allowed = checkRateLimit(clientIp, 60, 10 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  const rawToken = params.token ? String(params.token).trim() : '';
  if (!rawToken || rawToken.length < 4) {
    return NextResponse.json({ error: 'Information not found' }, { status: 404 });
  }

  try {
    const parentData = await fetchParentViewData(rawToken, req.headers.get('cookie'));
    if (!parentData) {
      return NextResponse.json({ error: 'Information not found' }, { status: 404 });
    }

    const response = NextResponse.json(parentData);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return response;
  } catch (err: any) {
    console.error('Parent route error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

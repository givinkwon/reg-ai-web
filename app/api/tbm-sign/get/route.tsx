import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get('token') || '').trim();
  if (!token) {
    return NextResponse.json({ detail: 'token is required' }, { status: 400 });
  }

  // 같은 도메인에서 /riskassessment/* 가 FastAPI로 프록시된다면 origin 기반이 가장 안전함
  const origin = url.origin;
  const upstream = `${origin}/riskassessment/tbm-sign/init?token=${encodeURIComponent(token)}`;

  const r = await fetch(upstream, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const text = await r.text();
  const contentType = r.headers.get('content-type') || 'application/json';

  // FastAPI 에러를 그대로 전달
  return new NextResponse(text, {
    status: r.status,
    headers: { 'Content-Type': contentType },
  });
}

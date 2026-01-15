import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // 안전하게 node로

// const ORIGIN = process.env.FASTAPI_ORIGIN;
const ORIGIN = "http://35.76.230.177:8008"

function short(s: string, n = 400) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export async function GET(req: NextRequest) {
  try {
    if (!ORIGIN) {
      return NextResponse.json(
        { detail: 'FASTAPI_ORIGIN is not set' },
        { status: 500 }
      );
    }

    const token = (req.nextUrl.searchParams.get('token') || '').trim();
    if (!token) {
      return NextResponse.json({ detail: 'token is required' }, { status: 400 });
    }

    const url = new URL('/riskassessment/tbm-sign/init', ORIGIN);
    url.searchParams.set('token', token);

    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });

    const contentType = upstream.headers.get('content-type') || '';
    const raw = await upstream.text();

    // upstream이 JSON이 아니면(HTML 등) 사용자에게 JSON 형태로 감싸서 전달
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { detail: `Upstream returned non-JSON (${contentType || 'unknown'}): ${short(raw)}` },
        { status: upstream.status || 502 }
      );
    }

    // JSON 파싱
    const data = raw ? JSON.parse(raw) : null;
    return NextResponse.json(data, { status: upstream.status });
  } catch (e: any) {
    return NextResponse.json(
      { detail: e?.message || 'proxy error' },
      { status: 500 }
    );
  }
}

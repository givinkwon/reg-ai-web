import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FASTAPI_BASE = process.env.FASTAPI_BASE ?? 'http://35.76.230.177:8008';

function short(s: string, n = 220) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export async function GET(req: Request) {
  const rid = Math.random().toString(16).slice(2, 8);
  const started = Date.now();

  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint') ?? '';

  console.log(`[risk-proxy ${rid}] req.url=`, url.toString());

  if (!endpoint) {
    console.warn(`[risk-proxy ${rid}] missing endpoint`);
    return NextResponse.json({ error: 'Missing query param: endpoint' }, { status: 400 });
  }

  // endpoint 제거 후 나머지 쿼리만 upstream에 전달
  url.searchParams.delete('endpoint');

  const upstream = new URL(`/riskassessment/${endpoint}`, FASTAPI_BASE);
  url.searchParams.forEach((v, k) => upstream.searchParams.append(k, v));

  console.log(`[risk-proxy ${rid}] upstream=`, upstream.toString());

  try {
    const res = await fetch(upstream.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    const contentType = res.headers.get('content-type') ?? 'application/json';
    const body = await res.text();

    console.log(
      `[risk-proxy ${rid}] upstreamStatus=${res.status} ct=${contentType} elapsed=${Date.now() - started}ms bodyHead=${JSON.stringify(
        short(body),
      )}`,
    );

    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (e: any) {
    console.error(
      `[risk-proxy ${rid}] fetch failed elapsed=${Date.now() - started}ms err=${e?.message ?? String(e)}`,
    );

    return NextResponse.json(
      {
        error: 'fetch failed',
        reqUrl: url.toString(),
        upstream: upstream.toString(),
        message: e?.message ?? String(e),
      },
      { status: 502 },
    );
  }
}

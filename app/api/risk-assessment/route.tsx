// app/api/risk-assessment/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FASTAPI_BASE = process.env.FASTAPI_BASE ?? 'http://35.76.230.177:8008';

function short(s: string, n = 220) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ✅ endpoint 안전장치 (SSRF/경로 인젝션 방지)
function isValidEndpoint(endpoint: string) {
  return /^[a-z0-9-]+$/i.test(endpoint);
}

function buildUpstream(reqUrl: string) {
  const url = new URL(reqUrl);
  const endpoint = url.searchParams.get('endpoint') ?? '';

  if (!endpoint) return { error: 'Missing query param: endpoint' as const };
  if (!isValidEndpoint(endpoint)) return { error: 'Invalid endpoint' as const };

  url.searchParams.delete('endpoint');

  const upstream = new URL(`/riskassessment/${endpoint}`, FASTAPI_BASE);
  url.searchParams.forEach((v, k) => upstream.searchParams.append(k, v));

  return { upstream, endpoint };
}

function pickForwardHeaders(req: Request) {
  const h: Record<string, string> = {};
  const ct = req.headers.get('content-type');
  if (ct) h['content-type'] = ct;

  const accept = req.headers.get('accept');
  if (accept) h['accept'] = accept;

  return h;
}

function pickBackHeaders(res: Response) {
  const headers = new Headers();

  const ct = res.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  const cd = res.headers.get('content-disposition');
  if (cd) headers.set('content-disposition', cd);

  headers.set('cache-control', 'no-store');
  return headers;
}

export async function GET(req: Request) {
  const rid = Math.random().toString(16).slice(2, 8);
  const started = Date.now();

  const built = buildUpstream(req.url);
  if ('error' in built) {
    console.warn(`[risk-assessment ${rid}] ${built.error}`);
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const { upstream } = built;

  console.log(`[risk-assessment ${rid}] GET req.url=`, req.url);
  console.log(`[risk-assessment ${rid}] GET upstream=`, upstream.toString());

  try {
    const res = await fetch(upstream.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    const contentType = res.headers.get('content-type') ?? 'application/json';
    const body = await res.text();

    console.log(
      `[risk-assessment ${rid}] GET upstreamStatus=${res.status} ct=${contentType} elapsed=${Date.now() - started}ms bodyHead=${JSON.stringify(
        short(body),
      )}`,
    );

    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    console.error(
      `[risk-assessment ${rid}] GET fetch failed elapsed=${Date.now() - started}ms err=${e?.message ?? String(e)}`,
    );

    return NextResponse.json(
      { error: 'fetch failed', reqUrl: req.url, upstream: upstream.toString(), message: e?.message ?? String(e) },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const rid = Math.random().toString(16).slice(2, 8);
  const started = Date.now();

  const built = buildUpstream(req.url);
  if ('error' in built) {
    console.warn(`[risk-assessment ${rid}] ${built.error}`);
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const { upstream } = built;

  console.log(`[risk-assessment ${rid}] POST req.url=`, req.url);
  console.log(`[risk-assessment ${rid}] POST upstream=`, upstream.toString());

  try {
    const bodyBuf = await req.arrayBuffer();
    const fwdHeaders = pickForwardHeaders(req);

    const res = await fetch(upstream.toString(), {
      method: 'POST',
      cache: 'no-store',
      headers: fwdHeaders,
      body: bodyBuf,
    });

    const backHeaders = pickBackHeaders(res);

    console.log(
      `[risk-assessment ${rid}] POST upstreamStatus=${res.status} ct=${res.headers.get('content-type')} elapsed=${Date.now() - started}ms`,
    );

    return new NextResponse(res.body, {
      status: res.status,
      headers: backHeaders,
    });
  } catch (e: any) {
    console.error(
      `[risk-assessment ${rid}] POST fetch failed elapsed=${Date.now() - started}ms err=${e?.message ?? String(e)}`,
    );

    return NextResponse.json(
      { error: 'fetch failed', reqUrl: req.url, upstream: upstream.toString(), message: e?.message ?? String(e) },
      { status: 502 },
    );
  }
}

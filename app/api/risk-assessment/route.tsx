// app/api/risk-assessment/route.ts
import { NextResponse } from 'next/server';
import { withErrorHandling } from '../api-wrapper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FASTAPI_BASE = process.env.FASTAPI_BASE ?? 'http://35.76.230.177:8008';

function short(s: string, n = 220) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ✅ endpoint 안전장치 (SSRF/경로 인젝션 방지)
// - hyphen + underscore까지 허용 (필요시)
function isValidEndpoint(endpoint: string) {
  if (!endpoint) return false;
  if (endpoint.length > 80) return false;
  return /^[a-z0-9_-]+$/i.test(endpoint);
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

// ✅ FastAPI로 전달할 헤더 선택
function pickForwardHeaders(req: Request) {
  const h: Record<string, string> = {};

  const copyKeys = [
    'accept',
    'content-type',
    'authorization',
    'cookie',
    'x-api-key',
    'x-request-id',
    'x-forwarded-for',
    'user-agent',

    // ✅ 추가: 로그인 사용자 식별용(문서 저장/문서함)
    'x-user-email',
  ];

  for (const k of copyKeys) {
    const v = req.headers.get(k);
    if (v) h[k] = v;
  }

  if (!h['accept']) h['accept'] = 'application/json';
  return h;
}

function pickBackHeaders(res: Response) {
  const headers = new Headers();

  const ct = res.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  const cd = res.headers.get('content-disposition');
  if (cd) headers.set('content-disposition', cd);

  // ✅ 추가: TBM 등에서 내려주는 커스텀 헤더가 필요하면 전달
  const tbmId = res.headers.get('x-tbm-id');
  if (tbmId) headers.set('x-tbm-id', tbmId);

  headers.set('cache-control', 'no-store');
  return headers;
}

function isTextLike(contentType: string) {
  const ct = (contentType || '').toLowerCase();
  return (
    ct.includes('application/json') ||
    ct.startsWith('text/') ||
    ct.includes('application/xml') ||
    ct.includes('application/problem+json')
  );
}

function isJsonLike(contentType: string) {
  const ct = (contentType || '').toLowerCase();
  return ct.includes('application/json') || ct.includes('application/problem+json');
}

/**
 * ✅ 핵심: upstream이 어떤 endpoint에서는
 *   {"items":[...]} 를 주고,
 *   어떤 endpoint에서는 "{\"items\":[...]}" 처럼 "JSON 문자열"을 주는 경우가 있음.
 *
 * 프록시에서 1~2번 파싱해서 최종적으로 object/array로 정규화한다.
 */
function parseMaybeJsonTwice(raw: string) {
  let v: any = raw;

  for (let i = 0; i < 2; i++) {
    if (typeof v !== 'string') break;
    const s = v.trim();
    if (!s) break;

    const looksJson =
      (s.startsWith('{') && s.endsWith('}')) ||
      (s.startsWith('[') && s.endsWith(']')) ||
      (s.startsWith('"') && s.endsWith('"'));

    if (!looksJson) break;

    try {
      v = JSON.parse(s);
    } catch {
      break;
    }
  }

  return v;
}

function noStoreHeaders(extra?: Record<string, string>) {
  return { 'Cache-Control': 'no-store', ...(extra ?? {}) };
}

async function handleGET(req: Request) { 
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
    const fwdHeaders = pickForwardHeaders(req);

    const res = await fetch(upstream.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: fwdHeaders,
    });

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

    // ✅ JSON/Text 계열이면 텍스트로 읽어서 처리
    if (isTextLike(contentType)) {
      const body = await res.text();

      console.log(
        `[risk-assessment ${rid}] GET upstreamStatus=${res.status} ct=${contentType} elapsed=${
          Date.now() - started
        }ms bodyHead=${JSON.stringify(short(body))}`,
      );

      // ✅ JSON이면 "문자열 JSON"까지 풀어 object/array로 정규화해서 반환
      if (isJsonLike(contentType)) {
        const parsed = parseMaybeJsonTwice(body);

        // object/array면 그대로 json 응답
        if (typeof parsed === 'object' && parsed !== null) {
          return NextResponse.json(parsed, {
            status: res.status,
            headers: noStoreHeaders(),
          });
        }

        // JSON인데 object가 아니면(예: string/number/bool) 안전하게 감싸서 반환
        return NextResponse.json(
          { value: parsed },
          { status: res.status, headers: noStoreHeaders() },
        );
      }

      // ✅ JSON이 아닌 text/xml 등은 그대로 반환
      return new NextResponse(body, {
        status: res.status,
        headers: noStoreHeaders({ 'Content-Type': contentType }),
      });
    }

    // ✅ 바이너리는 스트리밍 반환
    console.log(
      `[risk-assessment ${rid}] GET upstreamStatus=${res.status} ct=${contentType} elapsed=${
        Date.now() - started
      }ms (stream)`,
    );

    return new NextResponse(res.body, {
      status: res.status,
      headers: pickBackHeaders(res),
    });
  } catch (e: any) {
    console.error(
      `[risk-assessment ${rid}] GET fetch failed elapsed=${Date.now() - started}ms err=${
        e?.message ?? String(e)
      }`,
    );

    return NextResponse.json(
      {
        error: 'fetch failed',
        reqUrl: req.url,
        upstream: upstream.toString(),
        message: e?.message ?? String(e),
      },
      { status: 502 },
    );
  }
}

export async function handlePOST(req: Request) {
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

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

    // ✅ JSON/Text 계열이면 텍스트로 읽어서 처리(특히 JSON 정규화)
    if (isTextLike(contentType)) {
      const body = await res.text();

      console.log(
        `[risk-assessment ${rid}] POST upstreamStatus=${res.status} ct=${contentType} elapsed=${
          Date.now() - started
        }ms bodyHead=${JSON.stringify(short(body))}`,
      );

      if (isJsonLike(contentType)) {
        const parsed = parseMaybeJsonTwice(body);

        if (typeof parsed === 'object' && parsed !== null) {
          return NextResponse.json(parsed, {
            status: res.status,
            headers: noStoreHeaders(),
          });
        }

        return NextResponse.json(
          { value: parsed },
          { status: res.status, headers: noStoreHeaders() },
        );
      }

      return new NextResponse(body, {
        status: res.status,
        headers: noStoreHeaders({ 'Content-Type': contentType }),
      });
    }

    // ✅ 바이너리는 기존처럼 스트리밍
    console.log(
      `[risk-assessment ${rid}] POST upstreamStatus=${res.status} ct=${contentType} elapsed=${
        Date.now() - started
      }ms (stream)`,
    );

    return new NextResponse(res.body, {
      status: res.status,
      headers: pickBackHeaders(res),
    });
  } catch (e: any) {
    console.error(
      `[risk-assessment ${rid}] POST fetch failed elapsed=${Date.now() - started}ms err=${
        e?.message ?? String(e)
      }`,
    );

    return NextResponse.json(
      {
        error: 'fetch failed',
        reqUrl: req.url,
        upstream: upstream.toString(),
        message: e?.message ?? String(e),
      },
      { status: 502 },
    );
  }
}

export const GET = withErrorHandling(handleGET);
export const POST = withErrorHandling(handlePOST);
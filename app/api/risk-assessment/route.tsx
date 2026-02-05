import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 환경 변수 또는 기본값 설정
const FASTAPI_BASE = process.env.FASTAPI_BASE ?? 'http://35.76.230.177:8008';

function short(s: string, n = 220) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ✅ endpoint 안전장치 (SSRF/경로 인젝션 방지)
function isValidEndpoint(endpoint: string) {
  if (!endpoint) return false;
  if (endpoint.length > 80) return false;
  return /^[a-z0-9_-]+$/i.test(endpoint);
}

// ✅ 헤더 복사 로직
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

// JSON 문자열 이중 파싱 방지/처리 로직
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

// =================================================================
// 🚀 GET 핸들러 (기존 로직 유지 - URL Query 사용)
// =================================================================
export async function GET(req: Request) {
  const rid = Math.random().toString(16).slice(2, 8);
  const start = Date.now();
  
  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ error: 'Missing query param: endpoint' }, { status: 400 });
  }
  if (!isValidEndpoint(endpoint)) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  }

  // Upstream URL 구성
  url.searchParams.delete('endpoint');
  const upstream = new URL(`/riskassessment/${endpoint}`, FASTAPI_BASE);
  url.searchParams.forEach((v, k) => upstream.searchParams.append(k, v));

  console.log(`[risk-assessment ${rid}] GET upstream=${upstream.toString()}`);

  try {
    const fwdHeaders = pickForwardHeaders(req);

    const res = await fetch(upstream.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: fwdHeaders,
    });

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

    // JSON/Text 응답 처리
    if (isTextLike(contentType)) {
      const body = await res.text();
      // console.log(`[risk-assessment ${rid}] GET status=${res.status} bodyHead=${short(body)}`);

      if (isJsonLike(contentType)) {
        const parsed = parseMaybeJsonTwice(body);
        if (typeof parsed === 'object' && parsed !== null) {
          return NextResponse.json(parsed, { status: res.status, headers: noStoreHeaders() });
        }
        return NextResponse.json({ value: parsed }, { status: res.status, headers: noStoreHeaders() });
      }
      return new NextResponse(body, { status: res.status, headers: noStoreHeaders({ 'Content-Type': contentType }) });
    }

    // Binary 스트리밍 응답
    return new NextResponse(res.body, { status: res.status, headers: pickBackHeaders(res) });

  } catch (e: any) {
    console.error(`[risk-assessment ${rid}] GET failed: ${e}`);
    return NextResponse.json({ error: 'fetch failed', message: String(e) }, { status: 502 });
  }
}

// =================================================================
// 🚀 POST 핸들러 (🔥 수정됨: URL 파라미터 및 Body 모두 지원)
// =================================================================
export async function POST(req: Request) {
  const rid = Math.random().toString(16).slice(2, 8);
  const start = Date.now();
  const url = new URL(req.url);

  // 1. URL 쿼리 파라미터에서 endpoint 확인 (기존 엑셀 다운로드 등)
  let endpoint = url.searchParams.get('endpoint');
  let isEndpointFromUrl = !!endpoint;

  let bodyText = "";
  let bodyJson: any = null;

  try {
    // Body를 한 번 읽어둠 (Next.js Request Body는 한 번만 읽을 수 있음)
    bodyText = await req.text();
    if (bodyText) {
      bodyJson = JSON.parse(bodyText);
    }
  } catch (e) {
    // Body가 JSON이 아니거나 비어있을 수 있음 (무시)
  }

  // 2. URL에 없다면 Body에서 endpoint 확인 (NLU 기능 등)
  if (!endpoint && bodyJson && bodyJson.endpoint) {
    endpoint = bodyJson.endpoint;
    isEndpointFromUrl = false;
  }

  // 3. 검증
  if (!endpoint) {
    console.warn(`[risk-assessment ${rid}] Missing endpoint in URL or Body`);
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  if (!isValidEndpoint(endpoint)) {
    console.warn(`[risk-assessment ${rid}] Invalid endpoint: ${endpoint}`);
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  }

  // 4. Upstream URL 및 Body 구성
  const upstream = new URL(`/riskassessment/${endpoint}`, FASTAPI_BASE);
  
  // URL 쿼리 파라미터 전달 (endpoint 제외)
  url.searchParams.delete('endpoint');
  url.searchParams.forEach((v, k) => upstream.searchParams.append(k, v));

  console.log(`[risk-assessment ${rid}] POST upstream=${upstream.toString()}`);

  // 전송할 Body 결정
  let upstreamBody: any;
  
  if (!isEndpointFromUrl && bodyJson) {
    // Body에서 endpoint를 꺼낸 경우 -> endpoint를 제외한 나머지를 전송
    const { endpoint: _, ...rest } = bodyJson;
    upstreamBody = JSON.stringify(rest);
  } else {
    // URL에서 endpoint를 꺼낸 경우 -> 원본 Body 그대로 전송
    upstreamBody = bodyText;
  }

  try {
    const fwdHeaders = pickForwardHeaders(req);
    // JSON Body를 재구성했을 경우 Content-Type 명시
    if (!isEndpointFromUrl) {
      fwdHeaders['content-type'] = 'application/json';
    }

    const res = await fetch(upstream.toString(), {
      method: 'POST',
      cache: 'no-store',
      headers: fwdHeaders,
      body: upstreamBody,
    });

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

    // JSON/Text 응답 처리
    if (isTextLike(contentType)) {
      const resText = await res.text();
      console.log(`[risk-assessment ${rid}] POST status=${res.status} bodyHead=${short(resText)}`);

      if (isJsonLike(contentType)) {
        const parsed = parseMaybeJsonTwice(resText);
        if (typeof parsed === 'object' && parsed !== null) {
          return NextResponse.json(parsed, { status: res.status, headers: noStoreHeaders() });
        }
        return NextResponse.json({ value: parsed }, { status: res.status, headers: noStoreHeaders() });
      }
      return new NextResponse(resText, { status: res.status, headers: noStoreHeaders({ 'Content-Type': contentType }) });
    }

    // Binary 스트리밍 응답 (엑셀 등)
    return new NextResponse(res.body, { status: res.status, headers: pickBackHeaders(res) });

  } catch (e: any) {
    console.error(`[risk-assessment ${rid}] POST failed: ${e}`);
    return NextResponse.json({ error: 'fetch failed', message: String(e) }, { status: 502 });
  }
}
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // 캐시로 꼬이는 거 방지(필요시 제거 가능)

const BASE = "http://35.76.230.177:8008"

function buildUrl(endpoint: string, searchParams: URLSearchParams) {
  if (!BASE) throw new Error('Missing env: RISK_API_BASE_URL');

  // FastAPI: /riskassessment/minors | /detail-tasks | /hazards ...
  const url = new URL(`${BASE.replace(/\/$/, '')}/riskassessment/${endpoint}`);

  // 쿼리 그대로 전달
  searchParams.forEach((v, k) => url.searchParams.set(k, v));
  return url.toString();
}

export async function GET(
  req: NextRequest,
  { params }: { params: { endpoint: string } },
) {
  try {
    const endpoint = params.endpoint;

    // 허용 endpoint 제한(보안/실수 방지)
    const allow = new Set(['minors', 'detail-tasks', 'hazards', 'categories', 'suggest-hazards']);
    if (!allow.has(endpoint)) {
      return NextResponse.json({ error: 'Unknown endpoint' }, { status: 404 });
    }

    const url = buildUrl(endpoint, req.nextUrl.searchParams);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    // FastAPI 에러 그대로 전달
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('[riskassessment proxy] error:', err);
    return NextResponse.json(
      { error: 'RiskAssessment API proxy failed', detail: String(err?.message || err) },
      { status: 500 },
    );
  }
}
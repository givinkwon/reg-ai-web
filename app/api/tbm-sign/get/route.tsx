import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type BackendInitResponse = {
  company: string;
  siteName: string;
  dateISO: string;
  attendeeName: string;

  workSummary: string;
  hazardSummary: string;
  complianceSummary: string;

  alreadySigned: boolean;
  expiresAt: string;
};

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get('token') || '').trim();
  if (!token) {
    return Response.json({ error: 'token is required' }, { status: 400 });
  }

  const base = (process.env.FASTAPI_BASE_URL || '').trim();
  if (!base) {
    return Response.json({ error: 'FASTAPI_BASE_URL is not set' }, { status: 500 });
  }

  const url = `${base.replace(/\/$/, '')}/riskassessment/tbm-sign/init?token=${encodeURIComponent(token)}`;

  const resp = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      // 필요하면 전달 (백엔드에서 로그에 도움이 됨)
      'User-Agent': req.headers.get('user-agent') || '',
    },
  });

  const contentType = resp.headers.get('content-type') || '';
  const raw = await resp.text();

  // FastAPI가 에러를 text/json으로 주든 그대로 넘기되,
  // 프론트가 HTML을 그대로 렌더링하지 않게 프록시에서 JSON 형태로 정리해줌
  if (!resp.ok) {
    return Response.json(
      {
        error: 'backend_error',
        status: resp.status,
        detail: raw.slice(0, 2000),
      },
      { status: resp.status }
    );
  }

  // 정상인데도 JSON이 아닐 수 있으면 방어
  let data: BackendInitResponse | null = null;
  try {
    data = contentType.includes('application/json') ? (JSON.parse(raw) as BackendInitResponse) : null;
  } catch {
    data = null;
  }

  if (!data) {
    return Response.json(
      { error: 'invalid_backend_response', detail: raw.slice(0, 2000) },
      { status: 502 }
    );
  }

  // 프론트에서 쓰기 좋은 형태로 살짝 정리해서 반환
  return Response.json({
    title: `TBM 서명`,
    company: data.company || '',
    siteName: data.siteName || '',
    dateISO: data.dateISO || '',
    attendeeName: data.attendeeName || '',
    workSummary: data.workSummary || '',
    hazardSummary: data.hazardSummary || '',
    complianceSummary: data.complianceSummary || '',
    alreadySigned: !!data.alreadySigned,
    expiresAt: data.expiresAt || '',
  });
}

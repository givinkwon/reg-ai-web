import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type FrontSubmitBody = {
  token?: string;
  signature?: string; // ✅ 권장
  signaturePngDataUrl?: string; // ✅ 혹시 이전 코드 호환
  attendeeName?: string;
};

export async function POST(req: NextRequest) {
  const base = (process.env.FASTAPI_BASE_URL || '').trim();
  if (!base) {
    return Response.json({ error: 'FASTAPI_BASE_URL is not set' }, { status: 500 });
  }

  let body: FrontSubmitBody;
  try {
    body = (await req.json()) as FrontSubmitBody;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const token = (body.token || '').trim();
  const signature = (body.signature || body.signaturePngDataUrl || '').trim();
  const attendeeName = (body.attendeeName || '').trim();

  if (!token) return Response.json({ error: 'token is required' }, { status: 400 });
  if (!signature) return Response.json({ error: 'signature is required' }, { status: 400 });

  const url = `${base.replace(/\/$/, '')}/riskassessment/tbm-sign/submit`;

  const resp = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': req.headers.get('user-agent') || '',
    },
    body: JSON.stringify({
      token,
      signature, // ✅ FastAPI가 요구하는 키
      ...(attendeeName ? { attendeeName } : {}),
    }),
  });

  const raw = await resp.text();
  const contentType = resp.headers.get('content-type') || '';

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

  // 성공 응답은 JSON으로 기대
  try {
    const json = contentType.includes('application/json') ? JSON.parse(raw) : { ok: true, raw };
    return Response.json(json);
  } catch {
    return Response.json({ ok: true });
  }
}

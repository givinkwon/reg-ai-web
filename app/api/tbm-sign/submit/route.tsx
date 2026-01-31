// app/api/tbm-sign/submit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '../../api-wrapper';

export const dynamic = 'force-dynamic';
// 필요하면 (Vercel Edge 말고 Node 런타임 강제)
// export const runtime = 'nodejs';

type FrontSubmitBody = {
  token?: string;
  signature?: string; // 신규 권장
  signaturePngDataUrl?: string; // 구버전 호환
  attendeeName?: string;
};

async function handlePOST(req: NextRequest) {
  const base = (process.env.FASTAPI_BASE_URL || 'http://35.76.230.177:8008').trim();
  if (!base) {
    return NextResponse.json({ error: 'FASTAPI_BASE_URL is not set' }, { status: 500 });
  }

  let body: FrontSubmitBody;
  try {
    body = (await req.json()) as FrontSubmitBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const token = (body.token || '').trim();
  const signature = (body.signature || body.signaturePngDataUrl || '').trim();
  const attendeeName = (body.attendeeName || '').trim();

  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
  if (!signature) return NextResponse.json({ error: 'signature is required' }, { status: 400 });

  const url = `${base.replace(/\/$/, '')}/riskassessment/tbm-sign/submit`;

  let resp: globalThis.Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': req.headers.get('user-agent') || '',
      },
      body: JSON.stringify({
        token,

        // ✅ 백엔드가 어떤 키를 요구하든 통과하게 둘 다 전송
        signaturePngDataUrl: signature,
        signature: signature,

        ...(attendeeName ? { attendeeName } : {}),
      }),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'fetch_failed', detail: String(e?.message || e) },
      { status: 502 }
    );
  }

  const raw = await resp.text();
  const contentType = resp.headers.get('content-type') || '';

  if (!resp.ok) {
    // 백엔드가 HTML/텍스트를 줘도 여기서 JSON으로 감싸서 프론트가 깨지지 않게
    return NextResponse.json(
      {
        error: 'backend_error',
        status: resp.status,
        detail: raw.slice(0, 2000),
      },
      { status: resp.status }
    );
  }

  // 성공이면 JSON을 기대하되, 혹시 텍스트면 그대로 감싸서 반환
  if (contentType.includes('application/json')) {
    try {
      return NextResponse.json(JSON.parse(raw));
    } catch {
      return NextResponse.json({ ok: true, raw });
    }
  }

  return NextResponse.json({ ok: true, raw });
}

export const POST = withErrorHandling(handlePOST);
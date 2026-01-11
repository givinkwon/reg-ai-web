import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

function backendBase() {
  // ✅ 너 프로젝트에 맞춰 하나로 정해줘
  // 예: http://35.76.230.177:8008
//   const base =
//     process.env.RISK_API_BASE_URL ||
//     process.env.BACKEND_BASE_URL ||
//     process.env.NEXT_PUBLIC_BACKEND_BASE_URL;
  const base = "http://35.76.230.177:8008"
  if (!base) throw new Error('BACKEND BASE URL is not set (RISK_API_BASE_URL)');
  return base.replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint');

  const userEmail = req.headers.get('x-user-email') || '';
  if (!userEmail) {
    return new Response('x-user-email header is required', { status: 401 });
  }

  const base = backendBase();

  if (endpoint === 'list') {
    const upstream = await fetch(`${base}/docs/list`, {
      method: 'GET',
      headers: {
        'x-user-email': userEmail,
      },
      cache: 'no-store',
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
    });
  }

  if (endpoint === 'download') {
    const id = url.searchParams.get('id');
    if (!id) return new Response('id is required', { status: 400 });

    const upstream = await fetch(`${base}/docs/${encodeURIComponent(id)}/download`, {
      method: 'GET',
      headers: {
        'x-user-email': userEmail,
      },
    });

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => '');
      return new Response(t || 'download failed', { status: upstream.status });
    }

    // content-disposition/ content-type 전달
    const headers = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    const cd = upstream.headers.get('content-disposition');
    if (cd) headers.set('content-disposition', cd);

    return new Response(upstream.body, { status: upstream.status, headers });
  }

  return new Response('Invalid endpoint', { status: 400 });
}

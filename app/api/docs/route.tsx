import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function backendBase() {
  // 가능하면 env로 고정 추천
  const base =
    process.env.RISK_API_BASE_URL ||
    process.env.BACKEND_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
    'http://35.76.230.177:8008';

  if (!base) throw new Error('BACKEND BASE URL is not set (RISK_API_BASE_URL)');
  return base.replace(/\/$/, '');
}

type DocListItem = {
  id: string;
  name?: string;
  kind?: string;
  meta?: any;
};

// docs/list에서 id 찾아서 kind/meta 가져오기 (백엔드에 별도 meta endpoint 없다는 전제)
async function fetchDocInfoById(base: string, userEmail: string, id: string): Promise<DocListItem | null> {
  const upstream = await fetch(`${base}/docs/list`, {
    method: 'GET',
    headers: { 'x-user-email': userEmail },
    cache: 'no-store',
  });

  if (!upstream.ok) return null;

  const data = await upstream.json().catch(() => null) as { items?: DocListItem[] } | null;
  const items = Array.isArray(data?.items) ? data!.items! : [];
  return items.find((x) => x?.id === id) ?? null;
}

function passThroughHeaders(upstream: Response) {
  const headers = new Headers();

  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  const cd = upstream.headers.get('content-disposition');
  if (cd) headers.set('content-disposition', cd);

  // 필요하면 추가 전달
  const cache = upstream.headers.get('cache-control');
  if (cache) headers.set('cache-control', cache);

  return headers;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint');

  const userEmail = req.headers.get('x-user-email') || '';
  if (!userEmail) {
    return new NextResponse('x-user-email header is required', { status: 401 });
  }

  const base = backendBase();

  // -------------------------
  // list
  // -------------------------
  if (endpoint === 'list') {
    const upstream = await fetch(`${base}/docs/list`, {
      method: 'GET',
      headers: { 'x-user-email': userEmail },
      cache: 'no-store',
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
    });
  }

  // -------------------------
  // download
  // -------------------------
  if (endpoint === 'download') {
    const id = url.searchParams.get('id');
    if (!id) return new NextResponse('id is required', { status: 400 });

    // 1) 문서 정보 조회해서 TBM 엑셀인지 판단
    const info = await fetchDocInfoById(base, userEmail, id);
    const kind = (info?.kind || '').trim();
    const meta = info?.meta || {};
    const tbmId = (meta?.tbm_id || meta?.tbmId || '').toString().trim();

    // 2) TBM 엑셀이면서 tbmId가 있으면 → 백엔드에 “재생성(서명반영)” 요청
    if (kind === 'tbm_excel' && tbmId) {
      const regen = await fetch(`${base}/riskassessment/tbm-export-excel`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-user-email': userEmail,
          'user-agent': req.headers.get('user-agent') || '',
        },
        cache: 'no-store',
        body: JSON.stringify({
          // ✅ 백엔드에서 이 tbmId를 받으면 “재생성 모드”로 분기되게 해둔 상태여야 함
          tbmId,
        }),
      });

      if (!regen.ok || !regen.body) {
        const t = await regen.text().catch(() => '');
        return new NextResponse(t || 'tbm regen failed', { status: regen.status });
      }

      const headers = passThroughHeaders(regen);
      // 디버그용 표시(원하면 제거)
      headers.set('x-doc-download-mode', 'tbm_regen_with_signatures');

      return new NextResponse(regen.body, { status: regen.status, headers });
    }

    // 3) 그 외는 기존 docs download 그대로
    const upstream = await fetch(`${base}/docs/${encodeURIComponent(id)}/download`, {
      method: 'GET',
      headers: { 'x-user-email': userEmail },
      cache: 'no-store',
    });

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => '');
      return new NextResponse(t || 'download failed', { status: upstream.status });
    }

    const headers = passThroughHeaders(upstream);
    headers.set('x-doc-download-mode', 'docs_vault_raw');

    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }

  return new NextResponse('Invalid endpoint', { status: 400 });
}

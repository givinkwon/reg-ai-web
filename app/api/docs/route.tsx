import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function backendBase() {
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

async function fetchDocInfoById(base: string, userEmail: string, id: string): Promise<DocListItem | null> {
  // ✅ 혹시 많아져서 200개 넘어가면 못 찾는 케이스를 방어(최대 2000개 정도까지 스캔)
  const LIMIT = 200;
  for (let skip = 0; skip <= 1800; skip += LIMIT) {
    const upstream = await fetch(`${base}/docs/list?limit=${LIMIT}&skip=${skip}`, {
      method: 'GET',
      headers: { 'x-user-email': userEmail },
      cache: 'no-store',
    });
    if (!upstream.ok) return null;

    const data = (await upstream.json().catch(() => null)) as { items?: any[] } | null;
    const items = Array.isArray(data?.items) ? data!.items! : [];

    const found = items.find((x) => (x?.id ?? x?._id) === id);
    if (found) return found as DocListItem;

    if (items.length < LIMIT) break; // 더 이상 페이지 없음
  }
  return null;
}

function passThroughHeaders(upstream: Response) {
  const headers = new Headers();

  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  const cd = upstream.headers.get('content-disposition');
  if (cd) headers.set('content-disposition', cd);

  const cache = upstream.headers.get('cache-control');
  if (cache) headers.set('cache-control', cache);

  return headers;
}

function looksLikeTbm(kind?: string, name?: string) {
  const k = (kind || '').toLowerCase();
  const n = (name || '').toLowerCase();

  if (k.includes('tbm')) return true; // tbm, tbm_excel, TBM 등 전부 허용
  if (n.includes('tbm') || n.includes('활동일지')) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint');

  const userEmail = req.headers.get('x-user-email') || '';
  if (!userEmail) return new NextResponse('x-user-email header is required', { status: 401 });

  const base = backendBase();

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

  if (endpoint === 'download') {
    const id = url.searchParams.get('id');
    if (!id) return new NextResponse('id is required', { status: 400 });

    // ✅ 0) DocsVault가 query로 준 값이 있으면 그걸 최우선으로 사용
    const qKind = (url.searchParams.get('kind') || '').trim();
    const qTbmId = (url.searchParams.get('tbmId') || '').trim();
    const qName = (url.searchParams.get('name') || '').trim();

    let kind = qKind;
    let tbmId = qTbmId;
    let name = qName;

    // ✅ 1) query에 없으면 기존 방식대로 list에서 찾아보기(백업)
    if (!kind || !tbmId) {
      const info = await fetchDocInfoById(base, userEmail, id);
      const meta = info?.meta || {};
      kind = (kind || info?.kind || meta?.kind || '').toString().trim();
      name = (name || info?.name || '').toString().trim();
      tbmId = (tbmId || meta?.tbm_id || meta?.tbmId || meta?.tbmID || info?.meta?.tbm_id || '').toString().trim();
    }

    // ✅ 2) TBM로 보이고 tbmId가 있으면 → 재생성 호출
    if (looksLikeTbm(kind, name) && tbmId) {
      const regen = await fetch(`${base}/riskassessment/tbm-export-excel`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-user-email': userEmail,
          'user-agent': req.headers.get('user-agent') || '',
        },
        cache: 'no-store',
        body: JSON.stringify({ tbmId }),
      });

      if (!regen.ok || !regen.body) {
        const t = await regen.text().catch(() => '');
        return new NextResponse(t || 'tbm regen failed', { status: regen.status });
      }

      const headers = passThroughHeaders(regen);
      headers.set('x-doc-download-mode', 'tbm_regen_with_signatures');
      return new NextResponse(regen.body, { status: regen.status, headers });
    }

    // ✅ 3) 아니면 기존 파일 그대로 다운로드
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

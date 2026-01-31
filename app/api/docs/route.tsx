// app/api/docs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '../api-wrapper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function backendBase() {
  const base =
    process.env.RISK_API_BASE_URL ||
    process.env.BACKEND_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
    'http://35.76.230.177:8008';
  return base.replace(/\/$/, '');
}

function rid() {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
}

function maskEmail(email: string) {
  return email ? email.replace(/(.{2}).+(@.+)/, '$1***$2') : 'NONE';
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

// ✅ 헤더 값은 ByteString(사실상 ASCII)만 안전.
//    한글 같은 유니코드는 encodeURIComponent로 ASCII로 바꿔서 넣는다.
function toAsciiHeaderValue(v: string, maxLen = 600) {
  const s = (v || '').toString();
  const enc = encodeURIComponent(s); // 전부 ASCII로 변환됨
  return enc.length > maxLen ? enc.slice(0, maxLen) : enc;
}

function setDebugHeader(headers: Headers, key: string, value?: string) {
  if (!value) return;
  try {
    headers.set(key, value);
  } catch (e) {
    // 유니코드 때문에 터지면 인코딩해서 재시도
    try {
      headers.set(key, toAsciiHeaderValue(value));
    } catch {
      // 그래도 안 되면 아예 생략
    }
  }
}

async function safeReadText(resp: Response) {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

async function handleGET(req: NextRequest) {
  const _rid = rid();
  const t0 = Date.now();

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint') || '';

    const userEmail = req.headers.get('x-user-email') || '';
    const ua = req.headers.get('user-agent') || '';

    console.log(
      `[api/docs][${_rid}] IN endpoint=${endpoint} path=${url.pathname + url.search} user=${maskEmail(
        userEmail
      )}`
    );

    if (!userEmail) {
      return new NextResponse('x-user-email header is required', { status: 401 });
    }

    const base = backendBase();
    console.log(`[api/docs][${_rid}] base=${base}`);

    // -------------------------
    // list
    // -------------------------
    if (endpoint === 'list') {
      const upstreamUrl = `${base}/docs/list`;
      console.log(`[api/docs][${_rid}] -> upstream(list) ${upstreamUrl}`);

      const upstream = await fetch(upstreamUrl, {
        method: 'GET',
        headers: { 'x-user-email': userEmail },
        cache: 'no-store',
      });

      const text = await safeReadText(upstream);
      console.log(
        `[api/docs][${_rid}] <- upstream(list) status=${upstream.status} ct=${upstream.headers.get(
          'content-type'
        )} bytes=${text.length}`
      );

      const outHeaders = new Headers();
      outHeaders.set('content-type', upstream.headers.get('content-type') || 'application/json');
      setDebugHeader(outHeaders, 'x-debug-rid', _rid);
      setDebugHeader(outHeaders, 'x-debug-endpoint', 'list');
      setDebugHeader(outHeaders, 'x-debug-ms', String(Date.now() - t0));

      return new NextResponse(text, { status: upstream.status, headers: outHeaders });
    }

    // -------------------------
    // download
    // -------------------------
    if (endpoint === 'download') {
      const id = (url.searchParams.get('id') || '').trim();
      if (!id) return new NextResponse('id is required', { status: 400 });

      const qKind = (url.searchParams.get('kind') || '').trim();   // tbm_excel
      const qName = (url.searchParams.get('name') || '').trim();   // ✅ 여기 한글일 수 있음
      const qTbmId = (url.searchParams.get('tbmId') || '').trim();

      console.log(
        `[api/docs][${_rid}] download params id=${id} kind=${qKind || 'NONE'} tbmId=${
          qTbmId || 'NONE'
        } name=${qName ? qName : 'NONE'}`
      );

      // ✅ tbmId가 오면 regen 호출
      if (qTbmId) {
        const regenUrl = `${base}/riskassessment/tbm-export-excel`;
        console.log(`[api/docs][${_rid}] -> upstream(regen) ${regenUrl} tbmId=${qTbmId}`);

        let regen: Response | null = null;
        try {
          regen = await fetch(regenUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: '*/*',
              'x-user-email': userEmail,
              'user-agent': ua,
            },
            cache: 'no-store',
            body: JSON.stringify({ tbmId: qTbmId }),
          });
        } catch (e: any) {
          console.log(`[api/docs][${_rid}] !! fetch(regen) threw: ${e?.message || e}`);
          regen = null;
        }

        if (regen) {
          console.log(
            `[api/docs][${_rid}] <- upstream(regen) status=${regen.status} ct=${regen.headers.get(
              'content-type'
            )} cd=${regen.headers.get('content-disposition')}`
          );

          if (regen.ok && regen.body) {
            const headers = passThroughHeaders(regen);

            // ✅ 디버그 헤더는 모두 ASCII-safe로 설정
            setDebugHeader(headers, 'x-debug-rid', _rid);
            setDebugHeader(headers, 'x-doc-download-mode', 'tbm_regen_with_signatures');
            setDebugHeader(headers, 'x-doc-debug-kind', qKind);
            setDebugHeader(headers, 'x-doc-debug-name', qName);  // ✅ 내부에서 인코딩 처리됨
            setDebugHeader(headers, 'x-doc-debug-tbmId', qTbmId);
            setDebugHeader(headers, 'x-debug-ms', String(Date.now() - t0));

            return new NextResponse(regen.body, { status: regen.status, headers });
          }

          const errText = await safeReadText(regen);
          console.log(`[api/docs][${_rid}] regen not ok. body(head)=${errText.slice(0, 500)}`);

          const errHeaders = new Headers();
          setDebugHeader(errHeaders, 'x-debug-rid', _rid);
          setDebugHeader(errHeaders, 'x-doc-download-mode', 'tbm_regen_failed');
          setDebugHeader(errHeaders, 'x-doc-debug-kind', qKind);
          setDebugHeader(errHeaders, 'x-doc-debug-name', qName);
          setDebugHeader(errHeaders, 'x-doc-debug-tbmId', qTbmId);
          setDebugHeader(errHeaders, 'x-debug-ms', String(Date.now() - t0));

          return new NextResponse(errText || 'tbm regen failed', { status: regen.status, headers: errHeaders });
        }

        console.log(`[api/docs][${_rid}] regen fetch failed -> fallback raw`);
      }

      // ✅ raw download
      const upstreamUrl = `${base}/docs/${encodeURIComponent(id)}/download`;
      console.log(`[api/docs][${_rid}] -> upstream(raw-download) ${upstreamUrl}`);

      const upstream = await fetch(upstreamUrl, {
        method: 'GET',
        headers: { 'x-user-email': userEmail },
        cache: 'no-store',
      });

      console.log(
        `[api/docs][${_rid}] <- upstream(raw-download) status=${upstream.status} ct=${upstream.headers.get(
          'content-type'
        )} cd=${upstream.headers.get('content-disposition')}`
      );

      if (!upstream.ok || !upstream.body) {
        const t = await safeReadText(upstream);
        const errHeaders = new Headers();
        setDebugHeader(errHeaders, 'x-debug-rid', _rid);
        setDebugHeader(errHeaders, 'x-doc-download-mode', 'docs_vault_raw_failed');
        setDebugHeader(errHeaders, 'x-debug-ms', String(Date.now() - t0));
        return new NextResponse(t || 'download failed', { status: upstream.status, headers: errHeaders });
      }

      const headers = passThroughHeaders(upstream);
      setDebugHeader(headers, 'x-debug-rid', _rid);
      setDebugHeader(headers, 'x-doc-download-mode', 'docs_vault_raw');
      setDebugHeader(headers, 'x-doc-debug-kind', qKind);
      setDebugHeader(headers, 'x-doc-debug-name', qName);
      setDebugHeader(headers, 'x-doc-debug-tbmId', qTbmId);
      setDebugHeader(headers, 'x-debug-ms', String(Date.now() - t0));

      return new NextResponse(upstream.body, { status: upstream.status, headers });
    }

    return new NextResponse('Invalid endpoint', { status: 400 });
  } catch (e: any) {
    console.log(`[api/docs][${_rid}] FATAL ${e?.stack || e}`);
    return NextResponse.json(
      { error: 'proxy_exception', rid: _rid, message: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandling(handleGET);
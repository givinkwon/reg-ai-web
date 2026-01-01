import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(filename: string) {
  const safe = (filename || "download.pdf").replace(/[/\\?%*:|"<>]/g, "_");
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const urlParam = searchParams.get("url");
  const filename = searchParams.get("filename") ?? "download.pdf";

  if (!urlParam) {
    return new Response("missing url", { status: 400 });
  }

  let u: URL;
  try {
    u = new URL(urlParam);
  } catch {
    return new Response("invalid url", { status: 400 });
  }

  // ✅ SSRF 방지: kosha 다운로드 엔드포인트만 허용
  if (
    u.protocol !== "https:" ||
    u.hostname !== "edu.kosha.or.kr" ||
    u.pathname !== "/api/portal24/bizA/p/files/downloadAtchFile"
  ) {
    return new Response("forbidden", { status: 403 });
  }

  // ✅ (선택) 필수 파라미터 체크
  const atcflNo = u.searchParams.get("atcflNo");
  const atcflSeq = u.searchParams.get("atcflSeq");
  if (!atcflNo || !atcflSeq) {
    return new Response("missing atcflNo/atcflSeq", { status: 400 });
  }

  // ✅ 여기서 핵심: KOSHA가 리퍼러/세션 체크하면 이 헤더가 필요할 수 있음
  const upstream = await fetch(u.toString(), {
    cache: "no-store",
    headers: {
      Accept: "*/*",
      Referer: "https://edu.kosha.or.kr/", // 필요하면 실제 목록/상세 페이지 URL로 더 구체화
      Origin: "https://edu.kosha.or.kr",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36",
    },
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(`upstream error: ${upstream.status}\n${text}`, { status: 502 });
  }

  const headers = new Headers();
  const ct = upstream.headers.get("content-type") ?? "application/octet-stream";
  headers.set("Content-Type", ct);
  headers.set("Content-Disposition", contentDisposition(filename));
  headers.set("Cache-Control", "no-store");

  return new Response(upstream.body, { status: 200, headers });
}

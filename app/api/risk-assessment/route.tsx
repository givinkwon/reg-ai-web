import { NextResponse } from "next/server";

const FASTAPI_BASE =  "http://127.0.0.1:8008";

/**
 * GET /api/risk-assessment?endpoint=minors&industry_code=...&major_category=...
 * -> FASTAPI /riskassessment/minors?... 로 프록시
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint") ?? "";
    if (!endpoint) {
      return NextResponse.json(
        { error: "Missing query param: endpoint" },
        { status: 400 }
      );
    }

    // endpoint는 query에서 제거하고 나머지만 FastAPI로 전달
    url.searchParams.delete("endpoint");

    const upstream = new URL(`/riskassessment/${endpoint}`, FASTAPI_BASE);
    url.searchParams.forEach((v, k) => upstream.searchParams.append(k, v));

    const res = await fetch(upstream.toString(), { cache: "no-store" });
    const contentType = res.headers.get("content-type") ?? "application/json";
    const body = await res.text();

    return new NextResponse(body, { status: res.status, headers: { "Content-Type": contentType } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Proxy failed" }, { status: 500 });
  }
}
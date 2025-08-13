import { NextResponse } from 'next/server';

const BASE = 'http://35.76.230.177:8008' 

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 기대 바디: { email, category, tags: string[], since?: "YYYY-MM-DD", brief_level?: "normal"|"short" }
    const r = await fetch(`${BASE}/start-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json({ error: text || 'backend error' }, { status: r.status });
    }

    return new NextResponse(text, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'proxy error' }, { status: 500 });
  }
}

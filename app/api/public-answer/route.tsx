// app/api/public-answer/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE = process.env.BACKEND_BASE ?? 'http://35.76.230.177:8008';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || searchParams.get('job_id');
  if (!id) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 });

  try {
    const r = await fetch(
      `${BACKEND_BASE}/public/answer?job_id=${encodeURIComponent(id)}`,
      { cache: 'no-store' }
    );
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    console.error('[public/answer] proxy error:', e);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 });
  }
}

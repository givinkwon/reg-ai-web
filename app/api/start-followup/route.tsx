// app/api/start-followup/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const res = await fetch('http://35.76.230.177:8008/start-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
    });

    // 백엔드의 status/본문을 그대로 전달 (thread_id 포함)
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[start-followup] Error:', err);
    return NextResponse.json({ error: 'Failed to start followup' }, { status: 500 });
  }
}

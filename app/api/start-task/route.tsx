// app/api/start-task/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const res = await fetch('http://35.76.230.177:8008/start-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 캐시 방지
      cache: 'no-store',
      body: JSON.stringify(body),
    });

    // 백엔드 응답을 그대로 전달 (job_id + thread_id 둘 다)
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('[start-task] Error:', error);
    return NextResponse.json({ error: 'Failed to start task' }, { status: 500 });
  }
}

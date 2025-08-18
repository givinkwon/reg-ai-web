// app/api/check-task/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const jobId = searchParams.get('jobId') || taskId; // 둘 다 허용

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  try {
    const res = await fetch(`http://35.76.230.177:8008/check-task?taskId=${jobId}`, {
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('[check-task] Error:', error);
    return NextResponse.json({ error: 'Failed to check task status' }, { status: 500 });
  }
}

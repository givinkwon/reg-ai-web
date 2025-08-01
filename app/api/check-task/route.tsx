// app/api/check-task/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  try {
    const res = await fetch(`http://35.76.230.177:8008/check-task?taskId=${jobId}`);

    if (!res.ok) {
      throw new Error(`Failed to fetch task: ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[check-task] Error:', error);
    return NextResponse.json({ error: 'Failed to check task status' }, { status: 500 });
  }
}

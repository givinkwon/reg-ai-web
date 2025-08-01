// app/api/start-task/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const res = await fetch('http://35.76.230.177:8008/start-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Failed to start task: ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json({ job_id: data.job_id }); // ✅ job_id 유지
  } catch (error) {
    console.error('[start-task] Error:', error);
    return NextResponse.json({ error: 'Failed to start task' }, { status: 500 });
  }
}
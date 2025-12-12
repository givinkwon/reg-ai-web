// app/api/start-doc-review/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const backendRes = await fetch('http://35.76.230.177:8008/start-doc-review', {
    method: 'POST',
    body: formData,
  });

  const data = await backendRes.json();
  return NextResponse.json(data, { status: backendRes.status });
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    let backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    if (!backendUrl.startsWith('http')) backendUrl = `http://${backendUrl}`;
    
    const response = await fetch(`${backendUrl}/docs-sign/sign/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    if (!response.ok) {
      try {
         const j = JSON.parse(raw);
         return NextResponse.json({ detail: j.detail || raw }, { status: response.status });
      } catch {
         return NextResponse.json({ detail: raw }, { status: response.status });
      }
    }
    return NextResponse.json(JSON.parse(raw));
  } catch (error: any) {
    console.error('Sign Submit Proxy Error:', error);
    return NextResponse.json({ detail: 'Next.js 서버 연결 오류' }, { status: 500 });
  }
}
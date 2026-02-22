import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    let backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    if (!/^https?:\/\//i.test(backendUrl)) backendUrl = `http://${backendUrl}`;
    
    const response = await fetch(`${backendUrl}/docs-sign/sign/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) return NextResponse.json({ detail: data.detail }, { status: response.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Docs Sign Submit Error:', error);
    return NextResponse.json({ detail: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
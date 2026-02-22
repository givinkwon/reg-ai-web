import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // ❗ 텍스트 데이터 전송이므로 json()으로 받습니다.
    const payload = await req.json();
    
    let backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    if (!/^https?:\/\//i.test(backendUrl)) {
      backendUrl = `http://${backendUrl}`;
    }
    
    const response = await fetch(`${backendUrl}/docs-sign/request-signatures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ message: errorText }, { status: response.status });
    }
    return NextResponse.json(await response.json());
  } catch (error: any) {
    console.error('Docs Sign Request Error:', error);
    return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
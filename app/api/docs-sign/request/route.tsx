import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // ❗ 텍스트 데이터 전송이므로 json()으로 받습니다.
    const payload = await req.json();
    
    let backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    if (!backendUrl.startsWith('http')) backendUrl = `http://${backendUrl}`;
    
    // FastAPI의 /docs-sign/request-signatures 로 전달
    const response = await fetch(`${backendUrl}/docs-sign/request-signatures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ message: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('Docs Sign Request API Error:', error);
    return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
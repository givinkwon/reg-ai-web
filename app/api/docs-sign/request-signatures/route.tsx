import { NextResponse } from 'next/server';

// 파이썬 서버 주소 (환경에 맞게 수정)
const API_BASE_URL = process.env.API_BASE_URL || 'http://35.76.230.177:8008';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userEmail = request.headers.get('x-user-email') || 'guest@reg.ai.kr';

    const response = await fetch(`${API_BASE_URL}/docs-sign/request-signatures`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': userEmail
      },
      body: JSON.stringify(body),
    });

    // 서버가 빈 응답을 줄 경우를 대비한 처리
    const text = await response.text();
    if (!text) {
      return NextResponse.json({ ok: true });
    }

    const data = JSON.parse(text);
    return NextResponse.json(data, { status: response.status });

  } catch (error) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ message: "서버 연결에 실패했습니다." }, { status: 500 });
  }
}
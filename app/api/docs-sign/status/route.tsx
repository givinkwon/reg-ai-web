// app/api/docs-sign/status/route.ts
import { NextResponse } from 'next/server';

// 파이썬 백엔드 서버 주소 (환경 변수가 없으면 기본 로컬호스트 8000 사용)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const masterId = searchParams.get('master_id');
    const userEmail = request.headers.get('x-user-email') || 'guest@reg.ai.kr';

    // 1. 파라미터 검증
    if (!masterId) {
      return NextResponse.json({ message: "master_id가 없습니다." }, { status: 400 });
    }

    // 2. 파이썬 FastAPI 백엔드로 요청 전달 (Proxy)
    const response = await fetch(`${API_BASE_URL}/docs-sign/status?master_id=${masterId}`, {
      method: 'GET',
      headers: {
        'x-user-email': userEmail,
      },
      cache: 'no-store' // 실시간 현황이므로 캐싱 방지
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    // 3. 백엔드에서 받은 데이터를 그대로 프론트로 반환
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error('[API Proxy Error] docs-sign/status:', error);
    return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
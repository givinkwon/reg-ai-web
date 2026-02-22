import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // ✅ 백엔드 주소를 실제 서버 주소로 변경
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    
    const response = await fetch(`${backendUrl}/docs-translate/process`, {
      method: 'POST',
      body: formData, // 파일과 target_language가 포함됨
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ message: errorText }, { status: response.status });
    }

    // 파일 스트림을 그대로 클라이언트로 전달 (다운로드용)
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Disposition': response.headers.get('Content-Disposition') || 'attachment',
      },
    });
    
  } catch (error: any) {
    console.error('Docs Translate API Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
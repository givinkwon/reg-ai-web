// app/api/docs-sign/sign/init/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ message: 'Token is required' }, { status: 400 });

  try {
    let backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    if (!backendUrl.startsWith('http')) backendUrl = `http://${backendUrl}`;
    
    // FastAPI (Docs Sign Init) 호출
    const response = await fetch(`${backendUrl}/docs-sign/sign/init?token=${token}`);
    const data = await response.json();
    
    if (!response.ok) return NextResponse.json({ message: data.detail }, { status: response.status });

    // ✅ [핵심] 기존 TBM SignPage가 깨지지 않도록 데이터 포맷을 변환 (Mapping)
    const tbmCompatibleData = {
      title: '안전 문서 서명',
      company: '안전 보건 자료',
      siteName: data.filename || '업로드된 문서',
      dateISO: data.createdAt ? data.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
      
      // AI가 3~5줄 요약한 리스트를 줄바꿈 텍스트로 합침
      workSummary: data.summary?.join('\n') || '요약 내용이 없습니다.',
      hazardSummary: '상단 문서 요약 내용을 숙지하였습니다.', // 빈 칸 채우기 용
      complianceSummary: '해당 문서의 안전 수칙을 준수할 것을 서약합니다.', // 빈 칸 채우기 용
      
      attendeeName: data.attendeeName,
      alreadySigned: data.alreadySigned,
      expiresAt: '', // 필요시 추가
    };

    return NextResponse.json(tbmCompatibleData);
  } catch (error: any) {
    return NextResponse.json({ message: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
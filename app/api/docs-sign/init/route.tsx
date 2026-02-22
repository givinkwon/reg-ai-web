import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ message: 'Token is required' }, { status: 400 });

  try {
    let backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    if (!/^https?:\/\//i.test(backendUrl)) backendUrl = `http://${backendUrl}`;
    
    const response = await fetch(`${backendUrl}/docs-sign/sign/init?token=${token}`, { cache: 'no-store' });
    const data = await response.json();
    
    if (!response.ok) return NextResponse.json({ message: data.detail }, { status: response.status });

    // ✅ TBM UI 템플릿에 맞게 데이터 매핑
    const tbmCompatibleData = {
      title: '안전 문서 서명',
      company: '안전 보건 자료',
      siteName: data.filename || '업로드된 문서',
      dateISO: data.createdAt ? data.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
      workSummary: data.summary?.join('\n') || '요약 내용이 없습니다.',
      hazardSummary: '상단 문서 요약 내용을 숙지하였습니다.',
      complianceSummary: '해당 문서의 안전 수칙을 준수할 것을 서약합니다.',
      attendeeName: data.attendeeName,
      alreadySigned: data.alreadySigned,
      expiresAt: '',
    };

    return NextResponse.json(tbmCompatibleData);
  } catch (error: any) {
    console.error('Docs Sign Init Error:', error);
    return NextResponse.json({ message: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
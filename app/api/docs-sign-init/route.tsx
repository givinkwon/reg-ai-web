import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ message: '토큰이 없습니다.' }, { status: 400 });

  try {
    let backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    if (!backendUrl.startsWith('http')) backendUrl = `http://${backendUrl}`;
    
    const response = await fetch(`${backendUrl}/docs-sign/sign/init?token=${token}`, { cache: 'no-store' });
    const raw = await response.text();
    
    if (!response.ok) {
      try {
        const j = JSON.parse(raw);
        return NextResponse.json({ message: j.detail || raw }, { status: response.status });
      } catch {
        return NextResponse.json({ message: raw }, { status: response.status });
      }
    }

    const data = JSON.parse(raw);
    
    // TBM 화면용 데이터 매핑
    const tbmCompatibleData = {
      title: '안전 문서 서명',
      company: '안전 보건 자료',
      siteName: data.filename || '업로드된 문서',
      dateISO: data.createdAt ? data.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
      // 요약 데이터가 안전하게 문자열로 변환되도록 체크
      workSummary: Array.isArray(data.summary) ? data.summary.join('\n') : (data.summary || '요약 내용이 없습니다.'),
      hazardSummary: '상단 문서 요약 내용을 숙지하였습니다.',
      complianceSummary: '해당 문서의 안전 수칙을 준수할 것을 서약합니다.',
      attendeeName: data.attendeeName,
      alreadySigned: data.alreadySigned,
      expiresAt: '',
    };

    return NextResponse.json(tbmCompatibleData);
  } catch (error: any) {
    console.error('Sign Init Proxy Error:', error);
    return NextResponse.json({ message: 'Next.js 서버 연결 오류' }, { status: 500 });
  }
}
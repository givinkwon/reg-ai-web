import { NextResponse } from 'next/server';

function cleanText(text: string): string {
  return text
    .replace(/---+/g, '')        // --- 제거
    .replace(/["“”]/g, '')       // 큰따옴표 제거
    .replace(/\*\*/g, '')
    .replace(/\n/g, '<br />'); // 줄바꿈을 HTML로 바꾸기
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email = body.email || 'anonymous';
    const category = body.category;
    const message = body.message;

    console.log('📥 email:', email);
    console.log('📥 category:', category);
    console.log('📥 message:', message);

    const res = await fetch('http://35.76.230.177:8007/chatgpt-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        category,
        message,
      }),
    });
    

    const data = await res.json();
    return NextResponse.json({ answer: cleanText(data.gpt_response) || '⚠️ 응답 없음' });
  } catch (err) {
    console.error('❌ API 오류:', err);
    return NextResponse.json({ error: 'GPT 응답 실패' }, { status: 500 });
  }
}

// app/api/slack/route.ts
import { NextRequest, NextResponse } from 'next/server';

// (선택) 이 라우트는 매 요청마다 실행되도록
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const WEBHOOK = process.env.SLACK_WEBHOOK_URL; // ✅ .env(.local) / Vercel env
    if (!WEBHOOK) {
      // 서버 환경변수 누락 시 500
      return NextResponse.json({ error: 'Missing SLACK_WEBHOOK_URL' }, { status: 500 });
    }

    const { text, blocks } = await req.json().catch(() => ({}));
    if (!text && !blocks) {
      return NextResponse.json({ error: 'text or blocks is required' }, { status: 400 });
    }

    // 너무 긴 텍스트는 잘라서 전송(슬랙은 최대 40k지만 UI 고려)
    const safeText = typeof text === 'string' ? text.slice(0, 3500) : undefined;

    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // blocks 포맷을 쓰면 text는 fallback로 남겨두는 게 좋아요.
      body: JSON.stringify({ text: safeText, blocks }),
      // (선택) 타임아웃 제어가 필요하면 AbortController 사용
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return NextResponse.json(
        { error: 'Slack error', detail },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    // ❗️URL/토큰은 절대 로그에 찍지 않음
    console.error('Error sending to Slack:', err?.message || err);
    return NextResponse.json({ error: 'Failed to send Slack notification' }, { status: 500 });
  }
}

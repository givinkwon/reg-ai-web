// app/api/slack/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  console.log('[Slack API] 호출됨');

  try {
    const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
    console.log('[Slack API] WEBHOOK URL 존재 여부:', Boolean(WEBHOOK));

    if (!WEBHOOK) {
      return NextResponse.json({ error: 'Missing SLACK_WEBHOOK_URL' }, { status: 500 });
    }

    const body = await req.json().catch((e) => {
      console.error('[Slack API] req.json() 파싱 실패:', e);
      return {};
    });
    console.log('[Slack API] 요청 body:', body);

    const { text, blocks } = body;
    if (!text && !blocks) {
      console.warn('[Slack API] text, blocks 둘 다 없음');
      return NextResponse.json({ error: 'text or blocks is required' }, { status: 400 });
    }

    const safeText = typeof text === 'string' ? text.slice(0, 3500) : undefined;
    console.log('[Slack API] safeText:', safeText);

    const slackPayload = { text: safeText, blocks };
    console.log('[Slack API] Slack 전송 payload:', slackPayload);

    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    console.log('[Slack API] Slack 응답 status:', res.status);
    const resText = await res.text();
    console.log('[Slack API] Slack 응답 body:', resText);

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Slack error', detail: resText || res.statusText },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error('[Slack API] 예외 발생:', err);
    return NextResponse.json({ error: 'Failed to send Slack notification' }, { status: 500 });
  }
}
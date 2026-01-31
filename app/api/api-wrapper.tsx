// app/api/api-wrapper.ts
import { NextRequest, NextResponse } from 'next/server';

/**
 * 래핑할 핸들러의 타입 정의
 * (NextRequest와 Request 모두를 허용하도록 설정)
 */
type ApiHandler = (req: any, ...args: any[]) => Promise<Response>;

export function withErrorHandling(handler: ApiHandler) {
  return async (req: NextRequest, ...args: any[]) => {
    const userEmail = req.headers.get('x-user-email') || 'unknown';
    const requestUrl = req.url;

    try {
      // 1. 실제 핸들러 실행
      const response = await handler(req, ...args);

      // 2. 응답이 에러(400 이상)인 경우 슬랙 알림
      if (response.status >= 400) {
        await callSlackApi(requestUrl, response.status, userEmail, `Status Code: ${response.status}`);
      }

      return response;
    } catch (e: any) {
      const errorMsg = e?.message ?? String(e);
      console.error("🔥 [API Wrapper Exception]:", errorMsg);
      
      await callSlackApi(requestUrl, 500, userEmail, `Exception: ${errorMsg}`);

      return NextResponse.json(
        { error: 'internal_server_error', message: errorMsg },
        { status: 500 }
      );
    }
  };
}

async function callSlackApi(url: string, status: number, user: string, msg: string) {
  try {
    // 내부 API Route 호출 시 절대 경로 구성 (배포 환경 고려)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''; 
    await fetch(`${baseUrl}/api/slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 *[Next.js API Error]*\n*URL*: \`${url}\`\n*Status*: \`${status}\`\n*User*: \`${user}\`\n*Detail*: \`${msg}\``
      }),
    });
  } catch (err) {
    console.error("Slack notify failed", err);
  }
}
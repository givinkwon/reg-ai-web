import { NextRequest, NextResponse } from 'next/server';

/**
 * 래핑할 핸들러의 타입 정의
 */
type ApiHandler = (req: any, ...args: any[]) => Promise<Response>;

/**
 * 에러 핸들링 및 슬랙 알림을 처리하는 고차 함수 (HOC)
 */
export function withErrorHandling(handler: ApiHandler) {
  return async (req: NextRequest, ...args: any[]) => {
    const userEmail = req.headers.get('x-user-email') || 'unknown';
    const requestUrl = req.url;

    try {
      // 1. 실제 핸들러 실행
      const response = await handler(req, ...args);

      // 2. 응답이 에러(400 이상)인 경우 슬랙 알림
      if (response.status >= 400) {
        // ✅ 첫 번째 인자로 req를 전달합니다.
        await callSlackApi(req, requestUrl, response.status, userEmail, `Status Code: ${response.status}`);
      }

      return response;
    } catch (e: any) {
      const errorMsg = e?.message ?? String(e);
      console.error("🔥 [API Wrapper Exception]:", errorMsg);
      
      // ✅ 첫 번째 인자로 req를 전달합니다.
      await callSlackApi(req, requestUrl, 500, userEmail, `Exception: ${errorMsg}`);

      return NextResponse.json(
        { error: 'internal_server_error', message: errorMsg },
        { status: 500 }
      );
    }
  };
}

/**
 * 내부 슬랙 알림 API 호출 함수
 */
async function callSlackApi(req: Request, url: string, status: number, user: string, msg: string) {
  try {
    // 1. 요청 헤더에서 호스트(localhost:3000 또는 실제 도메인) 정보를 가져옵니다.
    const host = req.headers.get('host');
    
    // 2. 프로토콜(http/https) 결정 (로컬 환경 대응)
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    
    // 3. 절대 경로 구성
    const baseUrl = `${protocol}://${host}`;

    // 내부 API Route (/api/slack/route.ts 등) 호출
    await fetch(`${baseUrl}/api/slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 *[Next.js API Error]*\n*URL*: \`${url}\`\n*Status*: \`${status}\`\n*User*: \`${user}\`\n*Detail*: \`${msg}\``
      }),
    });
  } catch (err) {
    // 슬랙 알림 자체가 실패하더라도 메인 로직에 영향을 주지 않도록 로깅만 수행
    console.error("Slack notify failed:", err);
  }
}
// app/api/safety-news/latest/route.ts
import { NextRequest, NextResponse } from 'next/server';

// 배포 시에는 .env 에 넣고 쓰는 게 좋음
const REG_API_BASE =
  process.env.NEXT_PUBLIC_REG_API_BASE ||
  'http://35.76.230.177:8008';

export async function GET(req: NextRequest) {
  // 클라이언트에서 /api/safety-news/latest?category=environment 이런 식으로 호출하면
  // 그대로 FastAPI 로 전달
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  const url = new URL('/safety-news/latest', REG_API_BASE);
  if (category) {
    url.searchParams.set('category', category);
  }

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',       // 캐시 방지
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[safety-news/latest] backend error', res.status, data);
      return NextResponse.json(
        { error: 'Failed to fetch safety news', detail: data },
        { status: res.status },
      );
    }

    // FastAPI 가 주는 JSON (id, category, period, batch_date, digest, …) 그대로 반환
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[safety-news/latest] Error:', err);
    return NextResponse.json(
      { error: 'Failed to call reg-ai-api' },
      { status: 500 },
    );
  }
}

// app/api/expect-law/latest/route.ts
import { NextRequest, NextResponse } from 'next/server';

const REG_API_BASE =
  process.env.NEXT_PUBLIC_REG_API_BASE ||
  'http://35.76.230.177:8008';

export async function GET(req: NextRequest) {
  const now = new Date().toISOString();

  // 👉 1) 들어온 요청 로그
  console.log('[expect-law/latest][NEXT] ====================================');
  console.log('[expect-law/latest][NEXT]', now, 'incoming req.url =', req.url);
  console.log('[expect-law/latest][NEXT]', 'REG_API_BASE =', REG_API_BASE);

  // 쿼리에서 months_back 읽기
  const { searchParams } = new URL(req.url);
  const monthsBackRaw = searchParams.get('months_back') ?? '1';
  const monthsBackNum = Number(monthsBackRaw);
  const monthsBack =
    Number.isFinite(monthsBackNum) && monthsBackNum > 0
      ? monthsBackNum
      : 1;

  console.log(
    '[expect-law/latest][NEXT]',
    'months_back (raw/parsed) =',
    monthsBackRaw,
    '/',
    monthsBack,
  );

  // 👉 2) 백엔드 호출 URL 구성
  const backendUrl = new URL('/expect-law/latest', REG_API_BASE);
  backendUrl.searchParams.set('months_back', String(monthsBack));

  console.log(
    '[expect-law/latest][NEXT]',
    'backendUrl =',
    backendUrl.toString(),
  );

  try {
    const res = await fetch(backendUrl.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const status = res.status;
    const text = await res.text(); // 원문 그대로 읽어서 찍기

    console.log(
      '[expect-law/latest][NEXT]',
      'backend status =',
      status,
    );
    console.log(
      '[expect-law/latest][NEXT]',
      'backend raw body =',
      text,
    );

    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      console.log(
        '[expect-law/latest][NEXT]',
        'JSON.parse failed, wrap as rawText',
        e,
      );
      data = { rawText: text };
    }

    if (!res.ok) {
      console.error(
        '[expect-law/latest][NEXT] backend error',
        status,
        data,
      );
      return NextResponse.json(
        {
          error: 'Failed to fetch expect-law summary',
          status,
          backend: data,
        },
        { status },
      );
    }

    console.log(
      '[expect-law/latest][NEXT]',
      'OK – returning data to client',
    );
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[expect-law/latest][NEXT] fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to call reg-ai-api', detail: String(err) },
      { status: 500 },
    );
  }
}

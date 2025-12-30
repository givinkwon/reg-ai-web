import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ✅ 가능하면 env로 빼는 걸 추천
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL ?? 'http://35.76.230.177:8008';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const payload = {
      email: body.email, // 프론트에서 {email} 그대로
    };

    const fastapiRes = await fetch(`${FASTAPI_BASE_URL}/accounts/find-by-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const data = await fastapiRes.json().catch(() => null);
    return NextResponse.json(data, { status: fastapiRes.status });
  } catch (err) {
    console.error('[Next API] /api/accounts/find-by-email error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

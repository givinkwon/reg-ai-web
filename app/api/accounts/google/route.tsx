import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '../../api-wrapper';

export const runtime = 'nodejs';

const FASTAPI_BASE_URL = 'http://35.76.230.177:8008';

async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json();

    // 🔹 프론트에서 googleId로 보내든, google_id로 보내든 여기서 통일
    const payload = {
      google_id: body.google_id ?? body.googleId, // 둘 중 하나 존재하면 사용
      email: body.email,
      name: body.name ?? null,
      picture: body.picture ?? null,
      locale: body.locale ?? null,
    };

    const fastapiRes = await fetch(`${FASTAPI_BASE_URL}/accounts/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await fastapiRes.json().catch(() => null);

    return NextResponse.json(data, { status: fastapiRes.status });
  } catch (err) {
    console.error('[Next API] /api/accounts/google error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export const POST = withErrorHandling(handlePOST);
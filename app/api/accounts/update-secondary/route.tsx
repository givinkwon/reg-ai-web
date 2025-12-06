// app/api/accounts/update-secondary/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const FASTAPI_BASE_URL = 'http://35.76.230.177:8008';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json(); // { email, secondary_info, mark_complete }

    const fastapiRes = await fetch(`${FASTAPI_BASE_URL}/accounts/update-secondary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await fastapiRes.json().catch(() => null);
    return NextResponse.json(data, { status: fastapiRes.status });
  } catch (err) {
    console.error('[Next API] /api/accounts/update-secondary error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

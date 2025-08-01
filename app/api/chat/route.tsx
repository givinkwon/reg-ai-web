// app/api/chat/route.ts
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { userId, role, message } = await req.json()

    const res = await fetch('http://localhost:8007/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        role,
        message,
      }),
    })

    const data = await res.json()
    return NextResponse.json({ answer: data.answer })
  } catch (err) {
    return NextResponse.json({ error: 'GPT 응답 실패' }, { status: 500 })
  }
}

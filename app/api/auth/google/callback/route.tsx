// app/api/auth/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect('/chat?login=failed');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;

  // 1) code -> access_token 교환
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect('/chat?login=failed');
  }

  const tokenJson = await tokenRes.json() as {
    access_token: string;
    id_token?: string;
  };

  // 2) 유저 정보 조회 (id_token 디코딩 or /userinfo 호출)
  const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
    },
  });

  if (!userRes.ok) {
    return NextResponse.redirect('/chat?login=failed');
  }

  const user = await userRes.json() as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  // 3) 여기서 user 정보를 바탕으로
  //    - DB에 사용자 생성/조회
  //    - 세션/쿠키 설정 (JWT 등)
  //    - 이후 /chat 으로 리다이렉트

  const res = NextResponse.redirect('/chat');
  // 예시: JWT를 쿠키로 심기
  // res.cookies.set('regai_auth', jwtToken, {
  //   httpOnly: true,
  //   secure: true,
  //   sameSite: 'lax',
  //   path: '/',
  // });

  return res;
}

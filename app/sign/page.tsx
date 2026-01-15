// app/sign/page.tsx
import { Suspense } from 'react';
import SignClient from './SignClient';

export const dynamic = 'force-dynamic'; // 빌드 프리렌더 방지(안전)

export default function SignPage({
  searchParams,
}: {
  searchParams?: { token?: string };
}) {
  const token = (searchParams?.token || '').trim();

  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
          <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 22 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800 }}>불러오는 중…</h1>
          </div>
        </main>
      }
    >
      <SignClient token={token} />
    </Suspense>
  );
}

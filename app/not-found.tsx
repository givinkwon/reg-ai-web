import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
        페이지를 찾을 수 없습니다
      </h1>
      <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
        주소가 잘못되었거나, 링크가 만료되었을 수 있습니다.
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <Link href="/" style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 10 }}>
          홈으로
        </Link>
        <Link href="/sign" style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 10 }}>
          TBM 서명 페이지
        </Link>
      </div>
    </main>
  );
}

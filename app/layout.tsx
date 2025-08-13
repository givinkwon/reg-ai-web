// app/layout.tsx
import "./globals.css";
import Script from "next/script";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "reg-ai-web",
  description: "Chat App",
};

const GTM_ID = "GTM-MS4RQT3J";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <Script id="gtm-base" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>

        {/* 시스템에게 라이트/다크 둘 다 지원한다 알림 */}
        <meta name="color-scheme" content="light dark" />

        {/* ✅ 최초 로드 시 body[data-theme] 설정 (삼성 인터넷 강제 다크 대응) */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
              const theme = prefersDark ? 'dark' : 'light';
              document.documentElement.setAttribute('data-theme', theme);
              document.body && document.body.setAttribute('data-theme', theme);
              // 시스템 테마 변경 시 실시간 반영
              window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                const t = e.matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', t);
                document.body && document.body.setAttribute('data-theme', t);
              });
            } catch (_) {}
          `}
        </Script>
      </head>
      <body>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {children}
      </body>
    </html>
  );
}

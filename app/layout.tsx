// app/layout.tsx
import "./globals.css";
import Script from "next/script";
import type { Metadata } from "next";
import GAEventBridge from "./components/analytics/GAEventBridge";

export const metadata: Metadata = {
  title: "reg-ai-web",
  description: "Chat App",
};

const GTM_ID = "GTM-MS4RQT3J"; // 필요시 env로 이동
const ADS_ID = "AW-17610431883"; // ✅ Google Ads tag ID
const KAKAO_JS_KEY = "79c1a2486d79d909091433229e814d9d"; // (현재 코드에선 미사용)

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Viewport (삼성 브라우저 확대 버그 방지) */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />

        {/* ✅ 라이트/다크 모두 지원을 선언 */}
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />

        {/* ✅ OS/브라우저 상단바 색상을 라이트/다크에 각각 명시 */}
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#f9fafb"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#0b1120"
        />

        {/* iOS 상태바 대비 명시 (선택) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />

        {/* ✅ Kakao JS SDK */}
        <Script
          id="kakao-sdk"
          src="https://developers.kakao.com/sdk/js/kakao.min.js"
          strategy="afterInteractive"
        />

        {/* ✅ Google Ads gtag.js (AW-...) */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            // ✅ gtag를 window에 붙여두면 다른 코드에서도 사용할 수 있음
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${ADS_ID}');
          `}
        </Script>

        {/* Google Tag Manager */}
        <Script id="gtm-base" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
      </head>

      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>

        {/* ✅ 전역 GA(=dataLayer) 브릿지 */}
        <GAEventBridge />

        {children}
      </body>
    </html>
  );
}

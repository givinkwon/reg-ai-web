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
const ADS_ID = "AW-17610431883"; // ✅ Google Ads 전환추적 ID
const ADS_CONVERSION_LABEL = "LxoSCPy-y-UbEIu7p81B"; // ✅ "가입" 전환 라벨
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
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        {/* ✅ Kakao JS SDK */}
        <Script
          id="kakao-sdk"
          src="https://developers.kakao.com/sdk/js/kakao.min.js"
          strategy="afterInteractive"
        />

        {/* ✅ Google Ads gtag.js (AW-...) */}
        <Script
          id="ads-gtag-src"
          src={`https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`}
          strategy="afterInteractive"
        />

        {/* ✅ gtag 초기화 + Ads config */}
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            window.gtag = function(){ window.dataLayer.push(arguments); };
            window.gtag('js', new Date());
            window.gtag('config', '${ADS_ID}');
          `}
        </Script>

        {/* ✅ Event snippet: "가입" 전환 함수 (React에서 window.gtag_report_conversion(...) 호출) */}
        <Script id="gtag-conversion-snippet" strategy="afterInteractive">
          {`
            window.gtag_report_conversion = function(url, value, currency) {
              var callback = function () {
                if (typeof url !== 'undefined' && url) {
                  window.location = url;
                }
              };

              try {
                if (window.gtag) {
                  window.gtag('event', 'conversion', {
                    'send_to': '${ADS_ID}/${ADS_CONVERSION_LABEL}',
                    'value': (typeof value === 'number' ? value : 1.0),
                    'currency': (typeof currency === 'string' ? currency : 'KRW'),
                    'event_callback': callback
                  });
                } else {
                  callback();
                }
              } catch (e) {
                callback();
              }

              return false;
            };
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

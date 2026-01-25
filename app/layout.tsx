// app/layout.tsx
import "./globals.css";
import Script from "next/script";
import type { Metadata } from "next";
import GAEventBridge from "./components/analytics/GAEventBridge";
import Navbar from "./docs/components/Navbar"; // ✅ Navbar 컴포넌트 임포트

export const metadata: Metadata = {
  title: "reg-ai-web",
  description: "Chat App",
};

const GTM_ID = "GTM-MS4RQT3J";
const ADS_ID = "AW-17610431883";
const ADS_CONVERSION_LABEL = "LxoSCPy-y-UbEIu7p81B";
const KAKAO_JS_KEY = "79c1a2486d79d909091433229e814d9d"; // (현재 코드에선 미사용)

function envBool(v?: string) {
  const s = (v ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(s);
}

// ✅ env에 값이 있으면 전체 트래킹 로딩 자체를 막음
const GA_DISABLED = envBool(process.env.NEXT_PUBLIC_GA_DISABLED);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />

        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />

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

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        {/* ✅ Kakao JS SDK (트래킹과 무관하면 계속 로딩) */}
        <Script
          id="kakao-sdk"
          src="https://developers.kakao.com/sdk/js/kakao.min.js"
          strategy="afterInteractive"
        />

        {/* ✅ GA_DISABLED면 아래 트래킹 스크립트/브릿지 모두 로딩 안 함 */}
        {!GA_DISABLED && (
          <>
            {/* Google Ads gtag.js */}
            <Script
              id="ads-gtag-src"
              src={`https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`}
              strategy="afterInteractive"
            />

            {/* gtag 초기화 */}
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                window.gtag = function(){ window.dataLayer.push(arguments); };
                window.gtag('js', new Date());
                window.gtag('config', '${ADS_ID}');
              `}
            </Script>

            {/* Ads conversion helper */}
            <Script id="gtag-conversion-snippet" strategy="afterInteractive">
              {`
                window.gtag_report_conversion = function(url, value, currency) {
                  var callback = function () {
                    if (typeof url !== 'undefined' && url) window.location = url;
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
          </>
        )}
      </head>

      <body>
        {/* GTM noscript도 GA_DISABLED면 숨김 */}
        {!GA_DISABLED && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}

        {/* ✅ 전역 GA 브릿지도 GA_DISABLED면 렌더링 안 함 */}
        {!GA_DISABLED && <GAEventBridge />}

        {/* ✅ Navbar 및 레이아웃 구조 복구 */}
        <div className="min-h-screen bg-white flex flex-col font-sans text-gray-900">
          <Navbar />
          <main className="flex-1 flex flex-col relative">
            {children}
          </main>
        </div>
        
      </body>
    </html>
  );
}
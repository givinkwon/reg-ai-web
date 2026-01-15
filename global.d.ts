// global.d.ts
export {};

declare global {
  interface KakaoLoginOptions {
    scope?: string;
    throughTalk?: boolean; // 🔥 여기 추가
    success: (authObj: any) => void;
    fail: (err: any) => void;
  }

  interface KakaoAuth {
    login(options: KakaoLoginOptions): void;
  }

  interface KakaoAPI {
    request(options: {
      url: string;
      data?: any;
      success: (res: any) => void;
      fail: (err: any) => void;
    }): void;
  }

  interface KakaoStatic {
    init(key: string): void;
    isInitialized(): boolean;
    Auth: KakaoAuth;
    API: KakaoAPI;
  }

  interface Window {
    // ✅ Kakao SDK
    Kakao?: KakaoStatic;

    // ✅ Google Tag / Ads (gtag)
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;

    // ✅ Google Ads conversion helper
    // url: 전환 후 이동할 URL(필요 없으면 undefined)
    // value/currency: 동적 값 전달용
    gtag_report_conversion?: (
      url?: string,
      value?: number,
      currency?: string
    ) => boolean;
  }
}

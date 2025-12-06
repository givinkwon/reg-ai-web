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
    Kakao?: KakaoStatic;
  }
}

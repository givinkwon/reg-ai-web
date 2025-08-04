// app/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCH5QlXIumRnMf8kBDVTd9yeU-a9s_Vam0",
  authDomain: "sales-ai-d2e70.firebaseapp.com",
  projectId: "sales-ai-d2e70",
  storageBucket: "sales-ai-d2e70.appspot.com",
  messagingSenderId: "582957914219",
  appId: "1:582957914219:web:dd4aeca37296f4ffc0f92e",
  measurementId: "G-ME5G8X31CK",
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Google 로그인 프로바이더 (+ Gmail 읽기 스코프 예시)
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/gmail.readonly");
googleProvider.setCustomParameters({ prompt: "select_account" });

// (선택) Firebase Analytics – Next.js에서는 클라이언트에서만 초기화
let _analytics: Analytics | null = null;
export async function getFbAnalytics() {
  if (typeof window === "undefined") return null;
  if (_analytics) return _analytics;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  _analytics = getAnalytics(app);
  return _analytics;
}

'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  type Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getAnalytics,
  isSupported,
  type Analytics,
} from 'firebase/analytics';

/**
 * Firebase 콘솔에서 복사한 설정값
 * (원하면 나중에 .env로 옮겨도 됨)
 */
const firebaseConfig = {
  apiKey: "AIzaSyBTXlY0gPnRe_ES-YuZKuMc47U4N07qAKE",
  authDomain: "regai-8b82f.firebaseapp.com",
  projectId: "regai-8b82f",
  storageBucket: "regai-8b82f.firebasestorage.app",
  messagingSenderId: "88196231324",
  appId: "1:88196231324:web:72870a19ca5acecbd8bd59",
  measurementId: "G-2NCDDRVEDC"
};

/* =========================
 * Firebase App / Auth / Analytics
 * ========================= */

// app 인스턴스 (중복 생성 방지)
const app: FirebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

// Auth + Google Provider
const auth: Auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
// 필요하면 프로필/이메일 scope 더 추가 가능
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Analytics (선택)
let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  // SSR에서는 window 없음 주의
  isSupported()
    .then((ok) => {
      if (ok) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      // analytics 미지원 브라우저면 그냥 무시
    });
}

export { app, auth, analytics };

/* =========================
 * Auth Util 함수들
 * ========================= */

/** 팝업으로 구글 로그인 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/** 로그아웃 */
export async function logoutFirebase() {
  await signOut(auth);
}

/** Firebase Auth 상태 변경 리스너 */
export function onFirebaseAuthChanged(
  callback: (user: User | null) => void,
) {
  return onAuthStateChanged(auth, callback);
}

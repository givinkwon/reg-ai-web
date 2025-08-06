// lib/firebase/config.ts

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// ✅ Firebase 설정
const firebaseConfig = {
  apiKey: 'AIzaSyCH5QlXIumRnMf8kBDVTd9yeU-a9s_Vam0',
  authDomain: 'sales-ai-d2e70.firebaseapp.com',
  projectId: 'sales-ai-d2e70',
  storageBucket: 'sales-ai-d2e70.appspot.com',
  messagingSenderId: '582957914219',
  appId: '1:582957914219:web:dd4aeca37296f4ffc0f92e',
  measurementId: 'G-ME5G8X31CK',
};

// ✅ Firebase 앱 초기화 (중복 방지)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// ✅ 인증 관련 객체 export
export const loginAuth = getAuth(app);
export const provider = new GoogleAuthProvider();

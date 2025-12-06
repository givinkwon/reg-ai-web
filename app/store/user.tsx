'use client';

import { create } from 'zustand';
import Cookies from 'js-cookie';
import type { User as FirebaseUser } from 'firebase/auth';
import { onFirebaseAuthChanged } from '@/app/lib/firebase';

/* ===================== 타입 ===================== */

export interface UserInfo {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  token: string;
}

// Google / Kakao 공통 user
export type FirebaseSimpleUser = {
  uid: string;
  email: string | null;
  name: string | null;
  photoUrl: string | null;
  provider: string | null; // 'google' | 'kakao' | ...
};

type UserState = {
  // 기존 userInfo (호환용)
  userInfo: UserInfo;
  setUserInfo: (info: Partial<UserInfo>) => void;
  clearUserInfo: () => void;

  // 공통 로그인 정보
  user: FirebaseSimpleUser | null;
  initialized: boolean;

  // Google(Firebase)용
  setFromFirebase: (u: FirebaseUser | null) => void;

  // 수동 세팅용(카카오 등)
  setUser: (u: FirebaseSimpleUser | null) => void;

  // 로그아웃용(기존 이름 그대로)
  clearFirebaseUser: () => void;

  // 직무 선택
  selectedJobType: string | null;
  setSelectedJobType: (type: string | null) => void;

  // 쿠키/로컬스토리지 하이드레이션
  hydrateFromCookie: () => void;
  hydrateAuthFromStorage: () => void;
};

/* ===================== 유틸 ===================== */

const EMPTY_USERINFO: UserInfo = {
  displayName: null,
  email: null,
  photoURL: null,
  token: '',
};

const AUTH_STORAGE_KEY = 'regai_auth_user_v1';

function saveAuthToStorage(user: FirebaseSimpleUser | null) {
  if (typeof window === 'undefined') return;
  if (!user) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

function loadAuthFromStorage(): FirebaseSimpleUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FirebaseSimpleUser;
  } catch {
    return null;
  }
}

/* ===================== Zustand Store ===================== */

export const useUserStore = create<UserState>((set) => ({
  userInfo: { ...EMPTY_USERINFO },
  setUserInfo: (info) =>
    set((state) => ({
      userInfo: { ...state.userInfo, ...info },
    })),
  clearUserInfo: () => set({ userInfo: { ...EMPTY_USERINFO } }),

  user: null,
  initialized: false,

  // 🔹 Firebase(Google) → store
  setFromFirebase: (fbUser) =>
    set((prev) => {
      // Firebase 쪽은 로그아웃인데, 현재 카카오 로그인 중이면 무시
      if (!fbUser && prev.user && prev.user.provider === 'kakao') {
        return { ...prev, initialized: true };
      }

      if (!fbUser) {
        saveAuthToStorage(null);
        return {
          ...prev,
          user: null,
          userInfo: { ...EMPTY_USERINFO },
          initialized: true,
        };
      }

      const simple: FirebaseSimpleUser = {
        uid: fbUser.uid,
        email: fbUser.email ?? null,
        name: fbUser.displayName ?? null,
        photoUrl: fbUser.photoURL ?? null,
        provider: 'google',
      };

      saveAuthToStorage(simple);

      return {
        ...prev,
        user: simple,
        userInfo: {
          displayName: fbUser.displayName ?? null,
          email: fbUser.email ?? null,
          photoURL: fbUser.photoURL ?? null,
          token: '',
        },
        initialized: true,
      };
    }),

  // 🔹 Kakao 등 수동 로그인용
  setUser: (user) =>
    set(() => {
      saveAuthToStorage(user);
      if (!user) {
        return {
          user: null,
          userInfo: { ...EMPTY_USERINFO },
          initialized: true,
        };
      }
      return {
        user,
        userInfo: {
          displayName: user.name,
          email: user.email,
          photoURL: user.photoUrl,
          token: '',
        },
        initialized: true,
      };
    }),

  // 🔹 공통 로그아웃 (기존 이름 유지)
  clearFirebaseUser: () =>
    set(() => {
      saveAuthToStorage(null);
      return {
        user: null,
        userInfo: { ...EMPTY_USERINFO },
        initialized: true,
      };
    }),

  // ---- 직무 선택 + 쿠키 ----
  selectedJobType: null,
  setSelectedJobType: (type) => {
    if (type) Cookies.set('selectedJobType', type, { expires: 7 });
    else Cookies.remove('selectedJobType');
    set({ selectedJobType: type });
  },

  hydrateFromCookie: () => {
    const saved = Cookies.get('selectedJobType');
    set({ selectedJobType: saved ?? null });
  },

  // 🔹 로컬스토리지 → 로그인 상태 복원 (Google/Kakao 공통)
  hydrateAuthFromStorage: () => {
    const stored = loadAuthFromStorage();
    if (!stored) return;
    set({
      user: stored,
      userInfo: {
        displayName: stored.name,
        email: stored.email,
        photoURL: stored.photoUrl,
        token: '',
      },
      initialized: true,
    });
  },
}));

/* ===================== Firebase 리스너 init ===================== */

let listenerStarted = false;

/**
 * 클라이언트에서 한 번만 호출하면
 * 1) localStorage에 저장된 로그인 정보 복원
 * 2) Firebase Auth(onAuthStateChanged)와 동기화
 */
export function initUserStore() {
  if (typeof window === 'undefined') return;
  if (listenerStarted) return;
  listenerStarted = true;

  const { setFromFirebase, hydrateAuthFromStorage } =
    useUserStore.getState();

  // 1) 캐시된 로그인 정보 복원 (Google & Kakao)
  hydrateAuthFromStorage();

  // 2) Firebase(Google) 로그인 상태 반영
  onFirebaseAuthChanged((u) => {
    setFromFirebase(u);
  });
}

'use client';

import { create } from 'zustand';
import Cookies from 'js-cookie';
import type { User as FirebaseUser } from 'firebase/auth';

// ✅ [수정 1] 불필요한 firebase/auth 직접 import 제거
// import { getAuth, signOut } from 'firebase/auth'; 

// ✅ [수정 2] logoutFirebase 헬퍼 함수 import (firebaseApp 에러 해결)
import { onFirebaseAuthChanged, logoutFirebase } from '../lib/firebase';

/* ===================== 타입 정의 (기존 유지) ===================== */
export interface UserInfo {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  token: string;
}

export type FirebaseSimpleUser = {
  uid: string;
  email: string | null;
  name: string | null;
  photoUrl: string | null;
  provider: string | null;
  isSignupComplete?: boolean;
};

type UserState = {
  userInfo: UserInfo;
  setUserInfo: (info: Partial<UserInfo>) => void;
  clearUserInfo: () => void;
  user: FirebaseSimpleUser | null;
  initialized: boolean;
  setFromFirebase: (u: FirebaseUser | null) => void;
  setUser: (u: FirebaseSimpleUser | null) => void;
  clearFirebaseUser: () => void;
  selectedJobType: string | null;
  setSelectedJobType: (type: string | null) => void;
  hydrateFromCookie: () => void;
  hydrateAuthFromStorage: () => void;
  refreshSignupStatus: () => Promise<void>;
  logout: () => Promise<void>;
};

/* ===================== 유틸리티 (기존 유지) ===================== */
// ... (EMPTY_USERINFO, saveAuthToStorage, loadAuthFromStorage, fetchAccountByEmail 등은 그대로 두세요) ...
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
  } catch {}
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

async function fetchAccountByEmail(email: string) {
  try {
    const res = await fetch('/api/accounts/find-by-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return null;
    return (await res.json()) as any;
  } catch (e) {
    console.error('fetchAccountByEmail error:', e);
    return null;
  }
}

/* ===================== Zustand Store ===================== */

export const useUserStore = create<UserState>((set, get) => ({
  userInfo: { ...EMPTY_USERINFO },
  setUserInfo: (info) => set((state) => ({ userInfo: { ...state.userInfo, ...info } })),
  clearUserInfo: () => set({ userInfo: { ...EMPTY_USERINFO } }),

  user: null,
  initialized: false,

  setFromFirebase: (fbUser) =>
    set((prev) => {
      if (!fbUser && prev.user && prev.user.provider === 'kakao') {
        return { ...prev, initialized: true };
      }
      if (!fbUser) {
        saveAuthToStorage(null);
        return { ...prev, user: null, userInfo: { ...EMPTY_USERINFO }, initialized: true };
      }

      const sameUser =
        prev.user?.provider === 'google' &&
        (prev.user.email === (fbUser.email ?? null) ||
          prev.user.uid === fbUser.uid ||
          prev.user.uid === `google:${fbUser.uid}`);

      const preservedSignupComplete =
        sameUser && typeof prev.user?.isSignupComplete === 'boolean'
          ? prev.user.isSignupComplete
          : undefined;

      const simple: FirebaseSimpleUser = {
        uid: `google:${fbUser.uid}`,
        email: fbUser.email ?? null,
        name: fbUser.displayName ?? null,
        photoUrl: fbUser.photoURL ?? null,
        provider: 'google',
        isSignupComplete: preservedSignupComplete,
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

  setUser: (user) =>
    set(() => {
      saveAuthToStorage(user);
      if (!user) {
        return { user: null, userInfo: { ...EMPTY_USERINFO }, initialized: true };
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

  clearFirebaseUser: () =>
    set(() => {
      saveAuthToStorage(null);
      return { user: null, userInfo: { ...EMPTY_USERINFO }, initialized: true };
    }),

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

  hydrateAuthFromStorage: () => {
    const stored = loadAuthFromStorage();
    if (!stored) {
      set({ initialized: true });
      return;
    }
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

  refreshSignupStatus: async () => {
    const st = get();
    const u = st.user;
    if (!u?.email) return;
    try {
      const acc = await fetchAccountByEmail(u.email);
      if (!acc) return;
      const isSignupComplete = acc.is_signup_complete === true;
      set((prev) => {
        if (!prev.user) return { ...prev };
        const nextUser: FirebaseSimpleUser = { ...prev.user!, isSignupComplete };
        saveAuthToStorage(nextUser);
        return { ...prev, user: nextUser };
      });
    } catch (e) {
      console.error('[userStore] refreshSignupStatus error:', e);
    }
  },

  // ✅ [수정 3] 로그아웃 구현 수정 (만들어둔 logoutFirebase 활용)
  logout: async () => {
    const current = get().user;

    // 1. 구글 로그인인 경우, 만들어둔 헬퍼 함수 호출
    if (current?.provider === 'google' || current?.uid.startsWith('google:')) {
      try {
        await logoutFirebase(); // ✅ 여기서 호출!
        console.log('[Store] Firebase signed out');
      } catch (e) {
        console.error('[Store] Firebase sign out failed', e);
      }
    }

    // 2. 스토어 상태 비우기
    get().clearFirebaseUser();
  },
}));

/* ===================== Init (기존 유지) ===================== */
let listenerStarted = false;

export function initUserStore() {
  if (typeof window === 'undefined') return;
  if (listenerStarted) return;
  listenerStarted = true;

  const { setFromFirebase, hydrateAuthFromStorage } = useUserStore.getState();
  hydrateAuthFromStorage();

  onFirebaseAuthChanged((u) => {
    setFromFirebase(u);
  });
}
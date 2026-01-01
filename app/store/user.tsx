// app/store/user.tsx
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
  isSignupComplete?: boolean; // ✅ 가입 완료 여부
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

  // ✅ 가입 완료 여부를 서버에서 재확인
  refreshSignupStatus: () => Promise<void>;
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

// ✅ 서버에서 계정 조회 (is_signup_complete 확인)
async function fetchAccountByEmail(email: string) {
  const res = await fetch('/api/accounts/find-by-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) return null;
  return (await res.json()) as any; // { is_signup_complete: boolean, ... }
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

    // ✅ "같은 유저"면, hydrate로 복원된 isSignupComplete를 유지
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
      uid: `google:${fbUser.uid}`,            // ✅ 형식 통일(중요)
      email: fbUser.email ?? null,
      name: fbUser.displayName ?? null,
      photoUrl: fbUser.photoURL ?? null,
      provider: 'google',
      isSignupComplete: preservedSignupComplete, // ✅ 유지
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

    // ✅ 저장된 값이 없어도 "초기화 완료"로 처리해야 UI가 안정적
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

  // ✅ 가입 완료 여부 서버에서 재확인 → store/localStorage 갱신
  refreshSignupStatus: async () => {
    const st = useUserStore.getState();
    const u = st.user;

    if (!u?.email) return;

    try {
      const acc = await fetchAccountByEmail(u.email);
      if (!acc) return;

      const isSignupComplete = acc.is_signup_complete === true;

      set((prev) => {
        if (!prev.user) return { ...prev, initialized: true };

        const nextUser: FirebaseSimpleUser = {
          ...prev.user,
          isSignupComplete,
        };

        // ✅ localStorage도 같이 갱신
        saveAuthToStorage(nextUser);

        return {
          ...prev,
          user: nextUser,
          initialized: true,
        };
      });
    } catch (e) {
      console.error('[userStore] refreshSignupStatus error:', e);
    }
  },
}));

/* ===================== Firebase 리스너 init ===================== */

let listenerStarted = false;

/**
 * 클라이언트에서 한 번만 호출하면
 * 1) localStorage에 저장된 로그인 정보 복원
 * 2) Firebase Auth(onAuthStateChanged)와 동기화
 * 3) 서버에서 가입완료 여부 재확인(is_signup_complete)
 */
export function initUserStore() {
  if (typeof window === 'undefined') return;
  if (listenerStarted) return;
  listenerStarted = true;

  console.log('[initUserStore] start');

  const { setFromFirebase, hydrateAuthFromStorage } = useUserStore.getState();

  hydrateAuthFromStorage();
  console.log('[initUserStore] after hydrate', useUserStore.getState().user);

  onFirebaseAuthChanged((u) => {
    console.log('[initUserStore] firebase auth changed:', u?.uid ?? null, u?.email ?? null);
    setFromFirebase(u);
    console.log('[initUserStore] after setFromFirebase', useUserStore.getState().user);
  });
}

'use client';

import { create } from 'zustand';
import Cookies from 'js-cookie';

export interface UserInfo {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  token: string;
}

type UserState = {
  userInfo: UserInfo;
  setUserInfo: (info: Partial<UserInfo>) => void;
  clearUserInfo: () => void;

  // ✅ 전문분야 타입: 미선택 상태를 안전하게 표현
  selectedJobType: string | null;
  setSelectedJobType: (type: string | null) => void;

  // ✅ 쿠키 → 스토어 하이드레이션 (초기 진입/새로고침 대비)
  hydrateFromCookie: () => void;
};

export const useUserStore = create<UserState>((set) => ({
  userInfo: {
    displayName: null,
    email: null,
    photoURL: null,
    token: '',
  },
  setUserInfo: (info) =>
    set((state) => ({ userInfo: { ...state.userInfo, ...info } })),
  clearUserInfo: () =>
    set(() => ({
      userInfo: { displayName: null, email: null, photoURL: null, token: '' },
    })),

  // ✅ 최초 값은 null (컨트롤러에서 hydrate 호출)
  selectedJobType: null,

  // ✅ 쿠키와 스토어를 함께 갱신
  setSelectedJobType: (type) => {
    if (type) Cookies.set('selectedJobType', type, { expires: 7 });
    else Cookies.remove('selectedJobType');
    set({ selectedJobType: type });
  },

  // ✅ 쿠키에서 불러와 스토어 초기화
  hydrateFromCookie: () => {
    const saved = Cookies.get('selectedJobType');
    set({ selectedJobType: saved ?? null });
  },
}));

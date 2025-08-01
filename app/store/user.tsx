// store/userInfo.ts
import { create } from 'zustand';

export interface UserInfo {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  token: string;
}

interface UserState {
  userInfo: UserInfo;
  setUserInfo: (info: Partial<UserInfo>) => void;
  clearUserInfo: () => void;
  selectedJobType: string;
  setSelectedJobType: (type: string) => void;
}

export const useUserStore = create<UserState>((set) => ({
  userInfo: {
    displayName: null,
    email: null,
    photoURL: null,
    token: '',
  },
  setUserInfo: (info) =>
    set((state) => ({
      userInfo: {
        ...state.userInfo,
        ...info,
      },
    })),
  clearUserInfo: () =>
    set(() => ({
      userInfo: {
        displayName: null,
        email: null,
        photoURL: null,
        token: '',
      },
    })),
  selectedJobType: '',
  setSelectedJobType: (type) => set({ selectedJobType: type }),
}));

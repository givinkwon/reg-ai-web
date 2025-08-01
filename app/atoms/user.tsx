import { atom } from 'recoil';

export interface UserInfo {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  token: string;
}

export const userInfoState = atom<UserInfo>({
  key: 'userInfoState',
  default: {
    displayName: null,
    email: null,
    photoURL: null,
    token: '',
  },
});

export const selectedJobTypeState = atom<string>({
  key: 'selectedJobTypeState',
  default: '',
});

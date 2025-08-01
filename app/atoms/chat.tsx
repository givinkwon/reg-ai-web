import { atom } from 'recoil';

export interface ChatMessage {
  type: 'user' | 'assistant'
  content: string
}

export const chatMessagesState = atom<ChatMessage[]>({
  key: 'chatMessagesState',
  default: [],
})

export const currentUserState = atom({
  key: 'currentUserState',
  default: { email: '', role: '' },
})

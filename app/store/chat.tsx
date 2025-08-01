// store/chat.ts
import { create } from 'zustand';

export interface ChatMessage {
  role: string;
  content: string;
}

interface ChatStore {
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  setMessages: (msgs) => set({ messages: msgs }),
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
}));

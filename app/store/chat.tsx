'use client';

import { create } from 'zustand';
import Cookies from 'js-cookie';

export interface ChatMessage {
  role: string;
  content: string;
}

export type Room = {
  id: string;
  title: string;            // 첫 질문 15자
  createdAt: number;
  messages: ChatMessage[];  // 쿠키 용량 보호: 최근 N개만 저장
};

const COOKIE_KEY = 'regai_rooms_v1';
const COOKIE_COLLAPSE = 'regai_sidebar_collapsed';
const MAX_MSG_PER_ROOM = 30;

interface ChatStore {
  // ===== 메시지(현재 활성 방의 메시지)
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;

  // ===== 채팅방(쿠키 저장/복원)
  rooms: Room[];
  activeRoomId: string | null;

  loadFromCookies: () => void;
  saveToCookies: () => void;

  createRoom: () => string;         // 새 방 생성 후 활성화 & messages 비움
  setActiveRoom: (id: string) => void;
  deleteRoom: (id: string) => void;

  setActiveRoomTitleIfEmpty: (title: string) => void; // 첫 질문 15자 제목
  appendToActive: (msg: ChatMessage) => void;         // rooms에도 메시지 반영
  getActiveRoom: () => Room | null;

  // ===== 좌측 패널 축소/확장
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;

  sidebarMobileOpen: boolean;
  setSidebarMobileOpen: (v: boolean) => void;

  // ===== 우측 패널(근거/서식 시트)
  rightOpen: boolean;
  setRightOpen: (v: boolean) => void;
  toggleRight: () => void;

  // (별칭) 기존 컴포넌트 호환용
  openRightPanel: (v: boolean) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // ===== 메시지
  messages: [],
  setMessages: (msgs) => {
    set({ messages: msgs });
    // 활성 방에도 반영
    const { activeRoomId, rooms } = get();
    if (!activeRoomId) return;
    const idx = rooms.findIndex((r) => r.id === activeRoomId);
    if (idx < 0) return;
    const next = [...rooms];
    next[idx] = { ...next[idx], messages: msgs.slice(-MAX_MSG_PER_ROOM) };
    set({ rooms: next });
    get().saveToCookies();
  },
  addMessage: (msg) =>
    set((state) => {
      const last = state.messages[state.messages.length - 1];
      // ✅ 같은 역할/내용 연속 저장 방지(중복 방지)
      if (last && last.role === msg.role && last.content === msg.content) return state;
      return { messages: [...state.messages, msg] };
    }),
  clearMessages: () => {
    set({ messages: [] });
    const { activeRoomId, rooms } = get();
    if (!activeRoomId) return;
    const idx = rooms.findIndex((r) => r.id === activeRoomId);
    if (idx < 0) return;
    const next = [...rooms];
    next[idx] = { ...next[idx], messages: [] };
    set({ rooms: next });
    get().saveToCookies();
  },

  // ===== 방/쿠키
  rooms: [],
  activeRoomId: null,

  loadFromCookies: () => {
    try {
      const raw = Cookies.get(COOKIE_KEY);
      const collapsed = Cookies.get(COOKIE_COLLAPSE);
      if (collapsed) set({ collapsed: collapsed === '1' });
      if (!raw) return;

      const parsed = JSON.parse(raw) as { rooms: Room[]; activeRoomId: string | null };
      const rooms = (parsed.rooms || []).map((r) => ({
        ...r,
        messages: Array.isArray(r.messages) ? r.messages : [],
      }));
      const activeRoomId = parsed.activeRoomId || rooms[0]?.id || null;

      set({
        rooms,
        activeRoomId,
        messages: rooms.find((r) => r.id === activeRoomId)?.messages || [],
      });
    } catch {
      /* noop */
    }
  },

  saveToCookies: () => {
    const { rooms, activeRoomId, collapsed } = get();
    Cookies.set(COOKIE_KEY, JSON.stringify({ rooms, activeRoomId }), { expires: 14 });
    Cookies.set(COOKIE_COLLAPSE, collapsed ? '1' : '0', { expires: 365 });
  },

  createRoom: () => {
    const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const room: Room = { id, title: '새 대화', createdAt: Date.now(), messages: [] };
    set((s) => ({ rooms: [room, ...s.rooms], activeRoomId: id, messages: [] }));
    get().saveToCookies();
    return id;
  },

  setActiveRoom: (id) => {
    const { rooms } = get();
    const r = rooms.find((x) => x.id === id);
    set({ activeRoomId: id, messages: r?.messages || [] });
    get().saveToCookies();
  },

  deleteRoom: (id) => {
    set((s) => {
      const filtered = s.rooms.filter((r) => r.id !== id);
      const nextActive = s.activeRoomId === id ? (filtered[0]?.id ?? null) : s.activeRoomId;
      return {
        rooms: filtered,
        activeRoomId: nextActive,
        messages: nextActive ? filtered.find((r) => r.id === nextActive)?.messages || [] : [],
      };
    });
    get().saveToCookies();
  },

  setActiveRoomTitleIfEmpty: (title) => {
    set((s) => {
      const idx = s.rooms.findIndex((r) => r.id === s.activeRoomId);
      if (idx < 0) return s;
      const r = s.rooms[idx];
      if (r.title && r.title !== '새 대화') return s;
      const next = [...s.rooms];
      next[idx] = { ...r, title: title.trim().slice(0, 15) || '새 대화' };
      return { ...s, rooms: next };
    });
    get().saveToCookies();
  },

  appendToActive: (msg) => {
    set((s) => {
      if (!s.activeRoomId) return s;
      const idx = s.rooms.findIndex((r) => r.id === s.activeRoomId);
      if (idx < 0) return s;
      const r = s.rooms[idx];
      const msgs = [...r.messages, msg].slice(-MAX_MSG_PER_ROOM);
      const next = [...s.rooms];
      next[idx] = { ...r, messages: msgs };
      return { ...s, rooms: next };
    });
    get().saveToCookies();
  },

  getActiveRoom: () => {
    const { rooms, activeRoomId } = get();
    return rooms.find((r) => r.id === activeRoomId) ?? null;
  },

  // ===== 좌측 패널 축소/확장
  collapsed: false,
  setCollapsed: (v) => {
    set({ collapsed: v });
    get().saveToCookies();
  },

  sidebarMobileOpen: false,
  setSidebarMobileOpen: (v) => set({ sidebarMobileOpen: v }),

  // ===== 우측 패널(근거/서식) — 전역 UI 상태
  rightOpen: false,
  setRightOpen: (v) => set({ rightOpen: v }),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),

  // (별칭) 기존 컴포넌트 호환
  openRightPanel: (v: boolean) => set({ rightOpen: v }),
}));

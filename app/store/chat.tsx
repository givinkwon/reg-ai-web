'use client';

import { create } from 'zustand';
import Cookies from 'js-cookie';

/* =========================
 * Types
 * ========================= */
export interface ChatMessage {
  role: string;
  content: string; // HTML 가능
}

export type Room = {
  id: string;
  title: string;            // 첫 질문 15자
  createdAt: number;
  messages: ChatMessage[];  // 쿠키 용량 보호: 최근 N개만 저장
};

export type EvidenceItem = {
  title: string;
  href?: string;
  snippet?: string;
};

export type RightPanelData = {
  evidence: EvidenceItem[]; // 답변 근거(조문/고시/시행규칙 등)
  forms: EvidenceItem[];    // 관련 별표/서식
  rawHtml?: string;         // 원문 저장(재파싱/디버그용)
};

/* =========================
 * Const
 * ========================= */
const COOKIE_KEY = 'regai_rooms_v1';
const COOKIE_COLLAPSE = 'regai_sidebar_collapsed';
const MAX_MSG_PER_ROOM = 30;

/* =========================
 * Parsing helpers (answer -> evidence/forms)
 * ========================= */

// HTML → plain text
const htmlToText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();

// URL 추출
const findUrls = (s: string) => (s.match(/https?:\/\/[^\s)]+/g) || []).slice(0, 50);

// 제목 다듬기
const cleanTitle = (s: string) =>
  s
    .replace(/^[\-\•\d\)\. ]{0,4}/, '')
    .replace(/\s+/g, ' ')
    .trim();

// “관련 별표/서식” 섹션 파싱
const parseForms = (txt: string): EvidenceItem[] => {
  const lines = txt.split('\n');
  const idx = lines.findIndex((l) => /관련\s*별표\s*\/?\s*서식/i.test(l));
  if (idx < 0) return [];
  const out: EvidenceItem[] = [];
  for (let k = idx + 1; k < lines.length; k++) {
    const ln = lines[k].trim();
    if (!ln) continue;
    // 다음 섹션/헤더 추정되면 종료
    if (/^\d+\)\s|^#{2,}|^\*\*/.test(ln) && k > idx + 1) break;

    const url = findUrls(ln)[0];
    const title = cleanTitle(ln.replace(url || '', ''));
    if (title) out.push({ title, href: url });
  }
  return out;
};

// “근거” 섹션(조문/고시/시행규칙 등) 파싱
const parseEvidence = (txt: string): EvidenceItem[] => {
  const lines = txt.split('\n');

  // 1) “2) 근거” 같은 섹션 헤더 먼저 시도
  let i = lines.findIndex(
    (l) => /(근거)(\s*[:：])?$/i.test(l) || /^\s*\d+\)\s*근거/.test(l)
  );

  // 1-1) 없으면 전체에서 조문/고시 패턴만 스캔 (fallback)
  if (i < 0) {
    const candidates = lines.filter((l) =>
      /(법|령|시행규칙|고시|조|항|호|부칙|별표)/.test(l) || /제\d+조/.test(l)
    );
    return candidates.map((ln) => {
      const url = findUrls(ln)[0];
      const title = cleanTitle(ln.replace(url || '', ''));
      return { title, href: url };
    });
  }

  // 2) “근거” 섹션 안의 항목만 수집
  const out: EvidenceItem[] = [];
  for (let k = i + 1; k < lines.length; k++) {
    const ln = lines[k].trim();
    if (!ln) continue;

    // “관련 별표/서식” 섹션 시작되면 종료
    if (/관련\s*별표\s*\/?\s*서식/i.test(ln)) break;
    // 다음 상위 섹션으로 넘어가면 종료
    if (/^\d+\)\s/.test(ln) && k > i + 1) break;

    // 항목 라인
    if (/^[\-\•\d\)\. ]/.test(ln) || /(제\d+조|\[.*?\])/.test(ln)) {
      const url = findUrls(ln)[0];
      const title = cleanTitle(ln.replace(url || '', ''));
      if (title) out.push({ title, href: url });
    }
  }
  return out;
};

/* =========================
 * Store
 * ========================= */
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
  openRightPanel: (v: boolean) => void; // (별칭) 기존 컴포넌트 호환용

  // ===== 우측 패널 컨텐츠(파싱 결과)
  rightData: RightPanelData | null;
  setRightData: (d: RightPanelData | null) => void;

  // 현재 답변(HTML)로부터 파싱해서 패널 열기
  openRightFromHtml: (html: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  /* ===== 메시지 ===== */
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

  /* ===== 방/쿠키 ===== */
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

  /* ===== 좌측 패널 축소/확장 ===== */
  collapsed: false,
  setCollapsed: (v) => {
    set({ collapsed: v });
    get().saveToCookies();
  },

  sidebarMobileOpen: false,
  setSidebarMobileOpen: (v) => set({ sidebarMobileOpen: v }),

  /* ===== 우측 패널(근거/서식) — 전역 UI 상태 + 데이터 ===== */
  rightOpen: false,
  setRightOpen: (v) => set({ rightOpen: v }),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  openRightPanel: (v: boolean) => set({ rightOpen: v }), // 별칭(기존 호환)

  rightData: null,
  setRightData: (d) => set({ rightData: d }),

  openRightFromHtml: (html: string) => {
    const txt = htmlToText(html);
    const evidence = parseEvidence(txt);
    const forms = parseForms(txt);
    set({
      rightData: { evidence, forms, rawHtml: html },
      rightOpen: true,
    });
  },
}));

'use client';

import { create } from 'zustand';
import Cookies from 'js-cookie';

/* =========================
 * Types
 * ========================= */
export interface ChatMessage { role: string; content: string; } // content는 HTML
export type Room = { id: string; title: string; createdAt: number; messages: ChatMessage[]; };

export type EvidenceItem = { title: string; href?: string; snippet?: string; };
export type RightPanelData = {
  evidence: EvidenceItem[];
  forms: EvidenceItem[];
  rawHtml?: string;
  debug?: {
    stripped: string;
    normalized: string;
    evBlock: string;
    formsBlock: string;
    evidencePreview: string[];
    formsPreview: string[];
  };
};

/* =========================
 * Const
 * ========================= */
// NOTE: rooms/messages는 localStorage로 옮기므로 COOKIE_KEY는 더이상 사용하지 않음
const COOKIE_COLLAPSE = 'regai_sidebar_collapsed';
const STORAGE_KEY = 'regai_rooms_v1';
const MAX_MSG_PER_ROOM = 30;

/* =========================
 * Storage helpers (localStorage)
 * ========================= */
const storage = {
  get(): { rooms: Room[]; activeRoomId: string | null } | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[storage.get] failed:', e);
      return null;
    }
  },
  set(payload: { rooms: Room[]; activeRoomId: string | null }) {
    if (typeof window === 'undefined') return;
    try {
      // 방어: 메시지 개수/길이 제한
      const safeRooms = (payload.rooms || []).map((r) => ({
        ...r,
        messages: (r.messages || [])
          .slice(-MAX_MSG_PER_ROOM)
          .map((m) => ({
            ...m,
            content:
              typeof m.content === 'string' && m.content.length > 40000
                ? m.content.slice(0, 40000) + '…'
                : m.content,
          })),
      }));
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ rooms: safeRooms, activeRoomId: payload.activeRoomId })
      );
    } catch (e) {
      console.warn('[storage.set] failed:', e);
    }
  },
};

/* =========================
 * Helpers (with LOG)
 * ========================= */

// 1) HTML → 텍스트(줄바꿈/불릿을 최대한 보존) + “태그가 아닌 <...>” 보호
const stripHtml = (html: string) => {
  let s = html
    .replace(/<(br|BR)\s*\/?>/g, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n');
  // 태그가 아닌 꺾쇠: <제1234호, 2023.7.19> → 〈제1234호, 2023.7.19〉
  s = s.replace(/<([^a-zA-Z\/!][^>]*)>/g, '〈$1〉');
  // 진짜 태그 제거
  s = s.replace(/<[^>]+>/g, '');
  // 엔티티/개행 정리
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\r/g, '')
    .trim();
};

// 2) 정규화(공백/문자 통일)
const normalize = (t: string) =>
  t
    .replace(/[–—‒－―]/g, '-')      // 대시 통일
    .replace(/[·•∙◦]/g, '-')       // 불릿 통일
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .split('\n').map((l) => l.trimEnd()).join('\n')
    .trim();

// ✅ 공통 URL 정리 유틸
const normalizeUrl = (u: string) => {
  if (!u) return u;
  // 꼬리문자 잘라내기
  let clean = u.replace(/[)\]\u3009>.,]+$/u, '');
  // 특정 도메인은 https로 승격
  try {
    const url = new URL(clean);
    if (
      /^law\.go\.kr$/i.test(url.hostname) ||
      /^www\.law\.go\.kr$/i.test(url.hostname)
    ) {
      url.protocol = 'https:';
      clean = url.toString();
    }
    return clean;
  } catch {
    return clean;
  }
};

// URL 추출
const urlOf = (s: string): string | undefined => {
  if (!s) return undefined;
  const m = s.match(/\bhttps?:\/\/[^\s)"'>\]]+/i);
  return m ? normalizeUrl(m[0]) : undefined;
};

const cleanTitle = (s: string) =>
  s.replace(/^[\-\•\u2022\d\)\.\s]{0,4}/, '').replace(/\s+/g, ' ').trim();

// `A: B` 패턴 쪼개기
const splitByColon = (line: string) => {
  const m = line.match(/^(.+?)\s*[:：]\s*(.+)$/);
  return m
    ? { left: m[1].trim(), right: m[2].trim() }
    : { left: line.trim(), right: undefined };
};

/* ── 공통 섹션 잘라내기: 헤더가 포함된 "라인"부터 다음 섹션 직전까지 ── */
const cutSection = (text: string, headerRe: RegExp, nextRe: RegExp): string => {
  const m = text.match(
    new RegExp(
      `^.*${headerRe.source}.*$`,
      headerRe.flags.includes('m') ? headerRe.flags : headerRe.flags + 'm'
    )
  );
  if (!m) return '';
  const startIdx = text.indexOf(m[0]);
  const rest = text.slice(startIdx);
  const next = rest.search(nextRe);
  return next === -1 ? rest : rest.slice(0, next);
};

/* ── 근거/서식 섹션 추출 ── */
/* 근거: '2) 근거' 라인부터 아이콘(🔗) 이전까지 그대로 */
const cutEvidenceBlock = (text: string) => {
  // 🔗 이전까지만 파싱 범위
  const iconIdx = text.indexOf('🔗');
  const scope = iconIdx >= 0 ? text.slice(0, iconIdx) : text;

  // 라인 전체가 정확히 "2) 근거" (필요시 2. / ②도 허용하고 싶으면 정규식 확장)
  const headerLineRe = /^\s*2\)\s*근거\s*$/m;

  const m = scope.match(headerLineRe);
  if (!m) return '';

  // 헤더 라인의 시작부터 끝까지(아이콘 상한으로 이미 컷팅)
  const start = m.index ?? 0;
  const block = scope.slice(start).trim();
  return block;
};

const cutFormsBlock = (text: string) => {
  // "관련 별표/서식", "관련 별표/서식 링크", "관련 별표", "관련 서식" 모두 허용
  const headerRe = /관련\s*(?:별표(?:\s*\/?\s*서식)?|서식)(?:\s*링크)?/iu;
  const nextRe = /\n\s*(?:###|답변\b|근거\b|\d+\))/iu;
  return cutSection(text, headerRe, nextRe);
};

/* ── 근거 라인 파싱 ── */
const parseEvidenceLine = (raw: string): EvidenceItem | null => {
  const url = urlOf(raw);
  const base = url ? raw.replace(url, '').trim() : raw;

  // “〔법〕 …” 또는 “[법] …”
  const lawM = base.match(/(〔.+?〕|\[.+?\])/);
  const { left, right } = splitByColon(base);

  if (lawM) {
    const law = lawM[1].trim();
    const afterLaw = left.slice((lawM.index ?? 0) + law.length).trim(); // 제10조(…)
    const title = cleanTitle(afterLaw ? `${law} ${afterLaw}` : law);
    const snippet = right?.trim() || undefined;
    return { title, href: url, snippet };
  }

  // 그 외(제n조 …)
  const title = cleanTitle(left);
  const snippet = right?.trim() || undefined;
  return title ? { title, href: url, snippet } : null;
};

const parseEvidenceLines = (block: string): EvidenceItem[] => {
  const lines = block.split('\n').map((x) => x.trim()).filter(Boolean);

  // 후보 라인(불릿/번호/〔…〕/[…]/제n조…/부칙…)
  let candidates = lines.filter((x) =>
    /^(-|\d+[\)\.]|〔.+?〕|\[.+?\]|제\d+조|부칙)/.test(x)
  );

  const items: EvidenceItem[] = [];
  for (const raw of candidates) {
    const cleaned = cleanTitle(raw);
    const item = parseEvidenceLine(cleaned);
    if (item && item.title) items.push(item);
  }

  // 후보가 0이면, 근거 블록 전체에서 〔…〕 또는 […]: … 형태를 스캔(fallback)
  if (items.length === 0) {
    const fallback = block.match(/(〔.+?〕|\[.+?\]).+?(?::\s*.+)?/g) || [];
    for (const raw of fallback) {
      const item = parseEvidenceLine(cleanTitle(raw));
      if (item && item.title) items.push(item);
    }
  }

  return items;
};

/* ── 서식 파싱(번호줄 + 다음줄 URL) ── */
/* ── 서식 파싱(번호줄 + 다음줄 URL) ── */
const parseFormsList = (block: string): EvidenceItem[] => {
  const lines = block.split('\n').map((x) => x.trim()).filter(Boolean);

  const items: EvidenceItem[] = [];
  let cur: EvidenceItem | null = null;

  for (const ln of lines) {
    // 0) URL-only 라인(예: "- http://...")을 먼저 처리: 새 아이템 만들지 말고 현재 아이템 href에만 붙이기
    const onlyUrl = ln.match(/^-?\s*(https?:\/\/[^\s)"'>\]]+)/i);
    if (onlyUrl) {
      if (cur) cur.href = normalizeUrl(onlyUrl[1]);
      continue;
    }

    // 1) 번호 헤더만 새 아이템으로 (불릿 '-' 는 제외)
    const head = ln.match(/^(\d+[.)])\s*(.+)$/);  // "1. " 또는 "1) " 허용
    if (head) {
      if (cur) items.push(cur);

      // 헤더 텍스트에 URL이 섞여있으면 제거 후 title만 남기기
      const inlineUrl = urlOf(head[2]);
      const titleOnly = inlineUrl ? head[2].replace(inlineUrl, '').trim() : head[2];

      cur = { title: cleanTitle(titleOnly) };
      if (inlineUrl) cur.href = normalizeUrl(inlineUrl);
      continue;
    }

    // 2) 일반 텍스트 라인: URL을 제거한 텍스트만 제목에 이어붙이기
    if (cur && !/^관련\s*(?:별표|서식)/.test(ln)) {
      const inlineUrl = urlOf(ln);
      const textOnly = inlineUrl ? ln.replace(inlineUrl, '').trim() : ln;
      if (textOnly) cur.title = cleanTitle(`${cur.title} ${textOnly}`);
      continue;
    }
  }

  if (cur) items.push(cur);
  return items;
};


/* ── 최종 파서 (디버그 로그 포함) ── */
const parseRightDataFromHtml = (html: string): RightPanelData => {
  console.groupCollapsed('%c[RightPanel Parser] START','color:#2388ff');
  console.log('raw html:', html);

  const stripped = stripHtml(html);
  console.log('step1.stripHtml:', stripped);

  const normalized = normalize(stripped);
  console.log('step2.normalize:', normalized);

  const evBlock = cutEvidenceBlock(normalized);
  const formsBlock = cutFormsBlock(normalized);
  console.log('step3.evBlock:', evBlock);
  console.log('step3.formsBlock:', formsBlock);

  // 라인 미리보기(디버깅용)
  const evidencePreview = evBlock ? evBlock.split('\n').map((x)=>x.trim()).filter(Boolean) : [];
  const formsPreview = formsBlock ? formsBlock.split('\n').map((x)=>x.trim()).filter(Boolean) : [];
  console.log('evidencePreview:', evidencePreview);
  console.log('formsPreview:', formsPreview);

  const evidence = evBlock ? parseEvidenceLines(evBlock) : [];
  const forms = formsBlock ? parseFormsList(formsBlock) : [];

  console.log('step4.parsed.evidence:', evidence);
  console.log('step4.parsed.forms:', forms);
  console.groupEnd();

  return {
    evidence, forms, rawHtml: html,
    debug: { stripped, normalized, evBlock, formsBlock, evidencePreview, formsPreview },
  };
};

/* =========================
 * Store
 * ========================= */
interface ChatStore {
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;

  rooms: Room[];
  activeRoomId: string | null;
  loadFromCookies: () => void;     // 내부 구현은 localStorage 사용
  saveToCookies: () => void;       // 내부 구현은 localStorage 사용 + 쿠키(접힘만)
  createRoom: () => string;
  setActiveRoom: (id: string) => void;
  deleteRoom: (id: string) => void;
  setActiveRoomTitleIfEmpty: (title: string) => void;
  appendToActive: (msg: ChatMessage) => void;
  getActiveRoom: () => Room | null;

  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  sidebarMobileOpen: boolean;
  setSidebarMobileOpen: (v: boolean) => void;

  rightOpen: boolean;
  setRightOpen: (v: boolean) => void;
  toggleRight: () => void;
  openRightPanel: (v: boolean) => void;

  rightData: RightPanelData | null;
  setRightData: (d: RightPanelData | null) => void;

  // ✅ 여기서 파서를 호출하고 패널을 띄움
  openRightFromHtml: (html: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  /* 메시지 */
  messages: [],
  setMessages: (msgs) => {
    set({ messages: msgs });
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

  /* 방/저장 */
  rooms: [],
  activeRoomId: null,
  loadFromCookies: () => {
    try {
      // 1) 작은 플래그는 쿠키에서
      const collapsed = Cookies.get(COOKIE_COLLAPSE);
      if (collapsed) set({ collapsed: collapsed === '1' });

      // 2) 방/메시지는 localStorage에서
      const stored = storage.get();
      if (!stored) return;

      const rooms = (stored.rooms || []).map((r) => ({
        ...r,
        messages: Array.isArray(r.messages) ? r.messages : [],
      }));
      const activeRoomId = stored.activeRoomId || rooms[0]?.id || null;
      set({
        rooms,
        activeRoomId,
        messages: rooms.find((r) => r.id === activeRoomId)?.messages || [],
      });
    } catch (e) {
      console.warn('[loadFromCookies] failed:', e);
    }
  },
  saveToCookies: () => {
    const { rooms, activeRoomId, collapsed } = get();
    // 1) 큰 데이터는 localStorage
    storage.set({ rooms, activeRoomId });
    // 2) 작은 플래그만 쿠키
    try {
      Cookies.set(COOKIE_COLLAPSE, collapsed ? '1' : '0', { expires: 365 });
    } catch {}
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

  /* 패널/데이터 */
  collapsed: false,
  setCollapsed: (v) => { set({ collapsed: v }); get().saveToCookies(); },
  sidebarMobileOpen: false,
  setSidebarMobileOpen: (v) => set({ sidebarMobileOpen: v }),

  rightOpen: false,
  setRightOpen: (v) => set({ rightOpen: v }),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  openRightPanel: (v: boolean) => set({ rightOpen: v }),

  rightData: null,
  setRightData: (d) => set({ rightData: d }),

  openRightFromHtml: (html: string) => {
    if (!html) { console.warn('[openRightFromHtml] empty html'); return; }
    const data = parseRightDataFromHtml(html);
    set({ rightData: data, rightOpen: true });
  },
}));

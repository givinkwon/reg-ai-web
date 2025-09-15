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
const COOKIE_KEY = 'regai_rooms_v1';
const COOKIE_COLLAPSE = 'regai_sidebar_collapsed';
const MAX_MSG_PER_ROOM = 30;

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

const urlOf = (s: string) => (s.match(/https?:\/\/[^\s)]+/i) || [])[0] || undefined;
const cleanTitle = (s: string) => s.replace(/^[\-\•\u2022\d\)\.\s]{0,4}/, '').replace(/\s+/g, ' ').trim();

// `A: B` 패턴 쪼개기
const splitByColon = (line: string) => {
  const m = line.match(/^(?<left>.+?)\s*[:：]\s*(?<right>.+)$/);
  return m?.groups
    ? { left: m.groups.left.trim(), right: m.groups.right.trim() }
    : { left: line.trim(), right: undefined };
};

/* ── 공통 섹션 잘라내기: 헤더가 포함된 "라인"부터 다음 섹션 직전까지 ── */
const cutSection = (text: string, headerRe: RegExp, nextRe: RegExp): string => {
  // 헤더가 들어있는 라인 전체를 찾는다 (multiline)
  const m = text.match(new RegExp(`^.*${headerRe.source}.*$`, headerRe.flags.includes('m') ? headerRe.flags : headerRe.flags + 'm'));
  if (!m) return '';
  const startIdx = text.indexOf(m[0]);
  const rest = text.slice(startIdx);
  const next = rest.search(nextRe);
  return next === -1 ? rest : rest.slice(0, next);
};

/* ── 근거/서식 섹션 추출 ── */
const cutEvidenceBlock = (text: string) => {
  // "근거", "2) 근거", "근거:" 등 대부분 허용
  const headerRe = /\b근거\b/iu;

  // 다음 섹션 후보: 관련 별표/서식(링크), 관련 별표, 서식, ###, 답변, 숫자) …
  const nextRe = /\n\s*(?:관련\s*(?:별표(?:\s*\/?\s*서식)?|서식)(?:\s*링크)?|###|답변\b|\d+\))/iu;

  let block = cutSection(text, headerRe, nextRe);
  if (block) return block;

  // fallback: 마지막 "근거"부터 끝까지라도
  const i = text.lastIndexOf('근거');
  return i >= 0 ? text.slice(i) : '';
};

const cutFormsBlock = (text: string) => {
  // "관련 별표/서식", "관련 별표/서식 링크", "관련 별표", "관련 서식" 모두 허용
  const headerRe = /관련\s*(?:별표(?:\s*\/?\s*서식)?|서식)(?:\s*링크)?/iu;
  const nextRe = /\n\s*(?:###|답변\b|근거\b|\d+\))/iu;
  return cutSection(text, headerRe, nextRe);
};

/* ── 근거 라인 파싱 ── */
const parseEvidenceLine = (raw: string): EvidenceItem | null => {
  // URL 제거 전 저장
  const url = urlOf(raw);
  const base = url ? raw.replace(url, '').trim() : raw;

  // “〔법〕 …” 또는 “[법] …”
  const lawM = base.match(/(〔.+?〕|\[.+?\])/);
  const { left, right } = splitByColon(base);

  if (lawM) {
    const law = lawM[1].trim();                                   // 〔화학물질관리법〕
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

  console.log('[parseEvidenceLines] candidates:', candidates);

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
const parseFormsList = (block: string): EvidenceItem[] => {
  const lines = block.split('\n').map((x) => x.trim()).filter(Boolean);

  const items: EvidenceItem[] = [];
  let cur: EvidenceItem | null = null;

  for (const ln of lines) {
    const head = ln.match(/^(\d+\.|-)\s*(.+)$/);
    if (head) {
      if (cur) items.push(cur);
      cur = { title: cleanTitle(head[2]) };
      continue;
    }
    const u = urlOf(ln);
    if (u && cur) { cur.href = u; continue; }
    if (cur && !/^관련\s*(?:별표|서식)/.test(ln)) cur.title = cleanTitle(`${cur.title} ${ln}`);
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
  loadFromCookies: () => void;
  saveToCookies: () => void;
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

  /* 방/쿠키 */
  rooms: [],
  activeRoomId: null,
  loadFromCookies: () => {
    try {
      const raw = Cookies.get(COOKIE_KEY);
      const collapsed = Cookies.get(COOKIE_COLLAPSE);
      if (collapsed) set({ collapsed: collapsed === '1' });
      if (!raw) return;
      const parsed = JSON.parse(raw) as { rooms: Room[]; activeRoomId: string | null };
      const rooms = (parsed.rooms || []).map((r) => ({ ...r, messages: Array.isArray(r.messages) ? r.messages : [] }));
      const activeRoomId = parsed.activeRoomId || rooms[0]?.id || null;
      set({ rooms, activeRoomId, messages: rooms.find((r) => r.id === activeRoomId)?.messages || [] });
    } catch {}
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

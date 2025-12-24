'use client';

import { create } from 'zustand';
import Cookies from 'js-cookie';

/* =========================
 * Types
 * ========================= */
export interface ChatMessage {
  role: string;
  content: string; // content는 HTML
}
export type Room = {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
};

export type EvidenceItem = { title: string; href?: string; snippet?: string };

// 🔹 패널 모드 타입
export type RightPanelMode = 'evidence' | 'news' | 'lawNotice' | 'accident';

export type RightPanelData = {
  // 🔹 모드 (없으면 기본은 evidence로 취급)
  mode?: RightPanelMode;

  evidence: EvidenceItem[];
  forms: EvidenceItem[];

  // 원본 HTML (디버깅용)
  rawHtml?: string;

  // 🔹 뉴스/입법예고일 때 참고 섹션 HTML
  newsHtml?: string;

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
        JSON.stringify({
          rooms: safeRooms,
          activeRoomId: payload.activeRoomId,
        }),
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
    .replace(/[–—‒－―]/g, '-') // 대시 통일
    .replace(/[·•∙◦]/g, '-') // 불릿 통일
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
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
      headerRe.flags.includes('m') ? headerRe.flags : headerRe.flags + 'm',
    ),
  );
  if (!m) return '';
  const startIdx = text.indexOf(m[0]);
  const rest = text.slice(startIdx);
  const next = rest.search(nextRe);
  return next === -1 ? rest : rest.slice(0, next);
};

/* ── 공통 유틸 ── */
const minPositive = (...xs: number[]) => {
  const v = xs.filter((n) => n >= 0);
  return v.length ? Math.min(...v) : -1;
};

const findFirstMatchIndex = (text: string, res: RegExp[]) => {
  let best = -1;
  for (const re of res) {
    const idx = text.search(re);
    if (idx >= 0) best = best === -1 ? idx : Math.min(best, idx);
  }
  return best;
};

/* ── 근거/서식 섹션 추출 ── */
const cutEvidenceBlock = (text: string) => {
  // 0) 파싱 범위: 🔗 이전까지만
  const iconIdx = text.indexOf('🔗');
  const scope = iconIdx >= 0 ? text.slice(0, iconIdx) : text;

  // 1) 헤더 후보(기존 2) 근거 + 신규 **근거** + 신규 ##/### 근거)
  const headerRes: RegExp[] = [
    /^\s*(?:2\)|2\.|②)\s*근거\s*$/m,                // 기존
    /^\s*(?:\*\*+)?\s*근거\s*(?:\*\*+)?\s*$/m,      // **근거**
    /^\s*#{2,6}\s*근거\s*$/m,                       // ## 근거 / ### 근거
  ];

  const start = findFirstMatchIndex(scope, headerRes);
  if (start < 0) return '';

  // 2) 근거 블록의 끝(다음 섹션 헤더가 나오면 거기서 끊기)
  const tail = scope.slice(start);

  const endRes: RegExp[] = [
    /^\s*(?:3\)|3\.|③)\s*\S+/m,
    /^\s*(?:4\)|4\.|④)\s*\S+/m,
    /^\s*(?:5\)|5\.|⑤)\s*\S+/m,
    /^\s*(?:\*\*+)?\s*관련\s*(?:별표(?:\s*\/?\s*서식)?|서식)(?:\s*링크)?\s*(?:\*\*+)?\s*$/mi,
    /^\s*(?:\*\*+)?\s*참고\s*기사\s*목록\s*(?:\*\*+)?\s*$/mi,
    /^\s*(?:\*\*+)?\s*참고\s*사고사례\s*(?:\*\*+)?\s*$/mi,
    /^\s*#{2,6}\s*(?:관련\s*(?:별표|서식)|참고\s*기사\s*목록|참고\s*사고사례)\s*$/mi,
  ];

  let end = tail.length;
  for (const re of endRes) {
    const idx = tail.search(re);
    if (idx > 0) end = Math.min(end, idx);
  }

  return tail.slice(0, end).trim();
};


// "관련 별표/서식"이 있으면 그걸 우선 쓰고,
// 없으면 "참고 기사 목록"을 forms 블록으로 사용한다.
const cutFormsBlock = (text: string) => {
  // 1) 기존: 관련 별표/서식 섹션
  const headerRe1 = /관련\s*(?:별표(?:\s*\/?\s*서식)?|서식)(?:\s*링크)?/iu;
  const nextRe = /\n\s*(?:###|답변\b|근거\b|\d+\))/iu;

  const block1 = cutSection(text, headerRe1, nextRe);
  if (block1 && block1.trim().length > 0) {
    return block1;
  }

  // 2) 신규: 참고 기사 목록 섹션 (요즘 나온 답변 형태)
  const headerRe2 = /참고\s*기사\s*목록/iu;
  const block2 = cutSection(text, headerRe2, nextRe);
  return block2;
};

/* ── 마크다운/불릿 장식 제거 ── */
const stripMdDecorations = (s: string) => {
  return (s || '')
    .trim()
    // 앞쪽 불릿/번호 제거 (*, -, •, 1), 1. 등)
    .replace(/^\s*(?:[-*•]|(?:\d+[\)\.]))\s+/, '')
    // 굵게 **...** 제거(내용은 유지)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    // 인라인 코드 `...` 제거(내용은 유지)
    .replace(/`([^`]+)`/g, '$1')
    // 남아있는 ** 토큰 제거(비정형 대비)
    .replace(/\*\*/g, '')
    .trim();
};

/* ── 근거 라인 파싱 ── */
const parseEvidenceLine = (raw: string): EvidenceItem | null => {
  const url = urlOf(raw);
  const base0 = url ? raw.replace(url, '').trim() : raw;

  // ✅ 불릿/마크다운 제거 후 파싱
  const base = stripMdDecorations(base0);

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
  const lines = block
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

  // ✅ 라인 정규화(불릿/마크다운 제거)
  const normalized = lines.map(stripMdDecorations).filter(Boolean);

  // ✅ 후보 라인: 〔…〕 / […] / 제n조 / 부칙 / (또는 여전히 남아있는 -,* 등)
  const candidates = normalized.filter((x) =>
    /^(〔.+?〕|\[.+?\]|제\d+조|부칙)/.test(x),
  );

  const items: EvidenceItem[] = [];
  for (const raw of candidates) {
    const item = parseEvidenceLine(raw);
    if (item?.title) items.push(item);
  }

  // 후보가 0이면 fallback(정규화된 블록 전체에서 스캔)
  if (items.length === 0) {
    const scan = stripMdDecorations(block);
    const fallback = scan.match(/(〔.+?〕|\[.+?\]).+?(?::\s*.+)?/g) || [];
    for (const raw of fallback) {
      const item = parseEvidenceLine(raw);
      if (item?.title) items.push(item);
    }
  }

  return items;
};

/* ── 서식 파싱(번호줄 + 다음줄 URL) ── */
const parseFormsList = (block: string): EvidenceItem[] => {
  const lines = block
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

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
    const head = ln.match(/^(\d+[.)])\s*(.+)$/); // "1. " 또는 "1) " 허용
    if (head) {
      if (cur) items.push(cur);

      // 헤더 텍스트에 URL이 섞여있으면 제거 후 title만 남기기
      const inlineUrl = urlOf(head[2]);
      const titleOnly = inlineUrl
        ? head[2].replace(inlineUrl, '').trim()
        : head[2];

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
  console.groupCollapsed('%c[RightPanel Parser] START', 'color:#2388ff');
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
  const evidencePreview = evBlock
    ? evBlock
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  const formsPreview = formsBlock
    ? formsBlock
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  console.log('evidencePreview:', evidencePreview);
  console.log('formsPreview:', formsPreview);

  const evidence = evBlock ? parseEvidenceLines(evBlock) : [];
  const forms = formsBlock ? parseFormsList(formsBlock) : [];

  console.log('step4.parsed.evidence:', evidence);
  console.log('step4.parsed.forms:', forms);
  console.groupEnd();

  return {
    evidence,
    forms,
    rawHtml: html,
    debug: {
      stripped,
      normalized,
      evBlock,
      formsBlock,
      evidencePreview,
      formsPreview,
    },
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
  updateLastAssistant: (content: string) => void; 

  rooms: Room[];
  activeRoomId: string | null;
  loadFromCookies: () => void; // 내부 구현은 localStorage 사용
  saveToCookies: () => void; // 내부 구현은 localStorage 사용 + 쿠키(접힘만)
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
  openRightFromHtml: (html: string, opts?: { mode?: RightPanelMode }) => void;

  // ✅ 로그인 모달 전역 상태
  showLoginModal: boolean;
  setShowLoginModal: (open: boolean) => void;
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
    next[idx] = {
      ...next[idx],
      messages: msgs.slice(-MAX_MSG_PER_ROOM),
    };
    set({ rooms: next });
    get().saveToCookies();
  },
  addMessage: (msg) =>
    set((state) => {
      const last = state.messages[state.messages.length - 1];
      if (last && last.role === msg.role && last.content === msg.content)
        return state;
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

  // 마지막 assistant 말풍선의 content만 교체
  updateLastAssistant: (content: string) =>
    set((state) => {
      const msgs = [...state.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content };
          break;
        }
      }
      return { messages: msgs };
    }),
    
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
        // activeRoomId,
        // messages: rooms.find((r) => r.id === activeRoomId)?.messages || [],
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
      Cookies.set(COOKIE_COLLAPSE, collapsed ? '1' : '0', {
        expires: 365,
      });
    } catch {}
  },
  createRoom: () => {
    const id = `r_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const room: Room = {
      id,
      title: '새 대화',
      createdAt: Date.now(),
      messages: [],
    };
    set((s) => ({
      rooms: [room, ...s.rooms],
      activeRoomId: id,
      messages: [],
    }));
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
      const nextActive =
        s.activeRoomId === id ? filtered[0]?.id ?? null : s.activeRoomId;
      return {
        rooms: filtered,
        activeRoomId: nextActive,
        messages: nextActive
          ? filtered.find((r) => r.id === nextActive)?.messages || []
          : [],
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
      next[idx] = {
        ...r,
        title: title.trim().slice(0, 15) || '새 대화',
      };
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
  setCollapsed: (v) => {
    set({ collapsed: v });
    get().saveToCookies();
  },
  sidebarMobileOpen: false,
  setSidebarMobileOpen: (v) => set({ sidebarMobileOpen: v }),

  rightOpen: false,
  setRightOpen: (v) => set({ rightOpen: v }),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  openRightPanel: (v: boolean) => set({ rightOpen: v }),

  rightData: null,
  setRightData: (d) => set({ rightData: d }),

  // 🔥 여기서 모드별로 분기 처리
  openRightFromHtml: (html: string, opts?: { mode?: RightPanelMode }) => {
    if (!html) {
      console.warn('[openRightFromHtml] empty html');
      return;
    }

    const mode: RightPanelMode = opts?.mode ?? 'evidence';
    console.log('[openRightFromHtml] mode =', mode);

    // 🔹 뉴스 / 입법예고 모드 → 파서 안 타고 그대로 newsHtml에 싣기
    if (mode === 'news' || mode === 'lawNotice' || mode === 'accident') {
      const data: RightPanelData = {
        mode,
        evidence: [],
        forms: [],
        rawHtml: html,
        newsHtml: html,
      };
      set({ rightData: data, rightOpen: true });
      return;
    }

    // 🔹 기본(evidence) 모드 → 기존 근거/서식 파서 사용
    const parsed = parseRightDataFromHtml(html);
    const data: RightPanelData = {
      ...parsed,
      mode: 'evidence',
      newsHtml: undefined,
    };
    set({ rightData: data, rightOpen: true });
  },

  // ✅ 로그인 모달 전역 상태
  showLoginModal: false,
  setShowLoginModal: (open: boolean) => set({ showLoginModal: open }),
}));

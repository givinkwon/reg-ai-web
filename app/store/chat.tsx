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
  let clean = u.replace(/[)\]\u3009>.,]+$/u, '');
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
const findFirstMatchIndex = (text: string, res: RegExp[]) => {
  let best = -1;
  for (const re of res) {
    const idx = text.search(re);
    if (idx >= 0) best = best === -1 ? idx : Math.min(best, idx);
  }
  return best;
};

/* ── 근거 섹션 추출 ── */
const cutEvidenceBlock = (text: string) => {
  // 0) 파싱 범위: 🔗 이전까지만
  const iconIdx = text.indexOf('🔗');
  const scope = iconIdx >= 0 ? text.slice(0, iconIdx) : text;

  // 1) 헤더 후보
  const headerRes: RegExp[] = [
    /^\s*(?:2\)|2\.|②)\s*근거\s*$/m,
    /^\s*(?:\*\*+)?\s*근거\s*(?:\*\*+)?\s*$/m,
    /^\s*#{2,6}\s*근거\s*$/m,
  ];

  const start = findFirstMatchIndex(scope, headerRes);
  if (start < 0) return '';

  const tail = scope.slice(start);

  // 2) 다음 섹션 헤더를 만나면 끊기
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

/* ── 서식 섹션 추출 ── */
const cutFormsBlock = (text: string) => {
  const headerRe1 = /관련\s*(?:별표(?:\s*\/?\s*서식)?|서식)(?:\s*링크)?/iu;
  const nextRe = /\n\s*(?:###|답변\b|근거\b|\d+\))/iu;

  const block1 = cutSection(text, headerRe1, nextRe);
  if (block1 && block1.trim().length > 0) return block1;

  const headerRe2 = /참고\s*기사\s*목록/iu;
  return cutSection(text, headerRe2, nextRe);
};

/* ── 마크다운/불릿 장식 제거 ── */
const stripMdDecorations = (s: string) => {
  return (s || '')
    .trim()
    .replace(/^\s*(?:[-*•]|(?:\d+[\)\.]))\s+/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*/g, '')
    .trim();
};

/* ── 근거 라인 파싱 ── */
const parseEvidenceLine = (raw: string): EvidenceItem | null => {
  const url = urlOf(raw);
  const base0 = url ? raw.replace(url, '').trim() : raw;
  const base = stripMdDecorations(base0);

  // ✅ (버그 방지) 이상한 LaTeX 잔재 패턴 제거하고, 법령표시 〔...〕만 우선 지원
  const lawM = base.match(/(〔.+?〕)/);

  const { left, right } = splitByColon(base);

  if (lawM) {
    const law = lawM[1].trim();
    const afterLaw = left.slice((lawM.index ?? 0) + law.length).trim();
    const title = cleanTitle(afterLaw ? `${law} ${afterLaw}` : law);
    const snippet = right?.trim() || undefined;
    return { title, href: url, snippet };
  }

  const title = cleanTitle(left);
  const snippet = right?.trim() || undefined;
  return title ? { title, href: url, snippet } : null;
};

const parseEvidenceLines = (block: string): EvidenceItem[] => {
  const lines = block
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

  const normalized = lines.map(stripMdDecorations).filter(Boolean);

  const candidates = normalized.filter((x) => /^(〔.+?〕|제\d+조|부칙)/.test(x));

  const items: EvidenceItem[] = [];
  for (const raw of candidates) {
    const item = parseEvidenceLine(raw);
    if (item?.title) items.push(item);
  }

  if (items.length === 0) {
    const scan = stripMdDecorations(block);
    const fallback = scan.match(/(〔.+?〕).+?(?::\s*.+)?/g) || [];
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
    const onlyUrl = ln.match(/^-?\s*(https?:\/\/[^\s)"'>\]]+)/i);
    if (onlyUrl) {
      if (cur) cur.href = normalizeUrl(onlyUrl[1]);
      continue;
    }

    const head = ln.match(/^(\d+[.)])\s*(.+)$/);
    if (head) {
      if (cur) items.push(cur);

      const inlineUrl = urlOf(head[2]);
      const titleOnly = inlineUrl ? head[2].replace(inlineUrl, '').trim() : head[2];

      cur = { title: cleanTitle(titleOnly) };
      if (inlineUrl) cur.href = normalizeUrl(inlineUrl);
      continue;
    }

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

  const evidencePreview = evBlock ? evBlock.split('\n').map((x) => x.trim()).filter(Boolean) : [];
  const formsPreview = formsBlock ? formsBlock.split('\n').map((x) => x.trim()).filter(Boolean) : [];
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

type SetMessagesArg = ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]);
export type MainView = 'chat' | 'docs';

/* =========================
 * Store
 * ========================= */
interface ChatStore {
  messages: ChatMessage[];
  setMessages: (arg: SetMessagesArg) => void;
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

  updateRoomTitle: (roomId: string, title: string) => void;
  setRoomTitle: (roomId: string, title: string) => void;

  setActiveRoomTitleIfEmpty: (title: string) => void;
  setActiveRoomTitle: (title: string) => void;

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

  openRightFromHtml: (html: string, opts?: { mode?: RightPanelMode }) => void;

  showLoginModal: boolean;
  setShowLoginModal: (open: boolean) => void;

  mainView: MainView;
  setMainView: (v: MainView) => void;
}

export const useChatStore = create<ChatStore>((set, get) => {
  // ✅ 스트리밍 덮어쓰기(saveToCookies) 과다 호출 방지용
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = (delayMs = 350) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      get().saveToCookies();
    }, delayMs);
  };

  type SaveMode = 'immediate' | 'debounced' | 'none';

  // ✅ 핵심: messages + active room messages를 항상 함께 갱신
  const mutateActiveMessages = (
    updater: (prev: ChatMessage[]) => ChatMessage[],
    opts?: { saveMode?: SaveMode },
  ) => {
    const saveMode: SaveMode = opts?.saveMode ?? 'immediate';

    set((s) => {
      const nextMessages = updater(s.messages);

      // active room이 없으면 messages만 갱신
      if (!s.activeRoomId) {
        return { ...s, messages: nextMessages };
      }

      const idx = s.rooms.findIndex((r) => r.id === s.activeRoomId);
      if (idx < 0) {
        return { ...s, messages: nextMessages };
      }

      const nextRooms = [...s.rooms];
      const r = nextRooms[idx];

      nextRooms[idx] = {
        ...r,
        messages: nextMessages.slice(-MAX_MSG_PER_ROOM),
      };

      return {
        ...s,
        messages: nextMessages,
        rooms: nextRooms,
      };
    });

    if (saveMode === 'immediate') get().saveToCookies();
    else if (saveMode === 'debounced') scheduleSave();
  };

  return {
    /* 메시지 */
    messages: [],

    setMessages: (arg) => {
      mutateActiveMessages((prev) => {
        const next = typeof arg === 'function' ? arg(prev) : arg;
        return (next || []).slice(-MAX_MSG_PER_ROOM);
      });
    },

    addMessage: (msg) => {
      mutateActiveMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === msg.role && last.content === msg.content) return prev;
        return [...prev, msg].slice(-MAX_MSG_PER_ROOM);
      });
    },

    clearMessages: () => {
      mutateActiveMessages(() => []);
    },

    // ✅ 스트리밍 덮어쓰기: room에도 반영 + 저장은 디바운스
    updateLastAssistant: (content: string) => {
      mutateActiveMessages(
        (prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'assistant') {
              next[i] = { ...next[i], content };
              return next;
            }
          }
          return prev;
        },
        { saveMode: 'debounced' },
      );
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

        const safeActive =
          (stored.activeRoomId && rooms.some((r) => r.id === stored.activeRoomId)
            ? stored.activeRoomId
            : rooms[0]?.id) ?? null;

        set({
          rooms,
          activeRoomId: safeActive,
          messages: safeActive ? rooms.find((r) => r.id === safeActive)?.messages || [] : [],
        });
      } catch (e) {
        console.warn('[loadFromCookies] failed:', e);
      }
    },

    saveToCookies: () => {
      const { rooms, activeRoomId, collapsed } = get();
      storage.set({ rooms, activeRoomId });
      try {
        Cookies.set(COOKIE_COLLAPSE, collapsed ? '1' : '0', { expires: 365 });
      } catch {}
    },

    createRoom: () => {
      const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const room: Room = { id, title: '새 대화', createdAt: Date.now(), messages: [] };

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
        const nextActive = s.activeRoomId === id ? filtered[0]?.id ?? null : s.activeRoomId;

        return {
          rooms: filtered,
          activeRoomId: nextActive,
          messages: nextActive ? filtered.find((r) => r.id === nextActive)?.messages || [] : [],
        };
      });
      get().saveToCookies();
    },

    updateRoomTitle: (roomId, title) => {
      const nextTitle = title.trim().slice(0, 50) || '새 대화';

      set((s) => {
        const idx = s.rooms.findIndex((r) => r.id === roomId);
        if (idx < 0) return s;

        const r = s.rooms[idx];
        const next = [...s.rooms];
        next[idx] = { ...r, title: nextTitle };
        return { ...s, rooms: next };
      });

      get().saveToCookies();
    },

    setRoomTitle: (roomId, title) => {
      get().updateRoomTitle(roomId, title);
    },

    setActiveRoomTitleIfEmpty: (title) => {
      set((s) => {
        const idx = s.rooms.findIndex((r) => r.id === s.activeRoomId);
        if (idx < 0) return s;

        const r = s.rooms[idx];
        if (r.title && r.title !== '새 대화') return s;

        const next = [...s.rooms];
        next[idx] = { ...r, title: title.trim().slice(0, 50) || '새 대화' };
        return { ...s, rooms: next };
      });
      get().saveToCookies();
    },

    setActiveRoomTitle: (title) => {
      set((s) => {
        const idx = s.rooms.findIndex((r) => r.id === s.activeRoomId);
        if (idx < 0) return s;

        const r = s.rooms[idx];
        const next = [...s.rooms];
        next[idx] = { ...r, title: title.trim().slice(0, 50) || '새 대화' };
        return { ...s, rooms: next };
      });
      get().saveToCookies();
    },

    appendToActive: (msg) => {
      get().addMessage(msg);
    },

    getActiveRoom: () => {
      const { rooms, activeRoomId } = get();
      return rooms.find((r) => r.id === activeRoomId) ?? null;
    },

    /* 사이드바 상태 */
    collapsed: false,
    setCollapsed: (v) => {
      set({ collapsed: v });
      get().saveToCookies();
    },
    sidebarMobileOpen: false,
    setSidebarMobileOpen: (v) => set({ sidebarMobileOpen: v }),

    /* 우측 패널 */
    rightOpen: false,
    setRightOpen: (v) => set({ rightOpen: v }),
    toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
    openRightPanel: (v) => set({ rightOpen: v }),

    rightData: null,
    setRightData: (d) => set({ rightData: d }),

    openRightFromHtml: (html: string, opts?: { mode?: RightPanelMode }) => {
      if (!html) {
        console.warn('[openRightFromHtml] empty html');
        return;
      }

      const mode: RightPanelMode = opts?.mode ?? 'evidence';
      console.log('[openRightFromHtml] mode =', mode);

      // 뉴스/입법예고/사고사례 → 그대로 싣기
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

      // evidence → 파싱
      const parsed = parseRightDataFromHtml(html);
      const data: RightPanelData = {
        ...parsed,
        mode: 'evidence',
        newsHtml: undefined,
      };
      set({ rightData: data, rightOpen: true });
    },

    /* 로그인 모달 */
    showLoginModal: false,
    setShowLoginModal: (open) => set({ showLoginModal: open }),

    // ✅✅✅ 여기 추가 안 해서 타입에러 났던 부분
    mainView: 'chat',
    setMainView: (v) => set({ mainView: v }),
  };
});
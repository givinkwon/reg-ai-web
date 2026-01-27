'use client';

// ChatArea.tsx

import type {
  TaskType,
  QuickAction,
  QuickActionGroup,
  SafetyDocDownload,
  SafetyDocGuide,
  SafetyEduMaterial,
  SafetyEduCategory,
  SafetyEduGuide,
} from './ChatArea.constants';

import {
  TASK_META,
  QUICK_ACTIONS,
  QUICK_ACTION_GROUPS,
  QUICK_ACTIONS_MAP,

  SAFETY_DOC_GUIDES,
  SAFETY_EDU_CATEGORIES_RAW,
  SAFETY_EDU_GUIDES_RAW,

  // (ChatArea에서 힌트/인트로 문구 쓰면)
  DOC_CREATE_INTRO_TEXT,
  LAW_INTRO_TEXT,
  GUIDELINE_INTRO_TEXT,
  DOC_REVIEW_INTRO_TEXT,
  EDU_INTRO_TEXT,
  ACCIDENT_INTRO_TEXT,

  LAW_INTERPRET_HINTS,
  GUIDELINE_HINTS,
  ACCIDENT_HINTS,

  // (게스트 제한 로직을 ChatArea에서 쓰면)
  GUEST_LIMIT,
  GUEST_LIMIT_COOKIE_KEY,

  // (HintTask 타입을 ChatArea에서 쓰면)
  HintTask,
} from './ChatArea.constants';

import { useEffect, useRef, useState } from 'react';
import {
  Settings,
  Copy,
  RotateCcw,
  ArrowUp,
  Plus,
  Search,
  FileText,
  AlertTriangle,
  Paperclip,
  X,
  Folder,
  User2,
  LogOut,
  Menu,
} from 'lucide-react';

import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';

import { useChatController } from '../useChatController';
import { useChatStore, ChatMessage } from '../../store/chat';
import { useUserStore } from '../../store/user';
import Cookies from 'js-cookie';
import s from './ChatArea.module.css';
import LoginPromptModal from './LoginPromptModal';
import { logoutFirebase } from '@/app/lib/firebase';
import MakeSafetyDocs, {
  SafetyDoc,
  SafetyDocCategory,
} from './make-safety-docs/MakeSafetyDocs';
import DocReviewUploadPane from './DocReviewUploadPane';
import MakeSafetyEduMaterials from './make-safety-edu-docs/MakeSafetyEduMaterials';

import RiskAssessmentWizard, {
  type RiskAssessmentDraft,
} from './risk-assessment/RiskAssessmentWizard'

import { useLawNoticeModal } from './law-notice/UseLawNoticeModal';
import LawNoticeSummaryModal from './law-notice/LawNoticeSummaryModal';
import LawNoticeArticlesModal from './law-notice/LawNoticeArticlesModal';

import { formatAssistantHtml } from '../../utils/formatAssistantHtml';

import { track } from '../../lib/ga/ga';
import CheckSafetyDocs from './check-safety-docs/CheckSafetyDocs';

// 🔹 추가: 쿠키에서 카운트 읽기
const getGuestMsgCountFromCookie = () => {
  const raw = Cookies.get(GUEST_LIMIT_COOKIE_KEY);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
};

// 🔹 추가: 쿠키에 카운트 쓰기
const setGuestMsgCountToCookie = (value: number) => {
  Cookies.set(GUEST_LIMIT_COOKIE_KEY, String(value), {
    // 며칠 동안 유지할지 원하는 값으로
    expires: 7, // 7일 동안 유지
  });
};

export default function ChatArea() {
  
  const inputStartedRef = useRef(false);
  const {
    messages,
    input,
    setInput,
    loading,
    loadingMessageIndex,
    LOADING_MESSAGES,
    statusMessage,
    sendMessage,
    regenerate,
  } = useChatController();

  const [showLanding, setShowLanding] = useState(true);

  // ✅ user / clearFirebaseUser 도 같이 꺼내기
  const { selectedJobType, setSelectedJobType, user, clearFirebaseUser } =
    useUserStore();
  const [showTypeModal, setShowTypeModal] = useState(false);

  // 작업 선택 모달 + 선택된 작업
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] =
    useState<TaskType | null>('guideline_interpret');

  // ✅ 로그인 모달 on/off
  const [showLoginModal, setShowLoginModal] = useState(false);

  // 첨부 파일
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setMessages = useChatStore((st) => st.setMessages);
  const addMessage = useChatStore((st) => st.addMessage);
  const openRightFromHtml = useChatStore((st) => st.openRightFromHtml);

  const bootOnce = useRef(false);

  const [copied, setCopied] = useState(false);

  const contentRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, loadingMessageIndex]);

  // ✅ 계정 버튼 클릭: 비로그인 → 로그인 모달 열기
  const handleAccountButtonClick = () => {
    if (!user) {
      setShowLoginModal(true);
    }
  };

  // ✅ 로그아웃 처리 (Google / Kakao 분기)
  const handleLogout = async () => {
    try {
      const w = window as any;
      if (user?.provider === 'kakao' && w?.Kakao?.Auth) {
        w.Kakao.Auth.logout();
      } else {
        await logoutFirebase();
      }
    } catch (err) {
      console.error('[ChatArea] logout error:', err);
    } finally {
      clearFirebaseUser?.();
    }
  };

  const [activeHintTask, setActiveHintTask] = useState<HintTask | null>(null);
  const [activeHints, setActiveHints] = useState<string[]>([]);

  function pickRandomHints(source: string[], count: number): string[] {
    const arr = [...source];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, Math.min(count, arr.length));
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentTaskMeta =
    selectedTask &&
    (selectedTask === 'guideline_interpret' ||
      selectedTask === 'law_interpret' ||
      selectedTask === 'accident_search')
      ? TASK_META[selectedTask as keyof typeof TASK_META]
      : null;

  const htmlToText = (html: string) => {
    try {
      const clean = html.replace(/<br\s*\/?>/gi, '\n');
      const doc = new DOMParser().parseFromString(clean, 'text/html');
      return (doc.body.textContent || '').replace(/\u00A0/g, ' ').trim();
    } catch {
      return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .trim();
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  const handleCopy = async (idx: number, fallbackHtml: string) => {
    const el = contentRefs.current[idx];
    const text = el?.innerText?.trim() || htmlToText(fallbackHtml);
    if (text) await copyToClipboard(text);
  };

  const handleRegenerate = (idx: number) => {
    const upperUser = [...messages]
      .slice(0, idx)
      .reverse()
      .find((m) => m.role === 'user');
    const fallbackUser = [...messages]
      .reverse()
      .find((m) => m.role === 'user');
    const q = htmlToText(upperUser?.content || fallbackUser?.content || '');
    if (!q) return;
    setMessages(messages.filter((_, i) => i !== idx));
    regenerate(q);
  };

  const firstMatchIndex = (s: string, patterns: RegExp[]) => {
    let best = -1;
    for (const re of patterns) {
      const idx = s.search(re);
      if (idx >= 0) best = best === -1 ? idx : Math.min(best, idx);
    }
    return best;
  };

  const cutHtmlBeforeEvidence = (html: string) => {
    if (!html) return html;

    const working = html.replace(/<(br|BR)\s*\/?>/g, '\n');

    // ✅ 1) HTML heading/p/div 에서 "근거" 찾기 (## 근거 → <h2>근거</h2>)
    const evidenceHtmlHeader =
      /<(?:h[1-6]|p|div)[^>]*>\s*(?:<[^>]+>\s*)*(?:2\)|2\.|②)?\s*근거\s*:?\s*(?:<\/[^>]+>\s*)*<\/(?:h[1-6]|p|div)>/i;

    // ✅ 2) 텍스트 라인에서 "## 근거" 자체가 남아있는 경우(렌더 전 text를 넣는 경우 대비)
    const evidenceMarkdownHeader = /^\s*#{2,6}\s*근거\s*:?\s*$/m;

    // ✅ 3) 기존 번호형 + 무번호형(굵게 포함)도 같이
    const evidenceTextHeader1 = /^\s*(?:2\)|2\.|②)\s*근거\s*:?\s*$/m;
    const evidenceTextHeader2 =
      /^\s*(?:\*\*+)?\s*근거\s*(?:\*\*+)?\s*:?\s*$/m;

    const evidenceIdx = firstMatchIndex(working, [
      evidenceHtmlHeader,
      evidenceMarkdownHeader,
      evidenceTextHeader1,
      evidenceTextHeader2,
    ]);

    // (참고 사고사례도 같은 방식으로 잡고 싶으면 동일하게 추가)
    const accidentIdx = firstMatchIndex(working, [
      /^\s*5\)\s*참고\s*사고사례\s*:?\s*$/m,
      /^\s*#{2,6}\s*참고\s*사고사례\s*:?\s*$/m,
      /<(?:h[1-6]|p|div)[^>]*>\s*(?:<[^>]+>\s*)*참고\s*사고사례\s*:?\s*(?:<\/[^>]+>\s*)*<\/(?:h[1-6]|p|div)>/i,
    ]);

    let cutIdx = -1;
    if (evidenceIdx >= 0 && accidentIdx >= 0)
      cutIdx = Math.min(evidenceIdx, accidentIdx);
    else cutIdx = Math.max(evidenceIdx, accidentIdx);

    // 기존 fallback들
    if (cutIdx < 0) {
      const accIdx = working.indexOf('5) 참고 사고사례');
      if (accIdx >= 0) cutIdx = accIdx;
    }
    if (cutIdx < 0) {
      const altIconIdx = working.indexOf('🔗');
      if (altIconIdx >= 0) cutIdx = altIconIdx;
    }

    if (cutIdx <= 0) return html;

    const before = working.slice(0, cutIdx);
    return before.replace(/\n/g, '<br />');
  };

  // 🔹 추가: 사고사례 섹션이 있는지 체크
  const hasAccidentCasesInHtml = (html: string) => {
    if (!html) return false;

    // 대표 패턴들
    if (html.includes('5) 참고 사고사례')) return true;
    if (html.includes('참고 사고사례')) return true;
    if (/\[사고사례\s*\d+\]/.test(html)) return true;

    return false;
  };

  const handleSend = () => {
    // 내용도 파일도 없으면 무시 (선택 사항)
    if (!input.trim() && attachments.length === 0) return;

    // 🔒 1) 게스트 제한 체크 (쿠키 기준)
    if (shouldBlockGuestByLimit()) {
      setShowLoginModal(true);
      return; // 여기서 바로 막아야 /api 요청 안 나감
    }

    // 🔒 2) 실제로 보낼 거면 쿠키 카운트 증가 (게스트만)
    if (!user) {
      const prev = getGuestMsgCountFromCookie();
      setGuestMsgCountToCookie(prev + 1);
    }

    // 이하 기존 로직 그대로
    setActiveHintTask(null);
    setActiveHints([]);

    if (selectedTask == 'guideline_interpret' || selectedTask == 'law_interpret' || selectedTask == 'accident_search') {
      queueMicrotask(() => setSidebarTitle(`${input}`));
    }

    sendMessage({
      taskType: selectedTask || undefined,
      files: attachments,
    });

    setShowLanding(false);
    setSelectedTask(null);
    setAttachments([]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const { openWeeklyNewsModal } = useChatStore();
  const {
    open: noticeOpen,
    articlesOpen,
    loading: noticeLoading,
    error: noticeError,
    title: noticeTitle,
    metaText: noticeMetaText,
    summaryHtml: noticeSummaryHtml,
    articles: noticeArticles,
    hasArticles: noticeHasArticles,
    fetchLatest: fetchLatestNotice,
    close: closeNotice,
    openArticles: openNoticeArticles,
    closeArticles: closeNoticeArticles,
  } = useLawNoticeModal();
  
  const fetchWeeklySafetyNews = () => {
    const category =
      selectedJobType === 'environment' || selectedJobType === 'infosec'
        ? selectedJobType
        : undefined;
  
    openWeeklyNewsModal(category);
  }; 

  const fetchNoticeSummary = () => {
    fetchLatestNotice();
  };

  const [noticeToast, setNoticeToast] = useState<string | null>(null);

  const formatToday = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
  };

  const ensureRoomExists = () => {
    const st = useChatStore.getState?.();
    if (!st?.activeRoomId) {
      st?.createRoom?.(); // createRoom이 activeRoomId까지 세팅한다고 가정
    }
  };

  const setSidebarTitle = (title: string) => {
    const st = useChatStore.getState?.();
    const rid = st?.activeRoomId;
    if (!rid) return;

    // ✅ store 메서드명 호환(둘 중 하나만 있어도 동작)
    if (st?.updateRoomTitle) st.updateRoomTitle(rid, title);
    else if (st?.setRoomTitle) st.setRoomTitle(rid, title);
  };

  const handleQuickActionClick = (action: QuickAction) => {
    if (menuLoading) return;

    // ✅ 문서 모드 초기화
    setDocMode(null);
    setReviewDoc(null);

    if (action.taskType) setSelectedTask(action.taskType);

    const today = formatToday();

    const focusInput = () => {
      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();
    };

    // ✅ 위험성평가: [위험성평가]YYYY/MM/DD
    if (action.id === 'risk_assessment') {
      ensureRoomExists();
      queueMicrotask(() => setSidebarTitle(`[위험성평가]${today}`));

      setShowRiskWizard(true);
      return;
    }

    // ✅ 안전뉴스: [안전뉴스]
    if (action.id === 'today_accident') {
      fetchWeeklySafetyNews();
      return;
    }

    // ✅ 입법예고: [입법예고]
    if (action.id === 'notice_summary') {
      fetchNoticeSummary();
      return;
    }    

    // ✅ 사고사례: [사고사례]
    if (action.id === 'accident_search') {
      ensureRoomExists();
      queueMicrotask(() => setSidebarTitle(`[사고사례]${today}`));

      const intro: ChatMessage = { role: 'assistant', content: ACCIDENT_INTRO_TEXT };
      setMessages(messages.length === 0 ? [intro] : [...messages, intro]);

      setActiveHintTask('accident_search');
      setActiveHints(pickRandomHints(ACCIDENT_HINTS, 3));

      focusInput();
      return;
    }

    // ✅ 문서검토 모드 진입: 제목은 “문서 선택” 시점에 세팅
    if (action.id === 'doc_review') {
      setActiveHintTask(null);
      setActiveHints([]);
      ensureRoomExists();
      setDocMode('review');
      focusInput();
      return;
    }

    // ✅ 문서생성 모드 진입: 제목은 “문서 선택” 시점에 세팅
    if (action.id === 'doc_create') {
      setActiveHintTask(null);
      setActiveHints([]);
      ensureRoomExists();
      setDocMode('create');
      focusInput();
      return;
    }

    // ✅ 교육자료: [교육자료]YYYY/MM/DD
    if (action.id === 'edu_material') {
      ensureRoomExists();
      queueMicrotask(() => setSidebarTitle(`[교육자료]${today}`));

      setSelectedTask('edu_material');
      setActiveHintTask(null);
      setActiveHints([]);
      setDocMode(null);

      focusInput();
      return;
    }

    // ✅ 나머지: 기존 로직 유지 (+ 사이드바 room 생성/제목 세팅만 추가)
    if (action.id === 'law_interpret' || action.id === 'guideline_interpret') {
      let hintTask: HintTask;
      let introText: string;
      let pool: string[];

      if (action.id === 'law_interpret') {
        hintTask = 'law_interpret';
        introText = LAW_INTRO_TEXT;
        pool = LAW_INTERPRET_HINTS;
      } else {
        hintTask = 'guideline_interpret';
        introText = GUIDELINE_INTRO_TEXT;
        pool = GUIDELINE_HINTS;
      }

      ensureRoomExists();
      queueMicrotask(() => setSidebarTitle(`[${action.label}]${today}`));

      const intro: ChatMessage = { role: 'assistant', content: introText };
      setMessages(messages.length === 0 ? [intro] : [...messages, intro]);

      setActiveHints(pickRandomHints(pool, 3));
      setActiveHintTask(hintTask);

      focusInput();
      return;
    }

    setActiveHintTask(null);
    setActiveHints([]);

    setInput(action.placeholder);
    const el = document.querySelector<HTMLInputElement>('.chat-input');
    if (el) el.focus();
  };

  const handleHintClick = (task: HintTask, hint: string) => {
    // 🔒 1) 게스트 제한 체크
    if (shouldBlockGuestByLimit()) {
      setShowLoginModal(true);
      return;
    }

    // 🔒 2) 쿠키 카운트 +1
    if (!user) {
      const prev = getGuestMsgCountFromCookie();
      setGuestMsgCountToCookie(prev + 1);
    }

    let mappedTaskType: TaskType;
    if (task === 'edu_material') {
      mappedTaskType = 'edu_material';
    } else if (task === 'guideline_interpret') {
      mappedTaskType = 'guideline_interpret';
      queueMicrotask(() => setSidebarTitle(`${hint}`));
    } else if (task === 'accident_search') {
      mappedTaskType = 'accident_search';
      queueMicrotask(() => setSidebarTitle(`${hint}`));
    } else {
      mappedTaskType = 'law_interpret';
      queueMicrotask(() => setSidebarTitle(`${hint}`));
    }

    setSelectedTask(mappedTaskType);

    sendMessage({
      taskType: mappedTaskType,
      overrideMessage: hint,
    });

    setActiveHintTask(null);
    setActiveHints([]);
  };

  const handleSelectSafetyDoc = (category: any, doc: any) => {
    setSelectedTask('doc_review');
    setDocMode(null);

    const userMsg: ChatMessage = { role: 'user', content: doc.label };

    const guide = SAFETY_DOC_GUIDES[doc.id];

    const intro =
      guide?.intro || `"${doc.label}" 문서를 작성하기 위해 필요한 정보를 정리해 주세요.`;

    const fields =
      guide?.fields?.length
        ? guide.fields
        : [
            '· 문서의 목적과 작성 배경',
            '· 적용 대상(사업장, 공정, 인원 등)',
            '· 문서에 포함하고 싶은 주요 항목',
          ];

    const fieldsHtml = fields.map((f) => `<li>${f}</li>`).join('');

    // ✅ downloads 배열 우선, 없으면 기존 downloadLabel/downloadUrl 호환
    const downloads =
      guide?.downloads?.length
        ? guide.downloads
        : guide?.downloadLabel && guide?.downloadUrl
          ? [{ label: guide.downloadLabel, url: guide.downloadUrl, icon: '📄' }]
          : [];

    const getExt = (url: string) => {
      const m = url.split('?')[0].match(/\.([a-z0-9]+)$/i);
      return (m?.[1] || '').toUpperCase();
    };

    const getSubLabel = (ext: string) => {
      if (ext === 'DOCX') return 'Word 문서';
      if (ext === 'XLSX') return 'Excel 시트';
      if (ext === 'PDF') return 'PDF 문서';
      return '파일 다운로드';
    };

    const downloadsHtml =
      downloads.length > 0
        ? `
          <div data-ai-kind="safety-doc-download" class="safety-doc-download-box">
            <div class="safety-doc-download-title">서식 다운로드</div>

            <div class="safety-doc-download-grid">
              ${downloads
                .map((d) => {
                  const ext = getExt(d.url);
                  const sub = getSubLabel(ext);
                  return `
                    <a
                      class="safety-doc-download-card"
                      href="${d.url}"
                      ${d.filename ? `download="${d.filename}"` : 'download'}
                      rel="noopener"
                    >
                      <div class="safety-doc-download-left">
                        <span class="safety-doc-download-icon">${d.icon ?? '📄'}</span>
                        <div class="safety-doc-download-meta">
                          <div class="safety-doc-download-name">${d.label}</div>
                          <div class="safety-doc-download-sub">${sub}</div>
                        </div>
                      </div>

                      <div class="safety-doc-download-right">
                        ${ext ? `<span class="safety-doc-download-badge">${ext}</span>` : ''}
                        <span class="safety-doc-download-arrow">⬇</span>
                      </div>
                    </a>
                  `;
                })
                .join('')}
            </div>
          </div>
        `
        : '';

    const assistantHtml = `
      <p>${intro}</p>
      <ul>${fieldsHtml}</ul>
      ${downloadsHtml}
    `;

    const aiMsg: ChatMessage = { role: 'assistant', content: assistantHtml };

    setMessages([...messages, userMsg, aiMsg]);

    setInput('');
    const el = document.querySelector<HTMLInputElement>('.chat-input');
    if (el) el.focus();
  };

  // ✅ 게스트 제한 체크 (3개 이상이면 true)
  const shouldBlockGuestByLimit = () => {
    // 로그인 했으면 제한 없음
    if (user) return false;

    const count = getGuestMsgCountFromCookie(); // 지금까지 쿠키에 저장된 횟수
    const nextCount = count + 1; // 이번에 보내려는 것까지 포함

    console.log('[guest-limit]', { count, nextCount });

    // 3번까지 허용, 4번째부터 막기
    return nextCount > GUEST_LIMIT;
  };

  // 문서 생성/검토 모드 상태
  const [docMode, setDocMode] = useState<'create' | 'review' | null>(null);

  // 검토 대상 문서 (카테고리 + 문서)
  const [reviewDoc, setReviewDoc] = useState<{
    category: SafetyDocCategory;
    doc: SafetyDoc;
  } | null>(null);

  const isMakeSafetyDocTask = docMode === 'create'
  const isCheckSafetyDocTask = docMode === 'review';
  const isEduTask = selectedTask === 'edu_material';
  const isRiskTask = selectedTask === 'risk_assessment';

  // 실제로 파일을 상태에 추가하는 공통 함수
  const addAttachments = (files: File[]) => {
    if (!files || files.length === 0) return;
    setAttachments((prev) => [...prev, ...files]);
  };

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const files = Array.from(e.target.files);
    addAttachments(files);

    // 같은 파일 다시 선택 가능하도록 초기화
    e.target.value = '';
  };

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer.files) return;

    const files = Array.from(e.dataTransfer.files);
    addAttachments(files);
  };

  function simpleMarkdownToHtml(md: string): string {
    if (!md) return '';

    let html = md;

    // 코드블록
    html = html.replace(/```([\s\S]*?)```/g, (_m, code) => {
      return `<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
    });

    // 헤딩
    html = html.replace(/^### (.*)$/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*)$/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*)$/gim, '<h1>$1</h1>');

    // 굵게 / 기울임
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 리스트
    html = html.replace(/^\s*-\s+(.*)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');

    // 줄바꿈
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = `<p>${html}</p>`;
    html = html.replace(/<p><\/p>/g, '');

    return html;
  }

  async function pollDocReviewJob(
    jobId: string,
    threadId: string,
    updateLastAssistant: (content: string) => void,
    addMessage: (msg: { role: 'assistant' | 'user'; content: string }) => void,
  ) {
    const timeoutMs = 120_000;
    const intervalMs = 2_000;
    const startedAt = Date.now();

    const esc = (v: string) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 단계별 status_message를 한 버블 안에서 누적해서 보여주고 싶으면 사용
    const progressLines: string[] = [];

    while (true) {
      const res = await fetch(
        `/api/check-task?jobId=${encodeURIComponent(jobId)}`,
        { cache: 'no-store' },
      );

      if (!res.ok) {
        updateLastAssistant(
          `<p>문서 검토 결과를 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>`,
        );
        break;
      }

      const data = await res.json();
      const status: string | undefined = data.status;
      const statusMessage: string | undefined = data.status_message;
      const answer: string = data.gpt_response || data.full_report || '';

      const inProgress =
        status === 'pending' ||
        status === 'running' ||
        status === 'retrieving' ||
        status === 'generating_answer' ||
        status === 'postprocessing';

      // 🔹 진행 중일 때는 "같은 말풍선"만 업데이트
      if (inProgress) {
        if (statusMessage && !progressLines.includes(statusMessage)) {
          progressLines.push(statusMessage);
          updateLastAssistant(
            `<p>${progressLines.map(esc).join('<br />')}</p>`,
          );
        }

        if (Date.now() - startedAt > timeoutMs) {
          updateLastAssistant(
            `<p>문서 검토가 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.</p>`,
          );
          break;
        }

        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }

      // ✅ 완료: 진행 말풍선은 완료로 바꾸고, 최종 답변은 "새 assistant 메시지"로 추가
      if (status === 'done') {
        const finalText =
          answer || '문서 검토 결과를 불러왔지만, 내용이 비어 있습니다.';
        const finalHtml = simpleMarkdownToHtml(finalText);

        updateLastAssistant(`<p>✅ 문서 검토가 완료되었습니다.</p>`);
        addMessage({ role: 'assistant', content: finalHtml });
        break;
      }

      // ❌ 에러
      if (status === 'error') {
        updateLastAssistant(
          `<p>${esc(
            data.error ||
              data.error_message ||
              '문서 검토 중 오류가 발생했습니다. 담당자에게 문의해 주세요.',
          )}</p>`,
        );
        break;
      }

      // 알 수 없는 상태
      updateLastAssistant(
        `<p>문서 검토 작업 상태를 알 수 없습니다. (status=${esc(
          String(status),
        )})</p>`,
      );
      break;
    }
  }

  const [showRiskWizard, setShowRiskWizard] = useState(false);

  useEffect(() => {
    const saved = Cookies.get('selectedJobType') as string | undefined;
    if (saved) {
      setSelectedJobType(saved);
      setShowTypeModal(false);
    } else {
      setShowTypeModal(true);
    }
  }, [setSelectedJobType]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (bootOnce.current) return;

    const sp = new URLSearchParams(window.location.search);
    const sharedId = sp.get('id') || sp.get('job_id');
    if (!sharedId) return;

    bootOnce.current = true;

    (async () => {
      try {
        const res = await fetch(
          `/api/public-answer?id=${encodeURIComponent(sharedId)}`,
          { cache: 'no-store' },
        );

        if (!res.ok) {
          setMessages([
            {
              role: 'assistant',
              content:
                '공유된 답변을 불러오지 못했습니다. 링크가 만료되었거나 잘못된 ID일 수 있어요.',
            },
          ]);
          return;
        }

        const data = (await res.json()) as {
          job_id: string;
          category?: 'environment' | 'infosec' | string;
          question?: string;
          answer_html?: string;
          created_at?: string;
        };

        const question = (data.question || '').trim();
        const answerHtml = (data.answer_html || '').trim();

        if (
          data.category &&
          (data.category === 'environment' || data.category === 'infosec')
        ) {
          Cookies.set('selectedJobType', data.category, { expires: 7 });
          setSelectedJobType(data.category);
        }

        const initialMsgs: { role: 'user' | 'assistant'; content: string }[] = [];
        if (question) initialMsgs.push({ role: 'user', content: question });
        else
          initialMsgs.push({
            role: 'user',
            content: '(공유 링크로 불러온 질문)',
          });

        if (answerHtml)
          initialMsgs.push({ role: 'assistant', content: answerHtml });
        else
          initialMsgs.push({
            role: 'assistant',
            content: '답변 본문이 비어 있습니다.',
          });

        setMessages(initialMsgs);
      } catch (e) {
        console.error('[ChatArea] public/answer fetch error:', e);
        setMessages([
          {
            role: 'assistant',
            content: '공유된 답변을 불러오는 중 오류가 발생했습니다.',
          },
        ]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      setActiveHintTask(null);
      setActiveHints([]);
    }
  }, [messages.length]);

  const updateLastAssistant = useChatStore((s) => s.updateLastAssistant);

  const [selectedEduMaterialId, setSelectedEduMaterialId] = useState<string | null>(null);

  const handleSelectSafetyEduMaterial = ({
    category,
    material,
    guide,
  }: {
    category: any;
    material: any;
    guide: any;
  }) => {
    // 선택 표시(옵션)
    setSelectedEduMaterialId(material.id);
  };

  function getFilenameFromDisposition(cd: string | null) {
    if (!cd) return null;

    // filename*=UTF-8''... 우선
    const m1 = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(cd);
    if (m1?.[1]) {
      try {
        return decodeURIComponent(m1[1].trim().replace(/^"+|"+$/g, ''));
      } catch {
        return m1[1].trim().replace(/^"+|"+$/g, '');
      }
    }

    // filename="..."
    const m2 = /filename\s*=\s*("?)([^";]+)\1/i.exec(cd);
    if (m2?.[2]) return m2[2].trim();

    return null;
  }

  function buildExcelPayload(draft: any, email: string) {
    const items: any[] = [];

    for (const t of draft.tasks || []) {
      for (const p of t.processes || []) {
        for (const h of p.hazards || []) {
          items.push({
            process_name: (t.title || '').trim(),
            sub_process: (p.title || '').trim(),
            risk_situation_result: (h.title || '').trim(),
            judgement: h.judgement ?? '중',
            current_control_text: h.current_control_text ?? '',
            mitigation_text: h.mitigation_text ?? '', // 네가 controls를 “개선대책”으로 쓰면 여기로
          });
        }
      }
    }

    return {
      email,
      dateISO: draft.meta?.dateISO ?? null,
      items,
    };
  }

  // ✅ 메뉴(안전뉴스/입법예고 등) 클릭 후 서버 응답 대기 로딩
  const [menuLoading, setMenuLoading] = useState(false);
  const setSidebarMobileOpen = useChatStore((st) => st.setSidebarMobileOpen);

  return (
    <>
      <section className={s.wrap}>
        {/* Header */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <button
              type="button"
              className={s.menuBtn}
              onClick={() => setSidebarMobileOpen(true)}
              aria-label="사이드바 열기"
              title="메뉴"
            >
              <Menu className={s.menuIcon} />
            </button>
          </div>

          <div className={s.headerRight}>
            {/* 로그인 시: 계정 드롭다운 / 비로그인 시: 로그인 버튼 */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={s.settingsBtn}
                    onClick={handleAccountButtonClick}
                  >
                    <User2 className={s.iconXs} />
                    <span className={s.accountLabel}>
                      {user.email ?? '계정'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>내 계정</DropdownMenuLabel>
                  {user.email && (
                    <DropdownMenuItem disabled>{user.email}</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut data-ga-id={`Chat:ChatArea:Logout`} data-ga-label="로그아웃" className={s.iconXs} />
                    <span>로그아웃</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                data-ga-id={`Chat:ChatArea:Login`}
                data-ga-label="로그인"
                className={s.settingsBtn}
                onClick={() => setShowLoginModal(true)}
              >
                <Settings className={s.iconXs} />
                로그인
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className={s.body}>
          <div className={s.stream}>
            <div className={s.streamInner}>
              {messages.length === 0 && (
                <>
                  <div className={s.docWrap}>
                    <RiskAssessmentWizard
                      open={isRiskTask}
                      onClose={() => setSelectedTask(null)}
                      onSubmit={async (draft) => {
                        if (!user?.email) throw new Error('로그인해주세요');

                        const payload = buildExcelPayload(draft, user.email);
                        const res = await fetch('/api/risk-assessment?endpoint=export-excel', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload),
                        });

                        if (!res.ok) {
                          const t = await res.text();
                          throw new Error(t || '엑셀 생성 실패');
                        }

                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);

                        const a = document.createElement('a');
                        a.href = url;
                        const cd = res.headers.get('content-disposition');
                        const filename =
                          getFilenameFromDisposition(cd) || `위험성평가_${draft.meta.dateISO || 'today'}.xlsx`;

                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                      }}
                    />
                  </div>
                  {isEduTask ? (
                    <MakeSafetyEduMaterials
                      onSelectMaterial={handleSelectSafetyEduMaterial}
                      selectedMaterialId={selectedEduMaterialId}
                    />
                  ) : isMakeSafetyDocTask ? (
                    <MakeSafetyDocs
                      mode={docMode}
                      onSelectDoc={(category, doc) => {
                        ensureRoomExists();

                        const today = formatToday();
                        const label = (doc.label || doc.id || '문서').replace(/\s+/g, '');
                        const prefix = '[문서생성]';
                        queueMicrotask(() => setSidebarTitle(`${prefix}${label}_${today}`));

                        if (docMode === 'create') {
                          handleSelectSafetyDoc(category, doc);
                        } else if (docMode === 'review') {
                          setReviewDoc({ category, doc });
                        }
                      }}
                      // ✅ 어떤 문서가 선택됐는지 (검토 모드에서만)
                      // selectedDocId={
                      //   docMode === 'review' && reviewDoc ? reviewDoc.doc.id : null
                      // }
                      // ✅ 선택된 문서 아래에 표시할 업로드 영역 (드롭다운)
                      // renderSelectedDocPane={(category, doc) =>
                      //   docMode === 'review' ? (
                      //     <DocReviewUploadPane
                      //       category={category}
                      //       doc={doc}
                      //       onUploadAndAsk={async ({ category, doc, files }) => {
                      //         // 1) 유저 메시지
                      //         addMessage({
                      //           role: 'user',
                      //           content: `[문서 검토 요청] "${doc.label}" 문서를 업로드했습니다. 검토 결과를 알려주세요.`,
                      //         });

                      //         // 2) 진행상황 표시용 assistant 버블 "하나" 생성
                      //         addMessage({
                      //           role: 'assistant',
                      //           content: '📂 업로드된 문서 확인 및 검토 프롬프트 생성 중',
                      //         });

                      //         // 3) FormData 구성
                      //         const form = new FormData();
                      //         files.forEach((f) => form.append('files', f));
                      //         form.append('task_type', 'safety_doc_review');
                      //         form.append('safety_doc_id', doc.id);
                      //         form.append('safety_doc_label', doc.label);
                      //         form.append('category_id', category.id);
                      //         form.append('category_title', category.title);

                      //         // 4) 백엔드에 job 생성 요청
                      //         const res = await fetch('/api/start-doc-review', {
                      //           method: 'POST',
                      //           body: form,
                      //         });

                      //         if (!res.ok) {
                      //           updateLastAssistant(
                      //             '문서 검토 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
                      //           );
                      //           return;
                      //         }

                      //         const { job_id, thread_id } = await res.json();

                      //         // 5) 폴링하면서 "같은 말풍선"만 내용 업데이트
                      //         await pollDocReviewJob(
                      //           job_id,
                      //           thread_id ?? job_id,
                      //           updateLastAssistant,
                      //           addMessage, // 최종 답변용
                      //         );
                      //       }}
                      //     />
                      //   ) : null
                      // }
                    />
                  ) : isCheckSafetyDocTask ? (
                    <CheckSafetyDocs
                      mode={docMode}
                      onSelectDoc={(category, doc) => {
                        ensureRoomExists();

                        const today = formatToday();
                        const label = (doc.label || doc.id || '문서').replace(/\s+/g, '');
                        const prefix = '[문서생성]';
                        queueMicrotask(() => setSidebarTitle(`${prefix}${label}_${today}`));
                        setReviewDoc({ category, doc });
                      }}
                      // ✅ 어떤 문서가 선택됐는지 (검토 모드에서만)
                      selectedDocId={
                        docMode === 'review' && reviewDoc ? reviewDoc.doc.id : null
                      }
                      // ✅ 선택된 문서 아래에 표시할 업로드 영역 (드롭다운)
                      renderSelectedDocPane={(category, doc) =>
                        docMode === 'review' ? (
                          <DocReviewUploadPane
                            category={category}
                            doc={doc}
                            onUploadAndAsk={async ({ category, doc, files }) => {
                              // 1) 유저 메시지
                              addMessage({
                                role: 'user',
                                content: `[문서 검토 요청] "${doc.label}" 문서를 업로드했습니다. 검토 결과를 알려주세요.`,
                              });

                              // 2) 진행상황 표시용 assistant 버블 "하나" 생성
                              addMessage({
                                role: 'assistant',
                                content: '📂 업로드된 문서 확인 및 검토 프롬프트 생성 중',
                              });

                              // 3) FormData 구성
                              const form = new FormData();
                              files.forEach((f) => form.append('files', f));
                              form.append('task_type', 'safety_doc_review');
                              form.append('safety_doc_id', doc.id);
                              form.append('safety_doc_label', doc.label);
                              form.append('category_id', category.id);
                              form.append('category_title', category.title);

                              // 4) 백엔드에 job 생성 요청
                              const res = await fetch('/api/start-doc-review', {
                                method: 'POST',
                                body: form,
                              });

                              if (!res.ok) {
                                updateLastAssistant(
                                  '문서 검토 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
                                );
                                return;
                              }

                              const { job_id, thread_id } = await res.json();

                              // 5) 폴링하면서 "같은 말풍선"만 내용 업데이트
                              await pollDocReviewJob(
                                job_id,
                                thread_id ?? job_id,
                                updateLastAssistant,
                                addMessage, // 최종 답변용
                              );
                            }}
                          />
                        ) : null
                      }
                    />
                  ) : (!isRiskTask &&
                    // 그 외 작업들은 기존 "무엇을 도와드릴까요?" 퀵 액션 노출
                    <div className={s.quickWrap}>
                      <div className={s.quickTitle}>무엇을 도와드릴까요?</div>

                      {QUICK_ACTION_GROUPS.map((group) => {
                        const GroupIcon = group.icon;
                        return (
                          <div key={group.id} className={s.quickSection}>
                            <div className={s.quickSectionHeader}>
                              <GroupIcon className={s.quickSectionIcon} />
                              <span className={s.quickSectionTitle}>
                                {group.title}
                              </span>
                            </div>

                            <div className={s.quickGrid}>
                              {group.items.map((id) => {
                                const action = QUICK_ACTIONS_MAP[id];
                                if (!action) return null;
                                const Icon = action.icon;
                                return (
                                  <button
                                    key={action.id}
                                    type="button"
                                    className={s.quickCard}
                                    data-ga-id={`Chat:ChatArea:QuickButton:${action.id}`}
                                    data-ga-label={action.label}
                                    onClick={() => handleQuickActionClick(action)}
                                  >
                                    <span className={s.quickIconWrap} aria-hidden="true">
                                      <Icon className={s.quickIcon} />
                                    </span>

                                    <span className={s.quickText}>
                                      <span className={s.quickLabel}>{action.label}</span>
                                    </span>

                                    <span className={s.quickCta}>선택</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {messages.map((m, i) => {
                const isUser = m.role === 'user';

                let isSafetyNews = false;
                let isNoticeSummary = false;
                let isAccidentCases = false;
                let safeHtml: string;

                if (m.role === 'assistant') {
                  const rawHtml = m.content || '';
                  const text = (m.content ?? '').replace(/<[^>]*>/g, '').trim();
                  if (text.length === 0) {
                    return null; // ✅ 빈 assistant는 아예 렌더하지 않음
                  }

                  // 🔹 사고사례 섹션 있는지 먼저 체크
                  isAccidentCases = hasAccidentCasesInHtml(rawHtml);

                  safeHtml = cutHtmlBeforeEvidence(rawHtml);
                } else {
                  safeHtml = m.content;
                }

                const finalHtml =
                m.role === 'assistant' ? formatAssistantHtml(safeHtml) : safeHtml;

                const isIntro =
                  m.role === 'assistant' &&
                  (m.content === LAW_INTRO_TEXT ||
                    m.content === GUIDELINE_INTRO_TEXT ||
                    m.content === DOC_CREATE_INTRO_TEXT ||
                    m.content === EDU_INTRO_TEXT ||
                    m.content === DOC_REVIEW_INTRO_TEXT ||
                    m.content === ACCIDENT_INTRO_TEXT);

                const plain =
                  m.role === 'assistant' ? htmlToText(m.content || '') : '';

                const isSafetyDocDownload =
                  m.role === 'assistant' &&
                  /양식\s*\((DOCX|XLSX)\)\s*다운로드/.test(plain);

                const isEduMaterial =
                  m.role === 'assistant' &&
                  m.content.includes('data-ai-kind="edu-material"');
                const raw = m.role === 'assistant' ? m.content || '' : '';
                const isLoadingBubble =
                  m.role === 'assistant' &&
                  (raw.includes('data-msg-state="loading"') ||
                    raw.includes('data-ai-kind="menu-loading"') ||
                    htmlToText(raw).includes('을 가져오고 있어요'));
                const hideActionRow =
                  isIntro || isSafetyDocDownload || isEduMaterial || isLoadingBubble;

                if (isUser) {
                  return (
                    <div key={i} className={s.userRow}>
                      <div className={s.userBubble}>
                        <div
                          className={s.userContent}
                          dangerouslySetInnerHTML={{ __html: finalHtml }}
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={i} className={s.aiRow}>
                    <div
                      ref={(el) => {
                        contentRefs.current[i] = el;
                      }}
                      className={s.aiBubble}
                      dangerouslySetInnerHTML={{ __html: finalHtml }}
                    />

                    {!menuLoading && !isLoadingBubble && !hideActionRow && (
                      <div className={s.actionRow}>
                        <div className={s.miniActions}>
                          {!isSafetyNews && !isNoticeSummary && (
                            <div className={s.miniActions}>
                              <button
                                className={s.iconBtn}
                                title="다시 생성"
                                onClick={() => handleRegenerate(i)}
                              >
                                <RotateCcw className={s.iconAction} />
                              </button>
                              <button
                                className={s.iconBtn}
                                title="복사"
                                onClick={() => handleCopy(i, m.content)}
                              >
                                <Copy className={s.iconAction} />
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          className={s.evidenceBtn}
                          onClick={() => {
                            if (isAccidentCases) {
                              openRightFromHtml(m.content, {
                                mode: 'accident',
                              });
                            } else {
                              openRightFromHtml(m.content, {
                                mode: 'evidence',
                              });
                            }
                          }}
                        >
                          {isAccidentCases
                                ? '참고 사고사례 확인하기'
                                : '근거 및 서식 확인하기'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {activeHintTask && activeHints.length > 0 && (
                <div className={s.hintWrap}>
                  {activeHints.map((hint, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={s.hintChip}
                      onClick={() => handleHintClick(activeHintTask, hint)}
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              )}
              {loading && (
                <div className={s.loadingCard}>
                  <span>{statusMessage || LOADING_MESSAGES[loadingMessageIndex]}</span>
                  <span className={s.dots}>
                    <span>•</span>
                    <span>•</span>
                    <span>•</span>
                  </span>
                </div>
              )}

              <div ref={endRef} />
              <div className={s.bottomSpacer} />
            </div>
          </div>

          {attachments.length > 0 && (
            <div className={s.attachList}>
              {attachments.map((file, idx) => (
                <div key={idx} className={s.attachChip}>
                  <Paperclip className={s.attachIcon} />
                  <span className={s.attachName}>{file.name}</span>
                  <button
                    type="button"
                    className={s.attachRemove}
                    onClick={() =>
                      setAttachments((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label="첨부 삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={s.inputRow} onDragOver={handleDragOver} onDrop={handleDropFiles}>
            <div className={s.inputWrap}>
              <div className={s.inputShell}>
                <button
                  type="button"
                  className={s.plusBtn}
                  data-ga-id="Chat:ChatArea:OpenTaskModal"
                  data-ga-label="작업 선택"
                  onClick={() => setShowTaskModal(true)}
                  aria-label="작업 선택"
                  title="작업 선택"
                >
                  <Plus className={s.plusIcon} />
                </button>

                {currentTaskMeta && (
                  <div className={s.taskChip}>
                    <Search className={s.taskChipIcon} />
                    <span className={s.taskChipLabel}>{currentTaskMeta.label}</span>
                    <button
                      type="button"
                      data-ga-id="Chat:ChatArea:RemoveTaskTag"
                      data-ga-label="작업 태그 제거"
                      className={s.taskChipClose}
                      onClick={() => setSelectedTask(null)}
                      aria-label="작업 태그 제거"
                    >
                      ×
                    </button>
                  </div>
                )}

                <input
                  className={`${s.input} ${currentTaskMeta ? s.inputHasChip : ''} chat-input`}
                  value={input}
                  onChange={(e) => {
                    const v = e.target.value;

                    if (!inputStartedRef.current && v.trim().length > 0) {
                      inputStartedRef.current = true;
                      track('Chat_ChatArea_Typing_Start', {
                        ui_id: 'Chat:ChatArea:TypingStart',
                        page_path: window.location.pathname,
                      });
                    }

                    // 입력이 완전히 비면 다시 “시작” 잡을 수 있게 리셋(선택)
                    if (v.trim().length === 0) inputStartedRef.current = false;

                    setInput(v);
                  }}
                  onKeyDown={onKey}
                  placeholder="질문을 입력하거나 파일을 끌어다 놓으세요"
                />
              </div>
            </div>

            <button
              type="button"
              data-ga-id="Chat:ChatArea:AttachFile"
              data-ga-label="파일 첨부"
              className={s.attachBtn}
              onClick={() => fileInputRef.current?.click()}
              aria-label="파일 첨부"
            >
              <Paperclip className={s.iconMd} />
            </button>

            <button data-ga-id="Chat:ChatArea:Submit" data-ga-label="전송" onClick={handleSend} className={s.sendBtn} aria-label="전송">
              <ArrowUp className={s.iconMdAccent} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleAddFiles}
            />
          </div>

          {copied && <div className={s.toast}>복사되었습니다</div>}
        </div>
      </section>

      {/* 작업 선택 모달 */}
      {showTaskModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="작업 선택"
          className={s.typeModalOverlay}
          onClick={() => setShowTaskModal(false)}
        >
          <div className={s.taskModal} onClick={(e) => e.stopPropagation()}>
            <div className={s.typeHeader}>
              <h3 className={s.typeTitle}>작업 유형을 선택하세요</h3>
              <button
                type="button"
                className={s.typeCloseBtn}
                onClick={() => setShowTaskModal(false)}
                aria-label="작업 선택창 닫기"
              >
                <span className={s.typeCloseIcon} aria-hidden="true">
                  ×
                </span>
              </button>
            </div>

            <div className={s.taskGrid}>
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={s.taskCard}
                    onClick={() => {
                      handleQuickActionClick(action);
                      setShowTaskModal(false);
                    }}
                  >
                    <Icon className={s.taskCardIcon} />
                    <span className={s.taskLabel}>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ✅ 로그인 모달 (비로그인일 때 계정 버튼 누르면 표시) */}
      {showLoginModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
      {noticeToast && <div className={s.toast}>{noticeToast}</div>}

            {/* ✅ 입법예고 요약 모달 */}
            <LawNoticeSummaryModal
        open={noticeOpen}
        onClose={closeNotice}
        title={noticeTitle}
        metaText={noticeMetaText}
        loading={noticeLoading}
        error={noticeError}
        summaryHtml={noticeSummaryHtml}
        hasArticles={noticeHasArticles}
        onOpenArticles={openNoticeArticles}
      />

      {/* ✅ 참고 입법예고 목록 모달 */}
      <LawNoticeArticlesModal
        open={articlesOpen}
        onClose={closeNoticeArticles}
        title="참고 입법예고 목록"
        items={noticeArticles}
      />

    </>
  );
}
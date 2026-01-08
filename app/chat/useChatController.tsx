'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore, ChatMessage } from '../store/chat';
import { useUserStore } from '../store/user';
import { pushToDataLayer } from '../lib/analytics';

type MonItem = { doc_type: string; doc_id: string; title: string };

// 서버에 허용되는 task_type 값들
type ServerTaskType =
  | 'law_research'
  | 'doc_create'
  | 'doc_review'
  | 'risk_assessment'
  | 'law_interpret'
  | 'edu_material'
  | 'guideline_interpret'
  | 'accident_search';

// NEW: sendMessage 옵션 타입
type SendOptions = {
  taskType?: ServerTaskType | null;
  files?: File[];
  overrideMessage?: string;
};

// NEW: File → base64 변환
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      } else {
        reject(new Error('파일을 읽지 못했습니다.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('파일 읽기 오류'));
    reader.readAsDataURL(file);
  });

const TAG_PRESETS: Record<string, string[]> = {
  finance: [
    '은행',
    '자산',
    '자산운용',
    '증권',
    '금융소비자보호',
    '자본시장',
    '공시',
    '내부통제',
    'AML/KYC',
    '전자금융',
    '신용정보',
    '마이데이터',
    '집합투자',
  ],
  infosec: [
    '개인정보',
    'ISMS',
    '망분리',
    '암호화',
    '접근통제',
    '전자서명',
    '침해사고',
    '클라우드 보안',
    '물리보안',
    'DR/BCP',
  ],
  construction: ['중대재해', '건설', '기술', '안전', '품질', '감리', '도시계획', '주택', '소음', '진동'],
  bio: ['의약품', '의료기기', 'GMP', '임상', '광고', '표시', '유전자', '식약처 고시'],
  environment: [
    '화학물질',
    '가스',
    '소방',
    '방재',
    '대기',
    '수질',
    '폐기물',
    '유해물질',
    '온실가스',
    'REACH',
    'K-REACH',
  ],
  procurement: ['국가계약법', '입찰', '낙찰', '계약', '조달청'],
  hr: ['중대재해', '산업안전', '보건', '채용절차', '장애인', '개인정보보호', '징계', '인사'],
  default: ['시행일', '개정', '부칙', '별표서식', '고시개정', '행정예고'],
};

const THREAD_STORAGE_KEY = 'regai_thread_id';

export function useChatController() {
  const router = useRouter();

  // ✅ chat store (패치된 store 기준: controller는 setMessages/appendToActive 금지)
  const {
    messages,
    addMessage,
    updateLastAssistant,
    loadFromCookies,
    createRoom,
    activeRoomId,
    setActiveRoomTitleIfEmpty,
  } = useChatStore();

  // user store
  const { selectedJobType, userInfo, hydrateFromCookie, setSelectedJobType } = useUserStore();

  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const [monitorMode, setMonitorMode] = useState(false);
  const [monItems, setMonItems] = useState<MonItem[]>([]);
  const [pickedDocs, setPickedDocs] = useState<Record<string, boolean>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [monLoading, setMonLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  // 중복 전송 가드
  const sendingRef = useRef(false);

  // ✅ active room 보장
  const ensureRoom = () => {
    const st = useChatStore.getState();
    if (st.activeRoomId) return st.activeRoomId;
    return st.createRoom();
  };

  // 1) localStorage/쿠키 → 채팅방/메시지 복원
  useEffect(() => {
    loadFromCookies();
  }, [loadFromCookies]);

  // 2) 전문분야 카테고리 하이드레이션
  useEffect(() => {
    hydrateFromCookie();
    setHydrated(true);
  }, [hydrateFromCookie]);

  useEffect(() => {
    if (!hydrated) return;
    // if (!selectedJobType) router.push('/');
    setThreadId(null); // 카테고리 변경 시 스레드 초기화
  }, [hydrated, selectedJobType, router]);

  // (선택) threadId를 localStorage에 유지하고 싶을 때
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THREAD_STORAGE_KEY);
      if (saved) setThreadId(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (threadId) window.localStorage.setItem(THREAD_STORAGE_KEY, threadId);
      else window.localStorage.removeItem(THREAD_STORAGE_KEY);
    } catch {}
  }, [threadId]);

  const presetTags = useMemo(
    () => TAG_PRESETS[(selectedJobType ?? 'default') as keyof typeof TAG_PRESETS],
    [selectedJobType],
  );

  const LOADING_MESSAGES = useMemo(
    () => [
      '🌀 RegAI가 질의/태그를 분석합니다...',
      '📚 관련 법령과 조문을 찾았습니다. 분석 중입니다...',
      '🔍 정확한 답변을 위해 다시 확인 중입니다...',
    ],
    [],
  );

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setLoadingMessageIndex((p) => (p < LOADING_MESSAGES.length - 1 ? p + 1 : p));
    }, 30000);
    return () => clearInterval(id);
  }, [loading, LOADING_MESSAGES.length]);

  const sendSlackMessage = (text: string) => {
    fetch('/api/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 3500) }),
    }).catch(() => {});
  };

  // ✅ 새 채팅 시작 (store가 createRoom에서 messages/active를 초기화한다고 가정)
  const newChat = () => {
    createRoom();
    setThreadId(null);
    setJobId(null);
    setStatusMessage('');
    setLoading(false);
    setLoadingMessageIndex(0);
    setInput('');
  };

  const lastEquals = (m: ChatMessage) => {
    const last = messages[messages.length - 1];
    return !!last && last.role === m.role && last.content === m.content;
  };

  // string | null | undefined 를 받아서, 서버에 보낼 수 있는 값만 돌려주는 함수
  const normalizeTaskType = (taskType: string | null | undefined): ServerTaskType | undefined => {
    if (!taskType) return undefined;

    if (
      taskType === 'law_research' ||
      taskType === 'doc_create' ||
      taskType === 'doc_review' ||
      taskType === 'risk_assessment' ||
      taskType === 'law_interpret' ||
      taskType === 'edu_material' ||
      taskType === 'guideline_interpret' ||
      taskType === 'accident_search'
    ) {
      return taskType;
    }

    console.warn('[normalizeTaskType] unsupported taskType:', taskType);
    return undefined;
  };

  /** 일반 전송: 사용자 메시지를 추가하고 서버 요청 */
  const sendMessage = async (opts?: SendOptions) => {
    console.log('[sendMessage] called', {
      opts,
      input,
      hydrated,
      selectedJobType,
      monitorMode,
      activeRoomId,
      messagesLen: messages.length,
      threadId,
    });

    if (sendingRef.current) return;
    if (!hydrated) return;

    const hasFiles = !!opts?.files && opts.files.length > 0;

    const raw = (opts?.overrideMessage ?? input) || '';
    const trimmed = raw.trim();

    // 텍스트도 없고 파일도 없거나, 모니터 모드면 전송 안 함
    if ((!trimmed && !hasFiles) || monitorMode) return;

    // ✅ category 보정
    let effectiveJobType = selectedJobType;
    if (!effectiveJobType) {
      effectiveJobType = 'environment';
      try {
        setSelectedJobType('environment');
      } catch (e) {
        console.warn('[sendMessage] setSelectedJobType failed', e);
      }
    }

    // ✅ room 보장
    ensureRoom();

    const displayText = trimmed || (hasFiles ? '[파일 전송]' : '');
    const userMsg: ChatMessage = { role: 'user', content: displayText };

    // 첫 질문이면 제목 자동 세팅
    if (messages.length === 0) {
      setActiveRoomTitleIfEmpty(displayText);
    }

    // 직전 메시지와 완전히 같으면 중복 전송 방지
    if (lastEquals(userMsg)) return;

    // 트래킹
    pushToDataLayer('chat_send_click', {
      message: displayText,
      length: displayText.length,
      category: effectiveJobType,
    });

    // ✅ 메시지 업데이트는 store API로만 (rooms/messages 동기화는 store가 담당)
    addMessage(userMsg);

    // ✅ assistant placeholder (polling 완료 시 updateLastAssistant로 덮어씀)
    addMessage({ role: 'assistant', content: '' });

    setInput('');
    setLoading(true);
    setLoadingMessageIndex(0);
    setStatusMessage('');

    const fileInfo =
      hasFiles && opts?.files ? `\n• files: ${opts.files.map((f) => f.name).join(', ')}` : '';

    sendSlackMessage(
      `*[User]*\n• category: ${effectiveJobType}\n• threadId: ${
        threadId ?? '(new)'
      }\n• message:\n${displayText}${fileInfo}`,
    );

    const normalizedTaskType = normalizeTaskType(opts?.taskType);

    sendingRef.current = true;

    try {
      // ---------- 파일 base64 변환 ----------
      let filesPayload:
        | { name: string; type: string; size: number; content: string }[]
        | undefined;

      if (hasFiles && opts?.files) {
        filesPayload = await Promise.all(
          opts.files.map(async (file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            content: await fileToBase64(file),
          })),
        );
      }

      // ---------- API 호출 ----------
      let res: Response;

      if (!threadId) {
        const payload: any = {
          email: userInfo.email || 'anonymous',
          category: effectiveJobType,
          message: displayText,
        };
        if (normalizedTaskType) payload.task_type = normalizedTaskType;
        if (filesPayload) payload.files = filesPayload;

        res = await fetch('/api/start-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const payload: any = {
          thread_id: threadId,
          email: userInfo.email || 'anonymous',
          category: effectiveJobType,
          message: displayText,
        };
        if (normalizedTaskType) payload.task_type = normalizedTaskType;
        if (filesPayload) payload.files = filesPayload;

        res = await fetch('/api/start-followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) throw new Error(`start-chat failed: ${res.status}`);

      const json = await res.json();
      const { job_id, thread_id } = json as { job_id?: string; thread_id?: string };

      if (thread_id) setThreadId(thread_id);
      if (job_id) setJobId(job_id);
    } catch (e) {
      console.error('[sendMessage] ERROR', e);
      updateLastAssistant('⚠️ 요청 중 에러가 발생했습니다.');
      setLoading(false);
    } finally {
      setTimeout(() => {
        sendingRef.current = false;
      }, 300);
    }
  };

  /** 🔁 다시 생성: 사용자 메시지를 추가하지 않고 같은 질문만 재요청 */
  const regenerate = async (question?: string) => {
    if (sendingRef.current) return;
    if (!hydrated) return;

    ensureRoom();

    // 질문 확보 (없으면 마지막 user 메시지 사용)
    let q = (question ?? '').trim();
    if (!q) {
      const lastUser = [...useChatStore.getState().messages].reverse().find((m) => m.role === 'user');
      q = (lastUser?.content ?? '').trim();
    }
    if (!q) return;

    let effectiveJobType = selectedJobType;
    if (!effectiveJobType) {
      effectiveJobType = 'environment';
      try {
        setSelectedJobType('environment');
      } catch {}
    }

    // ✅ placeholder 추가 (기존 답변을 덮어쓰지 않게 새 assistant를 하나 만들고 그걸 update)
    addMessage({ role: 'assistant', content: '' });

    setLoading(true);
    setLoadingMessageIndex(0);
    setStatusMessage('');

    sendingRef.current = true;

    try {
      let res: Response;

      if (!threadId) {
        res = await fetch('/api/start-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userInfo.email || 'anonymous',
            category: effectiveJobType,
            message: q,
          }),
        });
      } else {
        res = await fetch('/api/start-followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: threadId,
            email: userInfo.email || 'anonymous',
            category: effectiveJobType,
            message: q,
          }),
        });
      }

      if (!res.ok) throw new Error(`regenerate failed: ${res.status}`);

      const { job_id, thread_id } = await res.json();
      if (thread_id) setThreadId(thread_id);
      setJobId(job_id);
    } catch (e) {
      console.error('[regenerate] ERROR', e);
      updateLastAssistant('⚠️ 다시 생성 중 오류가 발생했습니다.');
      setLoading(false);
    } finally {
      setTimeout(() => {
        sendingRef.current = false;
      }, 300);
    }
  };

  // 모니터링 로직
  const openMonitoring = () => {
    setMonitorMode(true);
    setSelectedTags([]);
    setCustomTagInput('');
    setPickedDocs({});
    setMonItems([]);
    setSearchQ('');
  };

  const toggleTag = (t: string) =>
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const addCustomTag = () => {
    const t = customTagInput.trim();
    if (!t) return;
    if (!selectedTags.includes(t)) setSelectedTags((prev) => [...prev, t]);
    setCustomTagInput('');
  };

  const removeSelectedTag = (t: string) => setSelectedTags((prev) => prev.filter((x) => x !== t));
  const togglePickDoc = (key: string) => setPickedDocs((p) => ({ ...p, [key]: !p[key] }));
  const clearMonitorPane = () => {
    setMonItems([]);
    setSearchQ('');
    setPickedDocs({});
    setSelectedTags([]);
    setCustomTagInput('');
  };

  const runMonitoring = async () => {
    ensureRoom();

    let effectiveJobType = selectedJobType;
    if (!effectiveJobType) {
      effectiveJobType = 'environment';
      try {
        setSelectedJobType('environment');
      } catch {}
    }

    const selections = monItems
      .filter((x) => pickedDocs[`${x.doc_type}:${x.doc_id}`])
      .map((x) => ({ doc_type: x.doc_type, doc_id: x.doc_id }));

    if (selectedTags.length === 0 && selections.length === 0) {
      addMessage({ role: 'assistant', content: '📌 태그를 1개 이상 선택하거나 문서를 선택해 주세요.' });
      return;
    }

    setMonLoading(true);

    try {
      const res = await fetch('/api/start-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userInfo.email || 'anonymous',
          category: effectiveJobType,
          tags: selectedTags,
          selections,
          since: undefined,
          brief_level: 'normal',
        }),
      });

      if (!res.ok) throw new Error(`start-monitoring failed: ${res.status}`);

      const { job_id } = await res.json();

      // ✅ 결과 표시용 placeholder
      addMessage({ role: 'assistant', content: '' });

      setJobId(job_id);
      setMonitorMode(false);
      setLoading(true);
      setLoadingMessageIndex(0);
      setStatusMessage('');
    } catch (e) {
      console.error('[runMonitoring] ERROR', e);
      addMessage({ role: 'assistant', content: '⚠️ 모니터링 시작 중 오류가 발생했습니다.' });
    } finally {
      setMonLoading(false);
    }
  };

  // 작업 상태 폴링
  useEffect(() => {
    if (!jobId) return;

    const renderServerError = async (res: Response, fallback = '요청 실패') => {
      const statusLine = `(${res.status} ${res.statusText || ''})`.trim();
      try {
        const body = await res.clone().json().catch(() => null);
        if (body) {
          const detail =
            body.detail ??
            body.error ??
            body.status_message ??
            body.message ??
            body.gpt_response ??
            JSON.stringify(body);
          return `⚠️ 상태 확인 실패 ${statusLine}\n${detail}`;
        }
        const text = await res.clone().text().catch(() => '');
        return `⚠️ 상태 확인 실패 ${statusLine}\n${text?.slice(0, 800) || fallback}`;
      } catch {
        return `⚠️ 상태 확인 실패 ${statusLine}\n${fallback}`;
      }
    };

    const renderThrownError = (e: unknown, ctx = '상태 확인 중') => {
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
      return `⚠️ ${ctx} 오류가 발생했습니다.\n${msg}`;
    };

    const clean = (t: string) =>
      (t || '')
        .replace(/---+/g, '')
        .replace(/["“”]/g, '')
        .replace(/\*\*/g, '')
        .replace(/\n/g, '<br />');

    const timer = setInterval(async () => {
      try {
        let res = await fetch(`/api/check-task?taskId=${jobId}`, { cache: 'no-store' });
        if (res.status === 400 || res.status === 422) {
          res = await fetch(`/api/check-task?jobId=${jobId}`, { cache: 'no-store' });
        }

        if (!res.ok) {
          const msg = await renderServerError(res, '상태 확인에 실패했습니다.');
          updateLastAssistant(msg.replace(/\n/g, '<br />'));
          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearInterval(timer);
          return;
        }

        const data = await res.json();
        if (data.status_message) setStatusMessage(data.status_message);

        if (data.status === 'done') {
          const content = clean(
            data.gpt_response ||
              (data.is_empty ? '📭 키워드/태그에 해당하는 변경이 없습니다.' : '✅ 작업이 완료되었습니다.'),
          );
          updateLastAssistant(content);

          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearMonitorPane();
          clearInterval(timer);
          return;
        }

        if (data.status === 'error') {
          const content = clean(data.error || data.status_message || '⚠️ 서버 처리 중 오류가 발생했습니다.');
          updateLastAssistant(content);

          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearInterval(timer);
          return;
        }
      } catch (e) {
        updateLastAssistant(renderThrownError(e).replace(/\n/g, '<br />'));
        setLoading(false);
        setJobId(null);
        setStatusMessage('');
        clearInterval(timer);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [jobId, updateLastAssistant]);

  return {
    messages,
    input,
    setInput,
    loading,
    loadingMessageIndex,
    LOADING_MESSAGES,
    statusMessage,
    sendMessage,
    regenerate,
    newChat,
    monitorMode,
    openMonitoring,
    selectedTags,
    presetTags,
    toggleTag,
    customTagInput,
    setCustomTagInput,
    addCustomTag,
    removeSelectedTag,
    monItems,
    setMonItems,
    pickedDocs,
    togglePickDoc,
    searchQ,
    setSearchQ,
    runMonitoring,
    monLoading,
  };
}
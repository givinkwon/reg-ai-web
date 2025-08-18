'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore, ChatMessage } from '../../store/chat';
import { useUserStore } from '../../store/user';
import styles from './ChatWindow.module.css';
import { pushToDataLayer } from '@/app/lib/analytics';

type MonItem = {
  doc_type: '법령' | '행정규칙' | '자치법규' | string;
  doc_id: string;
  title: string;
};

const TAG_PRESETS: Record<string, string[]> = {
  finance: [
    '은행', '자산', '자산운용', '증권', '금융소비자보호', '자본시장', '공시', '내부통제',
    'AML/KYC', '전자금융', '신용정보', '마이데이터', '집합투자',
  ],
  infosec: [
    '개인정보', 'ISMS', '망분리', '암호화', '접근통제',
    '전자서명', '침해사고', '클라우드 보안', '물리보안', 'DR/BCP',
  ],
  construction: ['중대재해', '건설', '기술', '안전', '품질', '감리', '도시계획', '주택', '소음', '진동'],
  bio: ['의약품', '의료기기', 'GMP', '임상', '광고', '표시', '유전자', '식약처 고시'],
  environment: ['화학물질', '가스', '소방', '방재','대기', '수질', '폐기물', '유해물질', '온실가스', 'REACH', 'K-REACH'],
  procurement: ['국가계약법', '입찰', '낙찰', '계약', '조달청'],
  hr: ['중대재해', '산업안전', '보건', '채용절차', '장애인', '개인정보보호', '징계', '인사'],
  default: ['시행일', '개정', '부칙', '별표서식', '고시개정', '행정예고'],
};

export default function ChatWindow() {
  const router = useRouter();

  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const { selectedJobType, userInfo } = useUserStore();

  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const [monitorMode, setMonitorMode] = useState(false);
  const [monItems, setMonItems] = useState<MonItem[]>([]);
  const [pickedDocs, setPickedDocs] = useState<Record<string, boolean>>({});
  const [searchQ, setSearchQ] = useState('');
  const [monLoading, setMonLoading] = useState(false);

  // 상단 state 목록에 추가
  const [threadId, setThreadId] = useState<string | null>(null);

  const presetTags = useMemo(
    () => TAG_PRESETS[selectedJobType as keyof typeof TAG_PRESETS] || TAG_PRESETS.default,
    [selectedJobType],
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  
  useEffect(() => {
    // 사용자가 카테고리를 바꾸면 새 스레드로 시작하고 싶을 때만 사용
    setThreadId(null);
  }, [selectedJobType]);

  const LOADING_MESSAGES = useMemo(
    () => [
      '🌀 RegAI가 질의/태그를 분석합니다...',
      '📚 관련 법령과 조문을 찾았습니다. 분석 중입니다...',
      '🔍 정확한 답변을 위해 다시 확인 중입니다. 잠시만 기다려주세요...',
    ],
    [],
  );

  useEffect(() => {
    if (!selectedJobType) router.push('/');
  }, [selectedJobType, router]);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev,
      );
    }, 30000);
    return () => clearInterval(interval);
  }, [loading, LOADING_MESSAGES.length]);

  const sendSlackMessage = (text: string) => {
    const payload = { text: text.slice(0, 3500) };
    fetch('/api/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || monitorMode) return;

    pushToDataLayer('chat_send_click', {
      message: trimmed,
      length: trimmed.length,
      category: selectedJobType,
    });

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    addMessage(userMsg);
    setInput('');
    setLoading(true);
    setLoadingMessageIndex(0);
    setStatusMessage('');

    sendSlackMessage(`*[User]*\n• category: ${selectedJobType}\n• threadId: ${threadId ?? '(new)'}\n• message:\n${trimmed}`);

    try {
      let res: Response;

      if (!threadId) {
        // ✅ 첫 질문: /start-task
        res = await fetch('/api/start-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userInfo.email || 'anonymous',
            category: selectedJobType,
            message: trimmed,
          }),
        });
      } else {
        // ✅ 후속 질문: /start-followup
        res = await fetch('/api/start-followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_id: threadId,
            email: userInfo.email || 'anonymous',
            category: selectedJobType,
            message: trimmed,
          }),
        });
      }

      if (!res.ok) throw new Error(`start-chat failed: ${res.status}`);
      const { job_id, thread_id } = await res.json();

      // 서버가 반환하는 thread_id로 업데이트(첫 질문이면 새로 세팅, 후속이면 그대로 유지/동일 확인)
      if (thread_id) setThreadId(thread_id);
      setJobId(job_id);
    } catch (e) {
      addMessage({ role: 'assistant', content: '⚠️ 요청 중 에러가 발생했습니다.' });
      setLoading(false);
    }
  };


  const openMonitoring = async () => {
    setMonitorMode(true);
    setSelectedTags([]);
    setCustomTagInput('');
    setPickedDocs({});
    setMonItems([]);
    setSearchQ('');
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };
  const addCustomTag = () => {
    const t = customTagInput.trim();
    if (!t) return;
    if (!selectedTags.includes(t)) setSelectedTags((prev) => [...prev, t]);
    setCustomTagInput('');
  };
  const removeSelectedTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  const loadOptions = async (q?: string, tags?: string[]) => {
    const tagCsv = (tags && tags.length > 0 ? tags : selectedTags).join(',');
    const url =
      `/api/monitor/law-options?kind=all` +
      (q ? `&q=${encodeURIComponent(q)}` : '') +
      (tagCsv ? `&tags=${encodeURIComponent(tagCsv)}` : '');
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`law-options failed: ${r.status}`);
    const data = await r.json();
    setMonItems((data.items || []) as MonItem[]);
  };

  const togglePickDoc = (key: string) => {
    setPickedDocs((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const clearMonitorPane = () => {
    setMonItems([]);
    setSearchQ('');
    setPickedDocs({});
    setSelectedTags([]);
    setCustomTagInput('');
  };

  const runMonitoring = async () => {
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
          category: selectedJobType,
          tags: selectedTags,
          selections,
          since: undefined,
          brief_level: 'normal',
        }),
      });
      if (!res.ok) throw new Error(`start-monitoring failed: ${res.status}`);
      const { job_id } = await res.json();
      setJobId(job_id);

      setMonitorMode(false);
      setLoading(true);
      setLoadingMessageIndex(0);
      setStatusMessage('');
    } catch {
      addMessage({ role: 'assistant', content: '⚠️ 모니터링 시작 중 오류가 발생했습니다.' });
    } finally {
      setMonLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;

    // 🔸 에러 메시지 헬퍼 (이 effect 내부에만 사용)
    const renderServerError = async (res: Response, fallback = '요청 실패') => {
      const statusLine = `(${res.status} ${res.statusText || ''})`.trim();
      try {
        // JSON 파싱 시도
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
        // 텍스트 파싱 시도
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

    const interval = setInterval(async () => {
      try {
        let res = await fetch(`/api/check-task?taskId=${jobId}`, { cache: 'no-store' });
        if (res.status === 400 || res.status === 422) {
          res = await fetch(`/api/check-task?jobId=${jobId}`, { cache: 'no-store' });
        }

        if (!res.ok) {
          // ✅ 404도 메시지 남기고 깔끔히 종료(계속 폴링 방지)
          const msg = await renderServerError(res, '상태 확인에 실패했습니다.');
          addMessage({ role: 'assistant', content: msg.replace(/\n/g, '<br />') });
          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearInterval(interval);
          return;
        }

        const data = await res.json();

        if (data.status_message) setStatusMessage(data.status_message);

        if (data.status === 'done') {
          // ✅ 완료 but 빈 결과 안내 개선
          const content = cleanText(
            data.gpt_response ||
              (data.is_empty ? '📭 키워드/태그에 해당하는 변경이 없습니다.' : '✅ 작업이 완료되었습니다.')
          );
          addMessage({ role: 'assistant', content });
          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearMonitorPane();
          clearInterval(interval);
        } else if (data.status === 'error') {
          // ✅ 서버가 내려준 구체 에러 우선 노출
          const errMsg = cleanText(
            data.error || data.status_message || '⚠️ 서버 처리 중 오류가 발생했습니다.'
          );
          addMessage({ role: 'assistant', content: errMsg });
          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearInterval(interval);
        }
      } catch (e) {
        // ✅ 네트워크/예외 메시지 그대로 표시
        addMessage({
          role: 'assistant',
          content: renderThrownError(e).replace(/\n/g, '<br />'),
        });
        setLoading(false);
        setJobId(null);
        setStatusMessage('');
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, addMessage]);

  const cleanText = (text: string) =>
    text
      .replace(/---+/g, '')
      .replace(/["“”]/g, '')
      .replace(/\*\*/g, '')
      .replace(/\n/g, '<br />');

  return (
    <div className={styles.chatWindow}>
      {!userInfo.email && (
        <div className={styles.loginHint}>
          ⚠️ 로그인하시면 대화 기록을 기반으로 더 똑똑한 답변을 받을 수 있어요!
        </div>
      )}

      {messages.length === 0 && (
        <div className={`${styles.assistant} ${styles.welcomeCard}`}>
          <div className={styles.welcomeText}>
            안녕하세요! 필요한 규제 업데이트를 한눈에 브리핑해 드릴게요. 😊
          </div>
          <div className={styles.actionRow}>
            <button onClick={openMonitoring} className={styles.chip}>
              # 오늘의 모니터링
            </button>
          </div>
        </div>
      )}

      {monitorMode && (
        <div className={`${styles.assistant} ${styles.monitorPane}`}>
          <div className={styles.panelTitle}>오늘의 모니터링</div>

          <div className={styles.sectionTitle}>관심 태그를 선택하세요 (복수 선택 가능)</div>
          <div className={styles.tagGrid}>
            {presetTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`${styles.chip} ${selectedTags.includes(tag) ? styles.chipActive : ''}`}
              >
                #{tag}
              </button>
            ))}
          </div>

          <div className={styles.fieldRow}>
            <input
              className={`${styles.field} ${styles.inputField}`}
              placeholder="원하는 태그(키워드)를 직접 입력"
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
            />
            <button className={styles.primary} onClick={addCustomTag}>추가</button>
          </div>

          {selectedTags.length > 0 && (
            <div className={styles.tagGrid}>
              {selectedTags.map((t) => (
                <span key={t} className={styles.selectedTag}>
                  #{t}
                  <button
                    aria-label={`${t} 제거`}
                    onClick={() => removeSelectedTag(t)}
                    className={styles.tagRemove}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.primary} disabled={monLoading} onClick={runMonitoring}>
              {monLoading ? '시작 중...' : '모니터링 시작'}
            </button>
            <button
              className={styles.ghost}
              onClick={() => {
                setMonitorMode(false);
                clearMonitorPane();
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div className={styles.messages}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={msg.role === 'user' ? styles.user : styles.assistant}
            dangerouslySetInnerHTML={{ __html: msg.content }}
          />
        ))}

        {loading && (
          <div className={styles.assistant}>
            <div className={styles.loadingStage}>
              <span>{statusMessage || LOADING_MESSAGES[loadingMessageIndex]}</span>
              <div className={styles.loadingDots}>
                <span className={styles.dot}></span>
                <span className={styles.dot}></span>
                <span className={styles.dot}></span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.inputArea}>
        <input
          className={styles.inputField}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !monitorMode && sendMessage()}
          placeholder="질문을 입력하거나, 위의 # 오늘의 모니터링을 클릭하세요"
          disabled={monitorMode}
        />
        <button className={styles.sendButton} onClick={sendMessage} disabled={loading || monitorMode}>
          전송
        </button>
      </div>
    </div>
  );
}

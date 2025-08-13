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
    '금융소비자보호', '자본시장', '공시', '적합성·적정성', '내부통제',
    'AML/KYC', '전자금융', '개인신용정보', '마이데이터', '집합투자',
  ],
  infosec: [
    '개인정보', 'ISMS', '망분리', '암호화', '접근통제',
    '전자서명', '침해사고', '클라우드 보안', '물리보안', 'DR/BCP',
  ],
  construction: ['건설기술', '안전관리', '품질관리', '감리', '도시계획', '주택', '소음·진동'],
  bio: ['의약품', '의료기기', 'GMP', '임상', '표시·광고', '유전자', '식약처 고시'],
  environment: ['화학물질', '대기', '수질', '폐기물', '유해물질', '온실가스', 'REACH', 'K-REACH'],
  procurement: ['국가계약법', '입찰', '낙찰하한율', '계약이행', '조달청 고시'],
  hr: ['중대재해', '산업안전보건', '채용절차', '장애인고용', '개인정보보호', '징계·인사'],
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

  const presetTags = useMemo(
    () => TAG_PRESETS[selectedJobType as keyof typeof TAG_PRESETS] || TAG_PRESETS.default,
    [selectedJobType],
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');

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

    sendSlackMessage(`*[User]*\n• category: ${selectedJobType}\n• message:\n${trimmed}`);

    try {
      const res = await fetch('/api/start-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userInfo.email || 'anonymous',
          category: selectedJobType,
          message: trimmed,
        }),
      });
      if (!res.ok) throw new Error(`start-task failed: ${res.status}`);
      const { job_id } = await res.json();
      setJobId(job_id);
    } catch {
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

    const interval = setInterval(async () => {
      try {
        let res = await fetch(`/api/check-task?taskId=${jobId}`, { cache: 'no-store' });
        if (res.status === 400 || res.status === 422) {
          res = await fetch(`/api/check-task?jobId=${jobId}`, { cache: 'no-store' });
        }
        if (!res.ok) {
          if (res.status === 404) return;
          addMessage({ role: 'assistant', content: '⚠️ 상태 확인 중 오류가 발생했습니다.' });
          setLoading(false);
          setJobId(null);
          clearInterval(interval);
          return;
        }
        const data = await res.json();

        if (data.status_message) setStatusMessage(data.status_message);

        if (data.status === 'done') {
          addMessage({
            role: 'assistant',
            content: cleanText(data.gpt_response || '⚠️ 요약이 비어 있습니다.'),
          });
          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearMonitorPane();
          clearInterval(interval);
        } else if (data.status === 'error') {
          addMessage({ role: 'assistant', content: '⚠️ 서버 처리 중 오류가 발생했습니다.' });
          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearInterval(interval);
        }
      } catch {
        addMessage({ role: 'assistant', content: '⚠️ 상태 확인 중 오류가 발생했습니다.' });
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

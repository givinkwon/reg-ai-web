'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

export default function ChatWindow() {
  const router = useRouter();

  // 기존 스토어
  const messages = useChatStore((state) => state.messages);
  const addMessage = useChatStore((state) => state.addMessage);
  const { selectedJobType, userInfo } = useUserStore();

  // 입력/잡 상태
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  // 모니터링 UI 상태
  const [monitorMode, setMonitorMode] = useState(false);
  const [monItems, setMonItems] = useState<MonItem[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [searchQ, setSearchQ] = useState('');
  const [monLoading, setMonLoading] = useState(false);

  // 로딩 단계 문구
  const LOADING_MESSAGES = useMemo(
    () => [
      '🌀 RegAI가 질의를 분석합니다...',
      '📚 관련 법령과 조문을 찾았습니다. 분석 중입니다...',
      '🔍 정확한 답변을 위해 다시 확인 중입니다. 잠시만 기다려주세요...',
    ],
    [],
  );

  // 직무 미선택 시 홈으로
  useEffect(() => {
    if (!selectedJobType) router.push('/');
  }, [selectedJobType, router]);

  // 로딩 중 진행 메시지 자연스러운 교체
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev));
    }, 30000);
    return () => clearInterval(interval);
  }, [loading, LOADING_MESSAGES.length]);

  // 슬랙(없어도 무시)
  const sendSlackMessage = (text: string) => {
    const payload = { text: text.slice(0, 3500) };
    fetch('/api/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* 웹훅 미설정 시 실패해도 무시 */
    });
  };

  // ====== 공통: 일반 질의 흐름 (/api/start-task) ======
  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

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
    } catch (err) {
      addMessage({ role: 'assistant', content: '⚠️ 요청 중 에러가 발생했습니다.' });
      setLoading(false);
    }
  };

  // ====== “오늘의 모니터링” 퀵액션 ======
  const handleQuickAction = async (action: 'monitor') => {
    if (action !== 'monitor') return;
    setMonitorMode(true);
    setSearchQ('');
    setPicked({});
    try {
      await loadOptions(); // 기본 목록 로드
    } catch (e) {
      addMessage({ role: 'assistant', content: '⚠️ 모니터링 옵션을 불러오지 못했습니다.' });
    }
  };

  const loadOptions = async (q?: string) => {
    const url = `/api/monitor/law-options?kind=all${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`law-options failed: ${r.status}`);
    const data = await r.json();
    setMonItems((data.items || []) as MonItem[]);
  };

  const togglePick = (key: string) => {
    setPicked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const clearPicks = () => setPicked({});

  const clearMonitorPane = () => {
    setMonItems([]);
    setSearchQ('');
    clearPicks();
  };

  const runMonitoring = async () => {
    const selections = monItems
      .filter((x) => picked[`${x.doc_type}:${x.doc_id}`])
      .map((x) => ({ doc_type: x.doc_type, doc_id: x.doc_id }));

    if (selections.length === 0) {
      addMessage({ role: 'assistant', content: '📌 모니터링할 문서를 선택하세요.' });
      return;
    }

    setMonLoading(true);
    try {
      const res = await fetch('/api/start-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userInfo.email || 'anonymous',
          selections,
          since: undefined, // 필요시 "YYYY-MM-DD" 지정
          brief_level: 'normal',
          category: selectedJobType,
        }),
      });
      if (!res.ok) throw new Error(`start-monitoring failed: ${res.status}`);
      const { job_id } = await res.json();
      setJobId(job_id);
      setMonitorMode(false); // 패널 닫고 폴링으로 결과 수신
      setLoading(true);
      setLoadingMessageIndex(0);
      setStatusMessage(''); // 백엔드 status_message를 표시함
    } catch (e) {
      addMessage({ role: 'assistant', content: '⚠️ 모니터링 시작 중 오류가 발생했습니다.' });
    } finally {
      setMonLoading(false);
    }
  };

  // ====== 폴링 (/api/check-task) — taskId 우선, 실패시 jobId 재시도 ======
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        let res = await fetch(`/api/check-task?taskId=${jobId}`, { cache: 'no-store' });
        if (res.status === 400 || res.status === 422) {
          // 프록시/서버에 따라 jobId를 기대할 수도 있음
          res = await fetch(`/api/check-task?jobId=${jobId}`, { cache: 'no-store' });
        }

        if (!res.ok) {
          if (res.status === 404) return; // 아직 생성 안 됐을 수 있음(조용히 대기)
          const text = await res.text().catch(() => '');
          console.error('check-task failed', res.status, text);
          addMessage({ role: 'assistant', content: '⚠️ 상태 확인 중 오류가 발생했습니다.' });
          setLoading(false);
          setJobId(null);
          clearInterval(interval);
          return;
        }

        const data = await res.json();

        // 백엔드가 보내는 진행 단계 메시지
        if (data.status_message) setStatusMessage(data.status_message);

        if (data.status === 'done') {
          addMessage({
            role: 'assistant',
            content: cleanText(data.gpt_response || '⚠️ 답변이 없습니다.'),
          });
          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearMonitorPane(); // 패널 상태 초기화
          clearInterval(interval);
        } else if (data.status === 'error') {
          addMessage({ role: 'assistant', content: '⚠️ 서버 처리 중 오류가 발생했습니다.' });
          setLoading(false);
          setJobId(null);
          setStatusMessage('');
          clearInterval(interval);
        }
      } catch (err) {
        console.error('❌ 상태 확인 실패:', err);
        addMessage({ role: 'assistant', content: '⚠️ 상태 확인 중 오류가 발생했습니다.' });
        setLoading(false);
        setJobId(null);
        setStatusMessage('');
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, addMessage]);

  // 유틸
  const cleanText = (text: string) =>
    text
      .replace(/---+/g, '')
      .replace(/["“”]/g, '')
      .replace(/\*\*/g, '')
      .replace(/\n/g, '<br />');

  // ====== UI ======
  return (
    <div className={styles.chatWindow}>
      {/* 로그인 유도 */}
      {!userInfo.email && (
        <div className={styles.loginHint}>
          ⚠️ 로그인하시면 대화 기록을 기반으로 더 똑똑한 답변을 받을 수 있어요!
        </div>
      )}

      {/* 첫 인사 + 퀵액션 (대화가 비었을 때 표시) */}
      {messages.length === 0 && (
        <div
          className={styles.assistant}
          style={{ marginBottom: 12, borderRadius: 8, padding: 12 }}
        >
          <div style={{ marginBottom: 8 }}>
            안녕하세요! 필요한 규제를 빠르게 찾고 요약해 드릴게요. 😊
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => handleQuickAction('monitor')}
              style={{
                border: '1px solid #e2e2e2',
                background: '#fff',
                borderRadius: 999,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
              aria-label="오늘의 모니터링 시작"
            >
              # 오늘의 모니터링
            </button>
            {/* 향후 다른 퀵액션이 있으면 여기에 추가 */}
          </div>
        </div>
      )}

      {/* 모니터링 선택 패널 */}
      {monitorMode && (
        <div
          className={styles.assistant}
          style={{
            marginBottom: 12,
            borderRadius: 8,
            padding: 12,
            background: '#f7f7f9',
            border: '1px solid #eee',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>오늘의 모니터링</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className={styles.inputField}
              placeholder="법령/행정규칙/자치법규 검색"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadOptions(searchQ)}
            />
            <button onClick={() => loadOptions(searchQ)}>검색</button>
          </div>

          <div
            style={{
              maxHeight: 260,
              overflow: 'auto',
              border: '1px solid #eee',
              borderRadius: 6,
              padding: 8,
              background: '#fff',
            }}
          >
            {monItems.length === 0 ? (
              <div style={{ color: '#777' }}>검색 결과가 없습니다.</div>
            ) : (
              monItems.map((it) => {
                const key = `${it.doc_type}:${it.doc_id}`;
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 4px',
                      borderBottom: '1px dashed #eee',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!picked[key]}
                      onChange={() => togglePick(key)}
                    />
                    <span>
                      <b>[{it.doc_type}]</b> {it.title}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button disabled={monLoading} onClick={runMonitoring}>
              {monLoading ? '시작 중...' : '모니터링 시작'}
            </button>
            <button
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

      {/* 메시지 영역 */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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

      {/* 입력 영역 */}
      <div className={styles.inputArea}>
        <input
          className={styles.inputField}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !monitorMode && sendMessage()}
          placeholder="질문을 입력하거나, 위의 # 오늘의 모니터링을 클릭하세요"
          disabled={monitorMode}
        />
        <button
          className={styles.sendButton}
          onClick={sendMessage}
          disabled={loading || monitorMode}
        >
          전송
        </button>
      </div>
    </div>
  );
}

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
  // 혹시 모르는 기본값
  default: ['시행일', '개정', '부칙', '별표서식', '고시개정', '행정예고'],
};

export default function ChatWindow() {
  const router = useRouter();

  // 기존 전역 스토어
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const { selectedJobType, userInfo } = useUserStore();

  // 공통 입력/잡 상태
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  // 모니터링 UI 상태
  const [monitorMode, setMonitorMode] = useState(false);
  const [monItems, setMonItems] = useState<MonItem[]>([]);
  const [pickedDocs, setPickedDocs] = useState<Record<string, boolean>>({});
  const [searchQ, setSearchQ] = useState('');
  const [monLoading, setMonLoading] = useState(false);

  // 태그 상태(프리셋 + 커스텀)
  const presetTags = useMemo(
    () => TAG_PRESETS[selectedJobType as keyof typeof TAG_PRESETS] || TAG_PRESETS.default,
    [selectedJobType],
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');

  // 로딩 단계 문구
  const LOADING_MESSAGES = useMemo(
    () => [
      '🌀 RegAI가 질의/태그를 분석합니다...',
      '📚 관련 법령과 조문을 찾았습니다. 분석 중입니다...',
      '🔍 정확한 답변을 위해 다시 확인 중입니다. 잠시만 기다려주세요...',
    ],
    [],
  );

  // 직무 미선택 시 홈으로
  useEffect(() => {
    if (!selectedJobType) router.push('/');
  }, [selectedJobType, router]);

  // 로딩 중 친절한 메시지 순환
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev,
      );
    }, 30000);
    return () => clearInterval(interval);
  }, [loading, LOADING_MESSAGES.length]);

  // --- Slack (없으면 실패 무시) ---
  const sendSlackMessage = (text: string) => {
    const payload = { text: text.slice(0, 3500) };
    fetch('/api/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  // --- 일반 질의 (/api/start-task) ---
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
    } catch (err) {
      addMessage({ role: 'assistant', content: '⚠️ 요청 중 에러가 발생했습니다.' });
      setLoading(false);
    }
  };

  // === 첫 인사에서 “오늘의 모니터링” 클릭 → 태그 우선 UI 열기 ===
  const openMonitoring = async () => {
    setMonitorMode(true);
    setSelectedTags([]);
    setCustomTagInput('');
    setPickedDocs({});
    setMonItems([]);
    setSearchQ('');
    // 태그만으로도 실행 가능하지만, 초기에 기본 후보를 보여주고 싶으면 아래 주석 해제:
    // await loadOptions('', []);
  };

  // --- 태그 토글/추가/삭제 ---
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

  // --- 문서 후보 로드(태그와 검색어 동시 사용 가능) ---
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

  // --- 문서 선택/초기화 ---
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

  // --- 모니터링 시작 ---
  const runMonitoring = async () => {
    const selections = monItems
      .filter((x) => pickedDocs[`${x.doc_type}:${x.doc_id}`])
      .map((x) => ({ doc_type: x.doc_type, doc_id: x.doc_id }));

    // selections가 비어도 OK: 백엔드가 tags만으로 “오늘 업데이트” 필터링 가능해야 함
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
          tags: selectedTags,          // ✅ 태그 전달(백엔드는 옵션으로 받도록)
          selections,                  // ✅ 선택 문서(없어도 OK)
          since: undefined,            // 필요시 "YYYY-MM-DD"
          brief_level: 'normal',
        }),
      });
      if (!res.ok) throw new Error(`start-monitoring failed: ${res.status}`);
      const { job_id } = await res.json();
      setJobId(job_id);

      // 패널 닫고 로딩 UI로 전환
      setMonitorMode(false);
      setLoading(true);
      setLoadingMessageIndex(0);
      setStatusMessage('');
    } catch (e) {
      addMessage({ role: 'assistant', content: '⚠️ 모니터링 시작 중 오류가 발생했습니다.' });
    } finally {
      setMonLoading(false);
    }
  };

  // --- 폴링: taskId 우선, 실패 시 jobId 백업 ---
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        let res = await fetch(`/api/check-task?taskId=${jobId}`, { cache: 'no-store' });
        if (res.status === 400 || res.status === 422) {
          res = await fetch(`/api/check-task?jobId=${jobId}`, { cache: 'no-store' });
        }
        if (!res.ok) {
          if (res.status === 404) return; // 아직 준비 전이면 조용히 대기
          const text = await res.text().catch(() => '');
          console.error('check-task failed', res.status, text);
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
      } catch (err) {
        console.error('❌ 상태 확인 실패:', err);
        addMessage({ role: 'assistant', content: '⚠️ 상태 확인 중 오류가 발생했습니다.' });
        setLoading(false);
        setJobId(null);
        setStatusMessage('');
        clearInterval(interval);
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

  // ===================== 렌더 =====================
  return (
    <div className={styles.chatWindow}>
      {/* 로그인 유도 */}
      {!userInfo.email && (
        <div className={styles.loginHint}>
          ⚠️ 로그인하시면 대화 기록을 기반으로 더 똑똑한 답변을 받을 수 있어요!
        </div>
      )}

      {/* 첫 인사 + 액션칩 (대화가 비었을 때) */}
      {messages.length === 0 && (
        <div className={styles.assistant} style={{ marginBottom: 12, borderRadius: 8, padding: 12 }}>
          <div style={{ marginBottom: 8 }}>안녕하세요! 필요한 규제 업데이트를 한눈에 브리핑해 드릴게요. 😊</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={openMonitoring}
              style={{ border: '1px solid #e2e2e2', background: '#fff', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}
            >
              # 오늘의 모니터링
            </button>
          </div>
        </div>
      )}

      {/* 모니터링 패널 */}
      {monitorMode && (
        <div
          className={styles.assistant}
          style={{ marginBottom: 12, borderRadius: 8, padding: 12, background: '#f7f7f9', border: '1px solid #eee' }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>오늘의 모니터링</div>

          {/* 1) 태그 선택(프리셋) */}
          <div style={{ marginBottom: 8 }}>관심 태그를 선택하세요 (복수 선택 가능)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {presetTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: selectedTags.includes(tag) ? '1px solid #5b8cff' : '1px solid #ddd',
                  background: selectedTags.includes(tag) ? '#eef3ff' : '#fff',
                  cursor: 'pointer',
                }}
              >
                #{tag}
              </button>
            ))}
          </div>

          {/* 커스텀 태그 입력 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              className={styles.inputField}
              placeholder="원하는 태그(키워드)를 직접 입력"
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
            />
            <button onClick={addCustomTag}>추가</button>
          </div>

          {/* 선택된 태그 목록 */}
          {selectedTags.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {selectedTags.map((t) => (
                <span
                  key={t}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 999,
                    background: '#222',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  #{t}
                  <button
                    aria-label={`${t} 제거`}
                    onClick={() => removeSelectedTag(t)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 2) 문서 후보 검색/로드 (선택사항) */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className={styles.inputField}
              placeholder="법령/행정규칙/자치법규 검색 (선택)"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadOptions(searchQ, selectedTags)}
            />
            <button onClick={() => loadOptions(searchQ, selectedTags)}>검색</button>
          </div>

          <div
            style={{
              maxHeight: 260,
              overflow: 'auto',
              border: '1px solid #eee',
              borderRadius: 6,
              padding: 8,
              background: '#fff',
              marginBottom: 10,
            }}
          >
            {monItems.length === 0 ? (
              <div style={{ color: '#777' }}>
                (선택) 문서 후보를 보고 싶으면 위에서 검색하세요. 태그만 선택해도 모니터링을 시작할 수 있어요.
              </div>
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
                      checked={!!pickedDocs[key]}
                      onChange={() => togglePickDoc(key)}
                    />
                    <span>
                      <b>[{it.doc_type}]</b> {it.title}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
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

      {/* 입력 영역 (모니터링 중에는 비활성화) */}
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

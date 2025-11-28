'use client';

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
  X
} from 'lucide-react';

import { Button } from '../../components/ui/button';
import { useChatController } from '../useChatController';
import { useChatStore, ChatMessage } from '../../store/chat';
import { useUserStore } from '../../store/user';
import Cookies from 'js-cookie';
import s from './ChatArea.module.css';

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  environment: { label: '환경/안전', emoji: '🌱' },
  infosec: { label: '정보보안', emoji: '🛡️' },
};

type TaskType =
  | 'law_research'
  | 'doc_review'
  | 'risk_assessment'
  | 'law_interpret'
  | 'edu_material'
  | 'guideline_interpret';   // ✅ 실무지침 해석

const TASK_META: Record<TaskType, { label: string }> = {
  law_research: { label: '법령 조사' },
  doc_review: { label: '안전 문서 생성/검토' },
  risk_assessment: { label: '위험성 평가' },
  law_interpret: { label: 'AI 법령 해석' },
  edu_material: { label: '교육자료 생성' },
  guideline_interpret: { label: '실무지침 해석' }, // ✅ 추가
};


// TaskType 이미 위에 있음
// import 쪽은 그대로 두고, 아래 타입/상수만 추가

type QuickAction = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
  taskType?: TaskType;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'accident_search',
    label: '사고사례 검색',
    icon: Search,
    placeholder: '지게차, 크레인 등 특정 설비와 관련된 사고사례를 찾아줘.',
    taskType: 'law_research',
  },
  {
    id: 'today_accident',
    label: '금주의 안전 뉴스',
    icon: AlertTriangle,
    placeholder: '이번 주 산업안전/보건 관련 주요 뉴스를 정리해줘.',
    taskType: 'law_research',
  },
  {
    id: 'notice_summary',
    label: '입법 예고 요약',
    icon: FileText,
    placeholder:
      '첨부한 입법예고문을 안전/보건 관점에서 핵심만 요약해줘.',
    taskType: 'doc_review',
  },
  {
    id: 'doc_create',
    label: '안전 문서 생성',
    icon: FileText,
    placeholder:
      '어떤 안전 문서를 만들지 알려주면 템플릿을 만들어줄게.',
    taskType: 'doc_review',
  },
  {
    id: 'doc_review',
    label: '안전 문서 검토',
    icon: FileText,
    placeholder:
      '첨부한 안전 문서의 누락된 항목과 개선점을 검토해줘.',
    taskType: 'doc_review',
  },
  {
    id: 'risk_assess',
    label: '위험성 평가',
    icon: AlertTriangle,
    placeholder:
      '지정한 공정에 대해 KOSHA 가이드 기준으로 위험성평가를 도와줘.',
    taskType: 'risk_assessment',
  },
  {
    id: 'law_interpret',
    label: 'AI 법령 해석',
    icon: FileText,
    placeholder:
      '산업안전보건법 제000조를 현장 담당자가 이해하기 쉽게 풀이해줘.',
    taskType: 'law_interpret',
  },
  {
    id: 'edu_material',
    label: '교육자료 생성',
    icon: FileText,
    placeholder:
      '신입 직원 교육용 산업안전 교육자료 개요를 만들어줘.',
    taskType: 'edu_material',
  },

  // ✅ 새로 추가: 실무지침 해석
  {
    id: 'guideline_interpret',
    label: '실무지침 해석',
    icon: FileText,
    placeholder:
      '우리 사업장(업종, 규모, 주요 공정)에 맞는 안전보건 실무지침을 정리해줘.',
    taskType: 'guideline_interpret',
  },
];


export default function ChatArea() {
  const {
    messages, input, setInput,
    loading, loadingMessageIndex, LOADING_MESSAGES, statusMessage,
    sendMessage, regenerate,
  } = useChatController();

  // 처음에는 무조건 "기능 화면" 모드
  const [showLanding, setShowLanding] = useState(true);

  const { selectedJobType, setSelectedJobType } = useUserStore();
  const [showTypeModal, setShowTypeModal] = useState(false);

  // NEW: 작업 선택 모달 + 선택된 작업
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] =
  useState<TaskType | null>('guideline_interpret');

  // NEW: 첨부 파일
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  const setMessages = useChatStore((st) => st.setMessages);
  const openRightFromHtml = useChatStore((st) => st.openRightFromHtml);

  // 공유 링크 초기 로딩 1회 보장
  const bootOnce = useRef(false);

  // 복사 토스트
  const [copied, setCopied] = useState(false);

  // 각 assistant 본문 엘리먼트 참조 (index -> element)
  const contentRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // 하단 스크롤
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, loadingMessageIndex]);

  // 🔵 어떤 태스크(법령/실무지침)에 대한 힌트를 보여줄지
  type HintTask = 'law_interpret' | 'guideline_interpret';

  const [activeHintTask, setActiveHintTask] = useState<HintTask | null>(null);
  const [activeHints, setActiveHints] = useState<string[]>([]);

  const LAW_INTRO_TEXT =
    '법령과 규제사항을 학습한 REA AI가 내 사업장에 딱 맞는 실무지침을 안내해드려요! 무엇을 도와드릴까요?';

  const GUIDELINE_INTRO_TEXT =
    '현장의 작업절차, 점검표, 교육·훈련 등 실무지침을 REA AI가 법령에 맞게 정리해드려요! 무엇을 도와드릴까요?';

  // AI 법령 해석용 힌트 10개
  const LAW_INTERPRET_HINTS: string[] = [
    '우리 사업장의 업종, 인원, 주요 공정을 알려줄테니 기본적으로 지켜야 할 안전보건 의무를 정리해줘.',
    '지게차·크레인 작업에 대해 법령 기준 필수 안전수칙과 보호구 착용 기준을 알려줘.',
    '화학물질을 취급하는 공정에서 필요한 교육, 문서, 보호구 의무사항을 법령 기준으로 정리해줘.',
    '도급/하도급 공사에서 원청과 하청이 각각 부담하는 안전보건 책임과 의무를 정리해줘.',
    '야간작업이나 교대근무가 많은 사업장에서 근로시간·휴게시간 관련 법적 준수사항을 알려줘.',
    '산업안전보건법상 안전보건관리책임자와 관리감독자의 역할과 필수 업무를 정리해줘.',
    '최근 개정된 중대재해처벌법이 우리 업종에 어떤 의무를 추가로 요구하는지 알려줘.',
    '밀폐공간 작업 시 적용되는 법령과 반드시 갖춰야 할 절차·서류를 정리해줘.',
    '신규 설비를 도입할 때 안전인증이나 자율안전확인 대상 여부를 판단하는 기준을 설명해줘.',
    '산업재해가 발생했을 때 신고, 조사, 재발방지 대책 수립까지 법에서 요구하는 절차를 정리해줘.',
  ];

  // 실무지침 해석용 힌트 10개
  const GUIDELINE_HINTS: string[] = [
    '우리 사업장의 작업 공정별로 기본 안전보건 실무지침(작업 전·중·후 점검 사항)을 만들어줘.',
    '지게차·크레인 장비 점검 및 작업 전 TBM에서 안내할 체크리스트를 실무지침 형식으로 정리해줘.',
    '신규 입사자 안전보건 오리엔테이션 때 사용하기 좋은 교육 진행 순서와 실무지침을 만들어줘.',
    '위험성평가 결과에 따라 현장에서 바로 쓸 수 있는 개선조치·관리대책 실무지침을 정리해줘.',
    '화학물질 취급 작업자의 보호구 지급, 착용, 보관에 대한 구체적인 실무지침을 작성해줘.',
    '도급·하도급 공사에서 작업 시작 전 협의체 운영 및 합동점검 실무지침을 만들어줘.',
    '밀폐공간 작업 전 사전점검, 출입통제, 감시인 배치에 대한 구체적인 실무지침을 작성해줘.',
    '야간작업 시 조도관리, 교대제 운영, 피로도 관리 등을 포함한 실무지침을 정리해줘.',
    '작업중지권 보장과 재개 절차에 대해 현장 관리자용 실무지침을 만들어줘.',
    '산업재해 발생 시 응급조치, 보고, 재발방지 대책 수립까지 단계별 실무지침을 정리해줘.',
  ];

  // 힌트 랜덤 3개 뽑기
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

  const chooseType = (id: string) => {
    Cookies.set('selectedJobType', id, { expires: 7 });
    setSelectedJobType(id);
    setShowTypeModal(false);
  };

  const cur = TYPE_META[selectedJobType ?? ''] ?? { label: '분야 선택', emoji: '💼' };
  
  const currentTaskMeta = selectedTask ? TASK_META[selectedTask] : null;

  // HTML -> 텍스트 (백업용)
  const htmlToText = (html: string) => {
    try {
      const clean = html.replace(/<br\s*\/?>/gi, '\n');
      const doc = new DOMParser().parseFromString(clean, 'text/html');
      return (doc.body.textContent || '').replace(/\u00A0/g, ' ').trim();
    } catch {
      return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+>/g, '').trim();
    }
  };

  // 클립보드 복사 (navigator + textarea fallback)
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

  // 복사: ref 우선, 실패 시 htmlToText 백업
  const handleCopy = async (idx: number, fallbackHtml: string) => {
    const el = contentRefs.current[idx];
    const text = el?.innerText?.trim() || htmlToText(fallbackHtml);
    if (text) await copyToClipboard(text);
  };

  // 다시 생성: 해당 assistant 카드 제거 후, 위쪽의 최근 user 질문으로 재요청
  const handleRegenerate = (idx: number) => {
    const upperUser = [...messages].slice(0, idx).reverse().find((m) => m.role === 'user');
    const fallbackUser = [...messages].reverse().find((m) => m.role === 'user');
    const q = htmlToText(upperUser?.content || fallbackUser?.content || '');
    if (!q) return;
    setMessages(messages.filter((_, i) => i !== idx));
    regenerate(q);
  };

  // "2) 근거" 이전까지만 보여주기 (2), 2. , ② 모두 허용)
  const cutHtmlBeforeEvidence = (html: string) => {
    if (!html) return html;
    const working = html.replace(/<(br|BR)\s*\/?>/g, '\n');
    const headerRe = /^\s*(?:2\)|2\.|②)\s*근거\s*$/m;
    const m = working.match(headerRe);
    let cutIdx = m?.index ?? -1;
    if (cutIdx < 0) {
      const altIconIdx = working.indexOf('🔗');
      if (altIconIdx >= 0) cutIdx = altIconIdx;
    }
    if (cutIdx <= 0) return html;
    const before = working.slice(0, cutIdx);
    return before.replace(/\n/g, '<br />');
  };

  const handleSend = () => {
    // 수동 전송 시 힌트는 감추기
    setActiveHintTask(null);
    setActiveHints([]);
  
    sendMessage({
      taskType: selectedTask || undefined,
      files: attachments,
    });
  
    setShowLanding(false);
    setSelectedTask(null);
    setAttachments([]);
  };

  // NEW: 드래그&드롭
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer?.files?.length) return;
    const files = Array.from(e.dataTransfer.files);
    setAttachments((prev) => [...prev, ...files]);
  };

  // NEW: 파일 input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const handleQuickActionClick = (action: QuickAction) => {
    // 작업 타입 미리 선택
    if (action.taskType) {
      setSelectedTask(action.taskType);
    }

    // 🔵 AI 법령 해석 / 실무지침 해석은 인트로 + 힌트 모드
    if (action.id === 'law_interpret' || action.id === 'guideline_interpret') {
      const isLaw = action.id === 'law_interpret';
      const hintTask: HintTask = isLaw ? 'law_interpret' : 'guideline_interpret';

      const intro: ChatMessage = {
        role: 'assistant',
        content: isLaw ? LAW_INTRO_TEXT : GUIDELINE_INTRO_TEXT,
      };

      if (messages.length === 0) {
        setMessages([intro]);
      } else {
        setMessages([...messages, intro]);
      }

      // 힌트 3개 랜덤 선택
      const pool = isLaw ? LAW_INTERPRET_HINTS : GUIDELINE_HINTS;
      setActiveHints(pickRandomHints(pool, 3));
      setActiveHintTask(hintTask);

      // 인풋은 비우고 포커스만
      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();

      return; // 다른 기본 동작은 수행하지 않고 종료
    }

    // 🔵 그 외 버튼은 placeholder 프리필 + 힌트 숨기기
    setActiveHintTask(null);
    setActiveHints([]);

    setInput(action.placeholder);
    const el = document.querySelector<HTMLInputElement>('.chat-input');
    if (el) el.focus();
  };

  const handleHintClick = (hint: string, task: HintTask) => {
    // 태그 강제 세팅
    setSelectedTask(task);

    // 바로 서버로 전송
    sendMessage({
      taskType: task,
      overrideMessage: hint,
    });

    // 한 번 클릭하면 힌트는 숨기기
    setActiveHintTask(null);
    setActiveHints([]);
  };

  // 쿠키 → 스토어 하이드레이션 & 미선택 시 팝업
  useEffect(() => {
    const saved = Cookies.get('selectedJobType') as string | undefined;
    if (saved) {
      setSelectedJobType(saved);
      setShowTypeModal(false);
    } else {
      setShowTypeModal(true);
    }
  }, [setSelectedJobType]);

  // 공유 링크(id|job_id)로 들어온 경우, FastAPI /public/answer 직접 호출 → 로컬 채팅 주입
  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR/빌드 단계 보호
    if (bootOnce.current) return;

    const sp = new URLSearchParams(window.location.search);
    const sharedId = sp.get('id') || sp.get('job_id');
    if (!sharedId) return;

    bootOnce.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/public-answer?id=${encodeURIComponent(sharedId)}`, { cache: 'no-store' });

        if (!res.ok) {
          setMessages([
            { role: 'assistant', content: '공유된 답변을 불러오지 못했습니다. 링크가 만료되었거나 잘못된 ID일 수 있어요.' }
          ]);
          return;
        }

        const data = await res.json() as {
          job_id: string;
          category?: 'environment' | 'infosec' | string;
          question?: string;
          answer_html?: string;
          created_at?: string;
        };

        const question = (data.question || '').trim();
        const answerHtml = (data.answer_html || '').trim();

        // 카테고리 동기화
        if (data.category && (data.category === 'environment' || data.category === 'infosec')) {
          Cookies.set('selectedJobType', data.category, { expires: 7 });
          setSelectedJobType(data.category);
        }

        const initialMsgs: { role: 'user' | 'assistant'; content: string }[] = [];
        if (question) initialMsgs.push({ role: 'user', content: question });
        else initialMsgs.push({ role: 'user', content: '(공유 링크로 불러온 질문)' });

        if (answerHtml) initialMsgs.push({ role: 'assistant', content: answerHtml });
        else initialMsgs.push({ role: 'assistant', content: '답변 본문이 비어 있습니다.' });

        setMessages(initialMsgs);
      } catch (e) {
        console.error('[ChatArea] public/answer fetch error:', e);
        setMessages([
          { role: 'assistant', content: '공유된 답변을 불러오는 중 오류가 발생했습니다.' }
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

  return (
    <>
      <section className={s.wrap}>
        {/* Header */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <div className={s.productName}>REG AI</div>
            <div className={s.chatTitle}>
              {messages.length > 0 && messages[0].role === 'user'
                ? htmlToText(messages[0].content).slice(0, 24) || '새 대화'
                : '새 대화'}
            </div>
          </div>
          <div className={s.headerRight}>
            <Button variant="outline" size="sm" className={s.settingsBtn}>
              <Settings className={s.iconXs} />
              계정
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className={s.body}>
          <div className={s.stream}>
            <div className={s.streamInner}>
            {messages.length === 0 && (
              <div className={s.quickWrap}>
                <div className={s.quickTitle}>무엇을 도와드릴까요?</div>
                <div className={s.quickGrid}>
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        className={s.quickBtn}
                        onClick={() => handleQuickActionClick(action)}
                      >
                        <span className={s.quickIconWrap}>
                          <Icon className={s.quickIcon} />
                        </span>
                        <span className={s.quickLabel}>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
              {messages.map((m, i) => {
                const isUser = m.role === 'user';
                const isIntro =
                  m.role === 'assistant' &&
                  (m.content === LAW_INTRO_TEXT ||
                    m.content === GUIDELINE_INTRO_TEXT);

                const safeHtml =
                  m.role === 'assistant'
                    ? cutHtmlBeforeEvidence(m.content)
                    : m.content;

                if (isUser) {
                  return (
                    <div key={i} className={s.userRow}>
                      <div className={s.userBubble}>
                        <div
                          className={s.userContent}
                          dangerouslySetInnerHTML={{ __html: m.content }}
                        />
                      </div>
                    </div>
                  );
                }

                // assistant
                return (
                  <div key={i} className={s.aiRow}>
                    <div
                      ref={(el) => {
                        contentRefs.current[i] = el;
                      }}
                      className={s.aiBubble}
                      dangerouslySetInnerHTML={{ __html: safeHtml }}
                    />

                    {/* ✅ AI 법령 해석 인트로일 때는 액션 버튼 숨김 */}
                    {!isIntro && (
                      <div className={s.actionRow}>
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
                        <button
                          className={s.evidenceBtn}
                          onClick={() => openRightFromHtml(m.content)}
                        >
                          근거 및 서식 확인하기
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ✅ AI 법령 해석용 힌트 칩 */}
              {activeHintTask && activeHints.length > 0 && (
                <div className={s.hintWrap}>
                  {activeHints.map((hint, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={s.hintChip}
                      onClick={() => handleHintClick(hint, activeHintTask)}
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              )}

              {loading && (
                <div className={s.loadingCard}>
                  <span>
                    {statusMessage ||
                      LOADING_MESSAGES[loadingMessageIndex]}
                  </span>
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

          {/* 첨부 파일 리스트 */}
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
                      setAttachments((prev) =>
                        prev.filter((_, i) => i !== idx),
                      )
                    }
                    aria-label="첨부 삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            className={s.inputRow}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className={s.inputWrap}>
              <div className={s.inputShell}>
                <button
                  type="button"
                  className={s.plusBtn}
                  onClick={() => setShowTaskModal(true)}
                  aria-label="작업 선택"
                  title="작업 선택"
                >
                  <Plus className={s.plusIcon} />
                </button>

                {currentTaskMeta && (
                  <div className={s.taskChip}>
                    <Search className={s.taskChipIcon} />
                    <span className={s.taskChipLabel}>
                      {currentTaskMeta.label}
                    </span>
                    <button
                      type="button"
                      className={s.taskChipClose}
                      onClick={() => setSelectedTask(null)}
                      aria-label="작업 태그 제거"
                    >
                      ×
                    </button>
                  </div>
                )}

                <input
                  className={`${s.input} ${
                    currentTaskMeta ? s.inputHasChip : ''
                  } chat-input`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="질문을 입력하거나 파일을 끌어다 놓으세요"
                />
              </div>
            </div>

            {/* 파일 첨부 버튼 */}
            <button
              type="button"
              className={s.attachBtn}
              onClick={() => fileInputRef.current?.click()}
              aria-label="파일 첨부"
            >
              <Paperclip className={s.iconMd} />
            </button>

            <button
              onClick={handleSend}
              className={s.sendBtn}
              aria-label="전송"
            >
              <ArrowUp className={s.iconMdAccent} />
            </button>

            {/* 숨겨진 파일 input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {/* 복사 토스트 */}
          {copied && (
            <div className={s.toast}>
              복사되었습니다
            </div>
          )}
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
          <div
            className={s.taskModal}
            onClick={(e) => e.stopPropagation()}
          >
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

            {/* ✅ 여기서부터 QUICK_ACTIONS 8개 사용 */}
            <div className={s.taskGrid}>
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={s.taskCard}
                    onClick={() => {
                      handleQuickActionClick(action); // 타입 + 프롬프트 세팅
                      setShowTaskModal(false);        // 모달 닫기
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
    </>
  );
}

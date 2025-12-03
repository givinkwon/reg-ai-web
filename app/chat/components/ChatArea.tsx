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
  X,
  Folder,
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

type SafetyNewsResponse = {
  id: string;
  category?: string;
  period?: string | null;
  batch_date?: string;
  digest: string;
  source_count?: number | null;
};

type QuickActionGroup = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: QuickAction['id'][];
};

// id 는 QUICK_ACTIONS 의 id 를 써야 함
const QUICK_ACTION_GROUPS: QuickActionGroup[] = [
  {
    id: 'practice',
    title: '실무 해석',
    icon: FileText,
    items: ['guideline_interpret', 'law_interpret'],
  },
  {
    id: 'accident_news',
    title: '사고 · 뉴스',
    icon: AlertTriangle,
    items: ['accident_search', 'today_accident', 'notice_summary'],
  },
  {
    id: 'docs_materials',
    title: '문서 · 자료',
    icon: Folder,
    items: ['doc_create', 'doc_review', 'edu_material', 'risk_assess'],
  },
];

// id -> QuickAction 빠르게 찾기용 맵
const QUICK_ACTIONS_MAP: Record<string, QuickAction> = QUICK_ACTIONS.reduce(
  (acc, cur) => {
    acc[cur.id] = cur;
    return acc;
  },
  {} as Record<string, QuickAction>,
);

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

  type HintTask =
    | 'law_interpret'
    | 'guideline_interpret'
    | 'doc_create'
    | 'edu_material';

  const [activeHintTask, setActiveHintTask] = useState<HintTask | null>(null);
  const [activeHints, setActiveHints] = useState<string[]>([]);

  const DOC_REVIEW_INTRO_TEXT =
  '법령 근거를 검토하여 보완사항을 확인할 안전문서를 업로드해주세요.';
  
  const LAW_INTRO_TEXT =
    '법령과 규제사항을 학습한 REA AI가 내 사업장에 딱 맞는 실무지침을 안내해드려요! 무엇을 도와드릴까요?';

  const GUIDELINE_INTRO_TEXT =
    '현장의 작업절차, 점검표, 교육·훈련 등 실무지침을 REA AI가 법령에 맞게 정리해드려요! 무엇을 도와드릴까요?';

  // ✅ 안전 문서 생성 인트로
  const DOC_CREATE_INTRO_TEXT =
    '법정 서식과 KOSHA 가이드를 참고해서 필요한 안전 문서를 템플릿으로 만들어드릴게요. 어떤 문서를 생성할까요?';

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

  // ✅ 안전 문서 생성용 힌트 10개 (칩에는 문서명만 노출 / 백엔드에서 분기)
  const DOC_CREATE_HINTS: string[] = [
    '위험성평가서',
    '작업허가서(밀폐공간 작업)',
    '지게차 작업 안전점검표',
    '정기 안전보건교육 일지',
    'TBM(작업 전 안전회의) 회의록',
    '산업재해 발생 보고서',
    '보호구 지급·관리대장',
    '도급·하도급 안전보건협의체 회의록',
    '위험성평가 결과 개선조치 관리대장',
    '화학물질 취급 작업 표준작업지침서(SOP)',
  ];

  const EDU_INTRO_TEXT =
  '신입·정기 교육에 쓸 수 있는 산업안전/보건 교육자료 개요를 REA AI가 만들어드려요. 어떤 교육이 필요하신가요?';

  const EDU_MATERIAL_HINTS: string[] = [
    '신입 직원 대상 기본 산업안전/보건 교육자료',
    '위험성평가 방법과 절차를 설명하는 교육자료',
    '지게차·크레인 작업자 안전수칙 교육자료',
    '화학물질 취급 작업자를 위한 유해위험·보호구 교육자료',
    '중대재해처벌법의 주요 내용과 경영책임자 의무를 설명하는 교육자료',
    '도급·하도급 현장의 안전보건 책임과 의무를 설명하는 교육자료',
    '밀폐공간 작업 안전수칙과 사고사례를 포함한 교육자료',
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

  // 🔹 digest 문자열에서 "참고 기사 목록" 기준으로 요약/기사 분리
  const splitDigestForArticles = (digest: string) => {
    if (!digest) return { summaryText: '', articlesText: '' };

    // ✅ 실제 텍스트 기준으로 수정: '## ' 빼고 그냥 찾기
    const marker = '참고 기사 목록';
    const idx = digest.indexOf(marker);

    // 참고 기사 구분선이 없으면 전체를 요약으로 사용
    if (idx === -1) {
      return {
        summaryText: digest.trim(),
        articlesText: '',
      };
    }

    const summaryPart = digest.slice(0, idx);   // "최근 동향 요약 + 1~9번" 부분
    const articlesPart = digest.slice(idx);     // "참고 기사 목록 + 1~50번" 부분

    return {
      summaryText: summaryPart.trim(),
      articlesText: articlesPart.trim(),
    };
  };



  // 🔹 이 메시지가 안전 뉴스인지 판별 (fetch 쪽에서 data-msg-type 달아줌)
  const isSafetyNewsHtml = (html: string) => {
    return html.includes('data-msg-type="safety-news"');
  };

  // 🔹 안전 뉴스 HTML에서 summary 섹션만 추출
  const extractSafetySummaryHtml = (html: string) => {
    const match = html.match(
      /<div[^>]+data-section="summary"[^>]*>([\s\S]*?)<\/div>/,
    );
    if (!match) {
      // 혹시 못 찾으면 기존 로직으로
      return cutHtmlBeforeEvidence(html);
    }
    return match[0];
  };

  // 🔹 안전 뉴스 HTML에서 기사 목록 섹션만 추출 (display:none 제거)
  const extractSafetyArticlesHtml = (html: string) => {
    const match = html.match(
      /<div[^>]+data-section="articles"[^>]*>([\s\S]*?)<\/div>/,
    );
    if (!match) return '';
    const cleaned = match[0].replace(/display\s*:\s*none\s*;?/i, '');
    return `<div><h3>참고 기사 목록</h3>${cleaned}</div>`;
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

   // 🔸 금주의 안전 뉴스 호출 → assistant 메시지로 추가
  const fetchWeeklySafetyNews = async () => {
    try {
      const params = new URLSearchParams();

      // 선택된 분야가 environment/infosec이면 category로 전달
      if (
        selectedJobType === 'environment' ||
        selectedJobType === 'infosec'
      ) {
        params.set('category', selectedJobType);
      }

      const qs = params.toString();
      const url = `/api/safety-news/latest${qs ? `?${qs}` : ''}`;

      const res = await fetch(url, { method: 'GET', cache: 'no-store' });

      if (!res.ok) {
        console.error('[ChatArea] safety-news error status:', res.status);
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content:
            '금주의 안전 뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        };
        setMessages([...messages, errorMsg]);
        setShowLanding(false);
        return;
      }

      const data = (await res.json()) as SafetyNewsResponse;

      // 제목/메타 구성
      const periodText =
        (data.period && data.period.trim()) ||
        (data.batch_date && data.batch_date.slice(0, 10)) ||
        '';

      const titleHtml = periodText
        ? `🔔 <strong>${periodText} 금주의 안전 뉴스</strong>`
        : '🔔 <strong>금주의 안전 뉴스</strong>';

      // 카테고리 / 기사 수 표시
      const metaParts: string[] = [];

      if (data.category && TYPE_META[data.category]) {
        const meta = TYPE_META[data.category];
        metaParts.push(`${meta.emoji} ${meta.label}`);
      }

      if (typeof data.source_count === 'number') {
        metaParts.push(`기사 ${data.source_count}건 기준`);
      }

      const metaHtml = metaParts.length
        ? `<div style="margin-top:4px; font-size:12px; opacity:0.8;">
             ${metaParts.join(' · ')}
           </div>`
        : '';

      // 🔸 digest 를 "요약" / "참고 기사 목록" 으로 분리
      const digestText = data.digest || '';
      const { summaryText, articlesText } = splitDigestForArticles(digestText);

      // 줄바꿈 → <br> 로 변환
      const summaryHtml = summaryText
        ? summaryText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .join('<br />')
        : '';

      const articlesHtml = articlesText
        ? articlesText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .join('<br />')
        : '';

      // 수정 버전 (여기만 바꾸면 됨)
      const html = `
        <div data-msg-type="safety-news">
          <p>${titleHtml}</p>
          ${metaHtml}
          ${
            summaryHtml
              ? `<div style="margin-top:8px;" data-section="summary">${summaryHtml}</div>`
              : ''
          }
          ${
            articlesHtml
              ? `<div style="margin-top:12px; display:none;" data-section="articles">${articlesHtml}</div>`
              : ''
          }
        </div>
      `;

      const newsMsg: ChatMessage = {
        role: 'assistant',
        content: html,
      };

      setMessages([...messages, newsMsg]);
      setShowLanding(false);
    } catch (e) {
      console.error('[ChatArea] safety-news fetch error:', e);
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content:
          '금주의 안전 뉴스를 불러오는 중 오류가 발생했습니다.',
      };
      setMessages([...messages, errorMsg]);
      setShowLanding(false);
    }
  };


  const handleQuickActionClick = (action: QuickAction) => {
    // 작업 타입 미리 선택
    if (action.taskType) {
      setSelectedTask(action.taskType);
    }

    // 🔸 금주의 안전 뉴스: LLM 안 쓰고 API 호출해서 바로 출력
    if (action.id === 'today_accident') {
      setActiveHintTask(null);
      setActiveHints([]);
      fetchWeeklySafetyNews();
      return;
    }

    // 🟦 1) 안전 문서 검토: 인트로 메시지만, 힌트 없음
    if (action.id === 'doc_review') {
      const intro: ChatMessage = {
        role: 'assistant',
        content: DOC_REVIEW_INTRO_TEXT,
      };

      if (messages.length === 0) {
        setMessages([intro]);
      } else {
        setMessages([...messages, intro]);
      }

      // 힌트 섹션 비우기 (아래 렌더링에서 아무것도 안 나오게)
      setActiveHintTask(null);
      setActiveHints([]);

      // 인풋 비우고 포커스
      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();

      return; // 여기서 함수 종료 → 아래 힌트 로직 안 타게
    }

    // 🟦 2) 법령/실무지침/문서 생성/교육자료 생성은 기존 "인트로 + 힌트" 로직
    if (
      action.id === 'law_interpret' ||
      action.id === 'guideline_interpret' ||
      action.id === 'doc_create' ||
      action.id === 'edu_material'
    ) {
      let hintTask: HintTask;
      let introText: string;
      let pool: string[];

      if (action.id === 'law_interpret') {
        hintTask = 'law_interpret';
        introText = LAW_INTRO_TEXT;
        pool = LAW_INTERPRET_HINTS;
      } else if (action.id === 'guideline_interpret') {
        hintTask = 'guideline_interpret';
        introText = GUIDELINE_INTRO_TEXT;
        pool = GUIDELINE_HINTS;
      } else if (action.id === 'doc_create') {
        hintTask = 'doc_create';
        introText = DOC_CREATE_INTRO_TEXT;
        pool = DOC_CREATE_HINTS;
      } else {
        // edu_material
        hintTask = 'edu_material';
        introText = EDU_INTRO_TEXT;
        pool = EDU_MATERIAL_HINTS;
      }

      const intro: ChatMessage = {
        role: 'assistant',
        content: introText,
      };

      if (messages.length === 0) {
        setMessages([intro]);
      } else {
        setMessages([...messages, intro]);
      }

      // 문서/교육은 전체, 법령/실무지침은 랜덤 3개
      if (action.id === 'doc_create' || action.id === 'edu_material') {
        setActiveHints(pool);
      } else {
        setActiveHints(pickRandomHints(pool, 3));
      }

      setActiveHintTask(hintTask);

      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();

      return;
    }

    // 🟦 3) 그 외 퀵액션은 기존처럼 placeholder만 프리필
    setActiveHintTask(null);
    setActiveHints([]);

    setInput(action.placeholder);
    const el = document.querySelector<HTMLInputElement>('.chat-input');
    if (el) el.focus();
  };


  const handleHintClick = (task: HintTask, hint: string) => {
    // taskType 매핑: 문서 생성은 doc_review로 보내고, 나머지는 그대로
    let mappedTaskType: TaskType;
    if (task === 'doc_create') {
      mappedTaskType = 'doc_review';
    } else if (task === 'edu_material') {
      mappedTaskType = 'edu_material';
    } else if (task === 'guideline_interpret') {
      mappedTaskType = 'guideline_interpret';
    } else {
      mappedTaskType = 'law_interpret';
    }

    setSelectedTask(mappedTaskType);

    sendMessage({
      taskType: mappedTaskType,
      overrideMessage: hint,
    });

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

                  {QUICK_ACTION_GROUPS.map((group) => {
                    const GroupIcon = group.icon;
                    return (
                      <div key={group.id} className={s.quickSection}>
                        {/* 섹션 헤더 (아이콘 + 제목) */}
                        <div className={s.quickSectionHeader}>
                          <GroupIcon className={s.quickSectionIcon} />
                          <span className={s.quickSectionTitle}>{group.title}</span>
                        </div>

                        {/* 섹션 안 버튼들 */}
                        <div className={s.quickGrid}>
                          {group.items.map((id) => {
                            const action = QUICK_ACTIONS_MAP[id];
                            if (!action) return null;
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
                    );
                  })}
                </div>
              )}

                {messages.map((m, i) => {
                const isUser = m.role === 'user';

                // 🔹 안전 뉴스 여부 및 요약/기사 분리
                let isSafetyNews = false;
                let safetyArticlesHtml: string | null = null;
                let safeHtml: string;

                if (m.role === 'assistant') {
                  if (isSafetyNewsHtml(m.content)) {
                    isSafetyNews = true;
                    safeHtml = extractSafetySummaryHtml(m.content); // 말풍선에는 요약만
                    safetyArticlesHtml = extractSafetyArticlesHtml(m.content); // 버튼용
                  } else {
                    safeHtml = cutHtmlBeforeEvidence(m.content);
                  }
                } else {
                  safeHtml = m.content;
                }

                const isIntro =
                  m.role === 'assistant' &&
                  (m.content === LAW_INTRO_TEXT ||
                    m.content === GUIDELINE_INTRO_TEXT ||
                    m.content === DOC_CREATE_INTRO_TEXT ||
                    m.content === EDU_INTRO_TEXT ||
                    m.content === DOC_REVIEW_INTRO_TEXT
                  );

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
                          {/* ✅ 뉴스 메시지일 때는 다시 생성/복사 버튼 숨김 */}
                          {!isSafetyNews && (
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
                              if (isSafetyNews) {
                                const htmlForRight =
                                  (safetyArticlesHtml && safetyArticlesHtml.trim().length > 0)
                                    ? safetyArticlesHtml
                                    : extractSafetyArticlesHtml(m.content) || m.content;

                                // 🔹 뉴스 모드로 호출
                                openRightFromHtml(htmlForRight, { mode: 'news' });
                              } else {
                                // 🔹 명시하지 않으면 'evidence'지만, 타입 맞추기 위해 같이 넘겨줘도 됨
                                openRightFromHtml(m.content, { mode: 'evidence' });
                              }
                            }}
                          >
                            {isSafetyNews
                              ? '참고 기사 목록 확인하기'
                              : '근거 및 서식 확인하기'}
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
                      onClick={() => handleHintClick(activeHintTask, hint)}
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

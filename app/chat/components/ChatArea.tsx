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
  User2,
  LogOut,
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
  | 'guideline_interpret'
  | 'accident_search';

const TASK_META: Record<TaskType, { label: string }> = {
  law_research: { label: '법령 조사' },
  doc_review: { label: '안전 문서 생성/검토' },
  risk_assessment: { label: '위험성 평가' },
  law_interpret: { label: 'AI 법령 해석' },
  edu_material: { label: '교육자료 생성' },
  guideline_interpret: { label: '실무지침 해석' },
  accident_search: { label: '사고사례 검색' },
};

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
    taskType: 'accident_search',  
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
type LawNoticeSummaryResponse = {
  id?: string | null;
  run_date?: string | null;
  cutoff_date?: string | null;
  months_back?: number | null;
  item_count?: number | null;

  // 예전 safety-news 스타일
  digest?: string | null;

  // 혹시 백엔드가 평탄화해서 줄 수도 있음
  summary_kor?: string | null;

  // 지금 실제로 오는 구조(text.summary_kor)
  text?: {
    summary_kor?: string;
    [key: string]: any;
  } | null;
};

type QuickActionGroup = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: QuickAction['id'][];
};

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

const QUICK_ACTIONS_MAP: Record<string, QuickAction> = QUICK_ACTIONS.reduce(
  (acc, cur) => {
    acc[cur.id] = cur;
    return acc;
  },
  {} as Record<string, QuickAction>,
);

// 🔹 추가: 게스트 제한 상수 + 쿠키 키
const GUEST_LIMIT = 3;
const GUEST_LIMIT_COOKIE_KEY = 'regai_guest_msg_count';

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

  type HintTask =
  | 'law_interpret'
  | 'guideline_interpret'
  | 'doc_create'
  | 'edu_material'
  | 'accident_search';

  const [activeHintTask, setActiveHintTask] = useState<HintTask | null>(null);
  const [activeHints, setActiveHints] = useState<string[]>([]);

  const DOC_REVIEW_INTRO_TEXT =
    '법령 근거를 검토하여 보완사항을 확인할 안전문서를 업로드해주세요.';

  const LAW_INTRO_TEXT =
    '법령과 규제사항을 학습한 REA AI가 내 사업장에 딱 맞는 실무지침을 안내해드려요! 무엇을 도와드릴까요?';

  const GUIDELINE_INTRO_TEXT =
    '현장의 작업절차, 점검표, 교육·훈련 등 실무지침을 REA AI가 법령에 맞게 정리해드려요! 무엇을 도와드릴까요?';

  const DOC_CREATE_INTRO_TEXT =
    '법정 서식과 KOSHA 가이드를 참고해서 필요한 안전 문서를 템플릿으로 만들어드릴게요. 어떤 문서를 생성할까요?';

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

  const ACCIDENT_INTRO_TEXT =
  'KOSHA 사고사례 DB에서 원하는 설비·공정과 관련된 사고사례를 찾아 개요와 재발방지대책까지 정리해드려요. 어떤 사고사례를 찾고 싶으신가요?';

  const ACCIDENT_HINTS: string[] = [
    '지게차 작업 중 전도·끼임 사고사례를 찾아주고 사고개요와 재발방지대책을 정리해줘.',
    '타워크레인 설치·해체 작업에서 발생한 사고사례를 찾아주고 주요 원인과 예방대책을 정리해줘.',
    '밀폐공간(맨홀, 탱크 내부 등) 질식 사고사례를 찾아주고 작업 전·중·후 안전대책을 정리해줘.',
    '컨베이어 라인 협착 사고사례를 찾아주고 설비개선 및 작업절차 개선방안을 제안해줘.',
    '고소작업대 사용 중 추락 사고사례를 찾아주고 보호구·작업발판·안전대 관련 예방대책을 정리해줘.',
    '비계(동바리 포함) 붕괴·추락 사고사례를 찾아주고 구조적 결함, 작업발판 설치 불량 등 주요 원인과 관리대책을 정리해줘.',
    '전기판넬·분전반 작업 중 감전 사고사례를 찾아주고 잠금·표시(LOTO), 절연보호구, 점검절차 중심으로 예방대책을 정리해줘.',
    '도장·세척 작업장에서의 화재·폭발 사고사례를 찾아주고 인화성 물질 관리, 통풍·환기, 점화원 관리 대책을 정리해줘.',
    '프레스·전단기 등 기계에 의한 절단·끼임 사고사례를 찾아주고 방호장치, 양수조작, 작업표준서 개선방안을 정리해줘.',
    '천장크레인·호이스트 사용 중 충돌·낙하 사고사례를 찾아주고 와이어로프 점검, 정격하중 준수, 신호수 배치 등 예방대책을 정리해줘.',
    '이동식 사다리 사용 중 추락 사고사례를 찾아주고 설치 각도, 미끄럼 방지, 상부 지지 방법 등 안전수칙 중심으로 예방대책을 정리해줘.',
    '굴착(흙막이·트렌치) 작업 중 토사 붕괴 사고사례를 찾아주고 흙막이 구조, 붕괴 징후 관리, 출입통제 대책을 정리해줘.',
    '휴대용 절단기·그라인더 사용 중 비산·베임 사고사례를 찾아주고 연마석 파손, 보호구 착용, 작업자세 개선대책을 정리해줘.',
    '용접·용단 작업 중 화재·폭발 사고사례를 찾아주고 가연물 관리, 불티비산 방지, 가스누출 점검 절차 등을 정리해줘.',
    '산·알칼리 등 화학물질 누출·피부·눈 화상 사고사례를 찾아주고 보관·이송·주입 작업 단계별 예방대책과 비상조치 방안을 정리해줘.',
    '산업용 로봇·자동화설비 주변에서 발생한 협착·충돌 사고사례를 찾아주고 안전펜스, 인터록, 안전센서 적용방안을 정리해줘.',
    '하역작업(상·하차, 팔레트 이동 등) 중 끼임·추락 사고사례를 찾아주고 작업동선 정리, 하역장 구조개선, 신호·유도체계 대책을 정리해줘.',
    '이동식 크레인(카고크레인 포함) 전도·접촉 사고사례를 찾아주고 지반침하, 아웃트리거 설치, 전선 접촉 위험 중심으로 예방대책을 정리해줘.',
    '집수정·폐수처리장 등에서 황화수소·유해가스에 의한 질식 사고사례를 찾아주고 가스농도 측정, 환기, 감시인 배치 대책을 정리해줘.',
    '겨울철 결빙된 작업장 바닥에서 미끄러짐·넘어짐 사고사례를 찾아주고 제설·제빙, 배수 개선, 미끄럼 방지구 설치 등 예방대책을 정리해줘.',
  ];
  

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

  const cur =
    TYPE_META[selectedJobType ?? ''] ?? { label: '분야 선택', emoji: '💼' };

  const currentTaskMeta = selectedTask ? TASK_META[selectedTask] : null;

  // HTML -> 텍스트 (백업용)
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

  const cutHtmlBeforeEvidence = (html: string) => {
    if (!html) return html;

    // <br> → 줄바꿈으로 바꿔서 줄 단위로 헤더를 찾기 쉽게
    const working = html.replace(/<(br|BR)\s*\/?>/g, '\n');

    // 1) "2) 근거" 위치
    const evidenceRe = /^\s*(?:2\)|2\.|②)\s*근거\s*$/m;
    const evidenceMatch = working.match(evidenceRe);

    // 2) "5) 참고 사고사례" 위치
    const accidentRe = /^\s*5\)\s*참고\s*사고사례\s*$/m;
    const accidentMatch = working.match(accidentRe);

    let cutIdx = -1;

    if (evidenceMatch?.index != null) {
      cutIdx = evidenceMatch.index;
    }
    if (accidentMatch?.index != null) {
      // 근거/사고사례 둘 다 있으면 더 앞에 나오는 쪽에서 자르기
      cutIdx =
        cutIdx === -1
          ? accidentMatch.index
          : Math.min(cutIdx, accidentMatch.index);
    }

    // 3) 혹시 정규식이 안 먹히는 경우를 대비한 fallback
    if (cutIdx < 0) {
      const accIdx = working.indexOf('5) 참고 사고사례');
      if (accIdx >= 0) cutIdx = accIdx;
    }

    // 4) 예전처럼 🔗 아이콘 기준 fallback 유지
    if (cutIdx < 0) {
      const altIconIdx = working.indexOf('🔗');
      if (altIconIdx >= 0) cutIdx = altIconIdx;
    }

    // 자를 위치가 없으면 원본 그대로
    if (cutIdx <= 0) return html;

    const before = working.slice(0, cutIdx);
    return before.replace(/\n/g, '<br />');
  };

  const splitDigestForArticles = (digest: string, marker = '참고 기사 목록') => {
    if (!digest) return { summaryText: '', articlesText: '' };
  
    const idx = digest.indexOf(marker);
  
    if (idx === -1) {
      return {
        summaryText: digest.trim(),
        articlesText: '',
      };
    }
  
    const summaryPart = digest.slice(0, idx);
    const articlesPart = digest.slice(idx);
  
    return {
      summaryText: summaryPart.trim(),
      articlesText: articlesPart.trim(),
    };
  };
  

  const isSafetyNewsHtml = (html: string) => {
    return html.includes('data-msg-type="safety-news"');
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

  const extractSafetySummaryHtml = (html: string) => {
    const match = html.match(
      /<div[^>]+data-section="summary"[^>]*>([\s\S]*?)<\/div>/,
    );
    if (!match) {
      return cutHtmlBeforeEvidence(html);
    }
    return match[0];
  };

  const extractSafetyArticlesHtml = (html: string) => {
    const match = html.match(
      /<div[^>]+data-section="articles"[^>]*>([\s\S]*?)<\/div>/,
    );
    if (!match) return '';
    const cleaned = match[0].replace(/display\s*:\s*none\s*;?/i, '');
    return `<div><h3>참고 기사 목록</h3>${cleaned}</div>`;
  };

  // 🔹 새로 추가: 입법예고 요약 메시지인지 판별
  const isNoticeSummaryHtml = (html: string) => {
    return html.includes('data-msg-type="notice-summary"');
  };

  // 🔹 새로 추가: 입법예고 메시지에서 "참고 입법예고 목록" 섹션만 제거한 본문
  const extractNoticeSummaryHtml = (html: string) => {
    // data-section="articles" 블록만 날리고 나머지는 그대로 유지
    return html.replace(
      /<div[^>]+data-section="articles"[^>]*>[\s\S]*?<\/div>/,
      '',
    );
  };

  // 🔹 새로 추가: "참고 입법예고 목록"을 제목 + URL 링크 리스트로 변환
  const extractNoticeArticlesHtml = (html: string) => {
    const match = html.match(
      /<div[^>]+data-section="articles"[^>]*>([\s\S]*?)<\/div>/,
    );
    if (!match) return '';

    // 안쪽 HTML -> 텍스트 라인
    const inner = match[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+>/g, '')
      .trim();

    if (!inner) return '';

    const lines = inner
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const items: { title: string; url: string }[] = [];

    for (const line of lines) {
      if (line.startsWith('참고 입법예고 목록')) continue;

      // 예:
      // 1. 제목 (입법예고기간: 2025-10-02~2025-11-11, URL: https://www.moleg....)
      const m = line.match(
        /^\d+\.\s*(.+?)\s*\((?:입법예고기간:[^,]*,)?\s*URL:\s*([^)]+)\)/,
      );
      if (m) {
        items.push({
          title: m[1].trim(),
          url: m[2].trim(),
        });
      }
    }

    // 파싱 실패하면 그냥 원문이라도 보여주기
    if (!items.length) {
      const fallback = lines.join('<br />');
      return `<div><h3>참고 입법예고 목록</h3><div>${fallback}</div></div>`;
    }

    const listHtml = items
      .map(
        (it) =>
          `<li><a href="${it.url}" target="_blank" rel="noopener noreferrer">${it.title}</a></li>`,
      )
      .join('');

    return `<div><h3>참고 입법예고 목록</h3><ul>${listHtml}</ul></div>`;
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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer?.files?.length) return;
    const files = Array.from(e.dataTransfer.files);
    setAttachments((prev) => [...prev, ...files]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const fetchWeeklySafetyNews = async () => {
    try {
      const params = new URLSearchParams();

      if (selectedJobType === 'environment' || selectedJobType === 'infosec') {
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

      const periodText =
        (data.period && data.period.trim()) ||
        (data.batch_date && data.batch_date.slice(0, 10)) ||
        '';

      const titleHtml = periodText
        ? `🔔 <strong>${periodText} 금주의 안전 뉴스</strong>`
        : '🔔 <strong>금주의 안전 뉴스</strong>';

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

      const digestText = data.digest || '';
      const { summaryText, articlesText } = splitDigestForArticles(digestText);

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
        content: '금주의 안전 뉴스를 불러오는 중 오류가 발생했습니다.',
      };
      setMessages([...messages, errorMsg]);
      setShowLanding(false);
    }
  };

  const fetchLawNoticeSummary = async () => {
    try {
      const res = await fetch('/api/expect-law/latest');
  
      if (!res.ok) {
        console.error('[ChatArea] law-notice-summary error status:', res.status);
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content:
            '입법 예고 요약을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        };
        setMessages([...messages, errorMsg]);
        setShowLanding(false);
        return;
      }
  
      const data = (await res.json()) as LawNoticeSummaryResponse;
      console.log('[ChatArea] expect-law data =', data);
  
      const cutoff = data.cutoff_date?.slice(0, 10);
      const run = data.run_date?.slice(0, 10);
  
      const periodText =
        cutoff && run ? `${cutoff} ~ ${run}` : run || cutoff || '';
  
      const titleHtml = periodText
        ? `📜 <strong>${periodText} 입법 예고 요약</strong>`
        : '📜 <strong>입법 예고 요약</strong>';
  
      const metaParts: string[] = [];
  
      if (typeof data.months_back === 'number') {
        metaParts.push(`최근 ${data.months_back}개월 기준`);
      }
  
      if (typeof data.item_count === 'number') {
        metaParts.push(`입법예고 ${data.item_count}건 기준`);
      }
  
      const metaHtml = metaParts.length
        ? `<div style="margin-top:4px; font-size:12px; opacity:0.8;">
             ${metaParts.join(' · ')}
           </div>`
        : '';
  
      const digestText =
        data.digest || data.summary_kor || data.text?.summary_kor || '';
  
      // ✅ 여기서 marker 를 '참고 입법예고 목록' 으로
      const { summaryText, articlesText } = splitDigestForArticles(
        digestText,
        '참고 입법예고 목록',
      );
  
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
  
      // 🔥 summary / articles 를 data-section 으로 나누고
      //    articles 는 display:none 으로 숨겨둔다 (우측 패널용)
      const html = `
        <div data-msg-type="notice-summary">
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
  
      const msg: ChatMessage = {
        role: 'assistant',
        content: html,
      };
  
      setMessages([...messages, msg]);
      setShowLanding(false);
    } catch (e) {
      console.error('[ChatArea] expect-law-summary fetch error:', e);
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: '입법 예고 요약을 불러오는 중 오류가 발생했습니다.',
      };
      setMessages([...messages, errorMsg]);
      setShowLanding(false);
    }
  };
  

  const handleQuickActionClick = (action: QuickAction) => {
    if (action.taskType) {
      setSelectedTask(action.taskType);
    }

    if (action.id === 'today_accident') {
      setActiveHintTask(null);
      setActiveHints([]);
      fetchWeeklySafetyNews();
      return;
    }

    // 🔹 추가: 입법 예고 요약
    if (action.id === 'notice_summary') {
      setActiveHintTask(null);
      setActiveHints([]);
      fetchLawNoticeSummary();
      return;
    }

    if (action.id === 'accident_search') {
      const intro: ChatMessage = {
        role: 'assistant',
        content: ACCIDENT_INTRO_TEXT,
      };
  
      if (messages.length === 0) {
        setMessages([intro]);
      } else {
        setMessages([...messages, intro]);
      }
  
      setActiveHintTask('accident_search');
      setActiveHints(pickRandomHints(ACCIDENT_HINTS, 3)); // 🔹 랜덤 3개
  
      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();
  
      return;
    }

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

      setActiveHintTask(null);
      setActiveHints([]);

      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();

      return;
    }

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
    if (task === 'doc_create') {
      mappedTaskType = 'doc_review';
    } else if (task === 'edu_material') {
      mappedTaskType = 'edu_material';
    } else if (task === 'guideline_interpret') {
      mappedTaskType = 'guideline_interpret';
    } else if (task === 'accident_search') {   
      mappedTaskType = 'accident_search';
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

  // ✅ 현재까지 user role 메시지 개수
  const getUserMessageCount = () =>
    messages.filter((m) => m.role === 'user').length;

  // ✅ 게스트 제한 체크 (3개 이상이면 true)
  const shouldBlockGuestByLimit = () => {
    // 로그인 했으면 제한 없음
    if (user) return false;
  
    const count = getGuestMsgCountFromCookie(); // 지금까지 쿠키에 저장된 횟수
    const nextCount = count + 1;               // 이번에 보내려는 것까지 포함
  
    console.log('[guest-limit]', { count, nextCount });
  
    // 3번까지 허용, 4번째부터 막기
    return nextCount > GUEST_LIMIT;
  };

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

        const initialMsgs: {
          role: 'user' | 'assistant';
          content: string;
        }[] = [];
        if (question)
          initialMsgs.push({ role: 'user', content: question });
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
                    <DropdownMenuItem disabled>
                      {user.email}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className={s.iconXs} />
                    <span>로그아웃</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
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
                                className={s.quickBtn}
                                onClick={() =>
                                  handleQuickActionClick(action)
                                }
                              >
                                <span className={s.quickIconWrap}>
                                  <Icon className={s.quickIcon} />
                                </span>
                                <span className={s.quickLabel}>
                                  {action.label}
                                </span>
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

                let isSafetyNews = false;
                let isNoticeSummary = false;
                let isAccidentCases = false;              // 🔹 추가
                let safetyArticlesHtml: string | null = null;
                let noticeArticlesHtml: string | null = null;
                let safeHtml: string;

                if (m.role === 'assistant') {
                  const rawHtml = m.content || '';

                  // 🔹 사고사례 섹션 있는지 먼저 체크
                  isAccidentCases = hasAccidentCasesInHtml(rawHtml);

                  if (isSafetyNewsHtml(rawHtml)) {
                    isSafetyNews = true;
                    safeHtml = extractSafetySummaryHtml(rawHtml);
                    safetyArticlesHtml = extractSafetyArticlesHtml(rawHtml);
                  } else if (isNoticeSummaryHtml(rawHtml)) {
                    // ✅ 입법예고 요약
                    isNoticeSummary = true;
                    safeHtml = extractNoticeSummaryHtml(rawHtml); // 본문(제목+요약)만
                    noticeArticlesHtml = extractNoticeArticlesHtml(rawHtml); // 우측 패널용
                  } else {
                    safeHtml = cutHtmlBeforeEvidence(rawHtml);
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
                    m.content === DOC_REVIEW_INTRO_TEXT ||
                    m.content === ACCIDENT_INTRO_TEXT);

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

                return (
                  <div key={i} className={s.aiRow}>
                    <div
                      ref={(el) => {
                        contentRefs.current[i] = el;
                      }}
                      className={s.aiBubble}
                      dangerouslySetInnerHTML={{ __html: safeHtml }}
                    />

                    {!isIntro && (
                      <div className={s.actionRow}>
                        <div className={s.miniActions}>
                          {(!isSafetyNews && !isNoticeSummary) && (
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
                                onClick={() =>
                                  handleCopy(i, m.content)
                                }
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
                                safetyArticlesHtml && safetyArticlesHtml.trim().length > 0
                                  ? safetyArticlesHtml
                                  : extractSafetyArticlesHtml(m.content) || m.content;

                              openRightFromHtml(htmlForRight, {
                                mode: 'news',
                              });
                            } else if (isNoticeSummary) {
                              // ✅ 입법예고용: 제목만 + 링크 리스트
                              const htmlForRight =
                                noticeArticlesHtml && noticeArticlesHtml.trim().length > 0
                                  ? noticeArticlesHtml
                                  : extractNoticeArticlesHtml(m.content) || m.content;

                              openRightFromHtml(htmlForRight, {
                                mode: 'lawNotice',
                              });
                            } else if (isAccidentCases) {
                              openRightFromHtml(m.content, {
                                mode: 'accident'
                              })
                            } else {
                              openRightFromHtml(m.content, {
                                mode: 'evidence',
                              });
                            }
                          }}
                        >
                          {isSafetyNews
                            ? '참고 기사 목록 확인하기'
                            : isNoticeSummary
                            ? '참고 입법예고 목록 확인하기'
                            : isAccidentCases                    // 🔹 여기 추가
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
                      onClick={() =>
                        handleHintClick(activeHintTask, hint)
                      }
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

            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
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
    </>
  );
}

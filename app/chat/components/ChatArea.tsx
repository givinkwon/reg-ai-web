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
import MakeSafetyDocs, {
  SafetyDoc,
  SafetyDocCategory,
} from './MakeSafetyDocs';
import DocReviewUploadPane from './DocReviewUploadPane';
import MakeSafetyEduMaterials from './MakeSafetyEduMaterials';

import RiskAssessmentWizard, {
  type RiskAssessmentDraft,
  draftToPrompt,
} from './risk-assessment/RiskAssessmentWizard'
import RiskAssessmentWizardModal from './risk-assessment/RiskAssessmentWizardModal';

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
  edu_material: { label: '교육자료 찾기' },
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
    id: 'risk_assessment',
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
    label: '교육자료 찾기',
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

export type SafetyDocDownload = {
  label: string;
  url: string;
  icon?: string;
  filename?: string;
};

export type SafetyDocGuide = {
  intro: string;
  fields: string[];

  // ✅ 신규(권장): 여러 개 다운로드 지원
  downloads?: SafetyDocDownload[];

  // ✅ 기존 호환(남겨둬도 됨)
  downloadLabel?: string;
  downloadUrl?: string;
};

const makeDownloads = (id: string, baseLabel: string): SafetyDocDownload[] => [
  {
    label: `${baseLabel} (HWP) 다운로드`,
    url: `/templates/${id}.hwp`,
    icon: '📝',
    filename: `${baseLabel}.hwp`,      // ✅ 저장 파일명
  },
  {
    label: `${baseLabel} (XLSX) 다운로드`,
    url: `/templates/${id}.xlsx`,
    icon: '📊',
    filename: `${baseLabel}.xlsx`,     // ✅ 저장 파일명
  },
];

export const SAFETY_DOC_GUIDES: Record<string, SafetyDocGuide> = {
  /* =========================
   * 1) 교육·안전관리 계획/평가 관련
   * ========================= */

  'goal-plan': {
    intro:
      '안전보건 목표 추진계획(안)을 작성하기 위해 다음 정보를 정리해 주세요.',
    fields: [
      '· 계획 기간(연도·분기 등)',
      '· 사업장/공정 개요와 상시 근로자 수',
      '· 설정하려는 주요 안전보건 목표(예: 재해율, 교육 이수율, 위험성평가 완료율 등)',
      '· 각 목표별 세부 추진과제와 KPI(지표)',
      '· 과제별 담당 부서와 책임자',
      '· 월별·분기별 추진 일정과 주요 마일스톤',
      '· 필요한 예산·인력·설비 등 자원 계획',
      '· 계획 이행 상황을 점검·보고하는 방법(회의, 보고서 등)',
    ],
    downloads: makeDownloads('goal-plan', '추진계획(안) 기본 양식'),
  },

  'edu-plan-result': {
    intro:
      '교육훈련 계획대비 실적 결과표 작성을 위해 다음 항목을 알려주세요.',
    fields: [
      '· 대상 기간(연도·월 또는 분기)',
      '· 계획한 교육 과정 목록(법정/자율 교육 구분 포함)',
      '· 각 과정별 계획 인원, 계획 횟수, 계획 교육시간',
      '· 실제 교육 실시 일자와 시간',
      '· 실제 참석 인원, 참석률, 미참석 사유',
      '· 외부 위탁·온라인 교육 등 특이사항',
      '· 향후 미실시/미이수 인원에 대한 보완 계획',
    ],
    downloads: makeDownloads('edu-plan-result', '계획대비 실적 결과표 양식'),
  },

  'disaster-drill-report': {
    intro:
      '비상재난 대응훈련 결과보고서를 작성하기 위해 다음 정보를 알려주세요.',
    fields: [
      '· 훈련 명칭과 대상 재난 유형(화재, 지진, 화학물질 누출 등)',
      '· 훈련 일시, 소요 시간, 실시 부서',
      '· 훈련 장소와 참여 인원(부서별 인원 포함)',
      '· 훈련 시나리오와 주요 진행 절차(대피, 초동조치, 상황 전파 등)',
      '· 유관기관(소방서, 경찰, 협력업체 등) 참여 여부와 역할',
      '· 훈련 중 발견된 문제점과 우수 사례',
      '· 재난 대응체계 개선사항 및 후속 조치 계획',
      '· 첨부할 사진, 체크리스트, 참석부 등 자료 목록',
    ],
    downloads: makeDownloads('disaster-drill-report', '비상재난 훈련 결과보고서 양식'),
  },

  'safety-cost-plan': {
    intro:
      '안전보건비용계획서를 작성하기 위해 다음의 예산 계획 정보를 알려주세요.',
    fields: [
      '· 계획 기간(연도·사업연도 등)',
      '· 사업장 또는 조직 단위별 안전보건 예산 총액',
      '· 항목별 예산(보호구, 안전교육, 시설·설비 개선, 측정·검사, 건강검진 등)',
      '· 각 항목별 산정 근거(인원 수, 단가, 예정 수량 등)',
      '· 우선순위가 높은 투자 항목과 그 이유',
      '· 예산 집행·관리 책임 부서와 담당자',
      '· 예산 집행 결과를 점검·보고하는 주기와 방법',
    ],
    downloads: makeDownloads('safety-cost-plan', '안전보건비용계획서 양식'),
  },

  'law-compliance-eval': {
    intro: '법규준수평가서를 작성하기 위해 다음 내용을 정리해 주세요.',
    fields: [
      '· 평가 대상 사업장과 평가 일자',
      '· 적용 대상 주요 법령·규정 목록(산업안전보건법, 중대재해처벌법 등)',
      '· 법령별로 점검할 세부 항목·체크리스트',
      '· 점검 방법(서류 검토, 현장 점검, 인터뷰 등)',
      '· 항목별 준수 여부 결과(적합/부적합/해당 없음 등)',
      '· 부적합 사항의 내용, 원인, 개선 계획',
      '· 평가 참여 인원(평가자·참석자) 및 확인·서명 방식',
    ],
    downloads: makeDownloads('law-compliance-eval', '법규준수평가 양식'),
  },

  'safety-system-eval': {
    intro:
      '안전보건관리체계 평가표 작성을 위해 다음과 같은 정보를 알려주세요.',
    fields: [
      '· 평가 대상 조직(본사/사업장/라인 등)과 평가 기준일',
      '· 경영자의 안전보건 방침·목표 수립 및 이행 수준',
      '· 안전보건 조직·전담 인력 구성과 권한 부여 현황',
      '· 위험성평가, 작업표준, 점검·작업허가제 운영 수준',
      '· 교육·훈련, 도급·협력업체 관리 수준',
      '· 사고·재해 조사 및 재발방지대책 수립 체계',
      '· 관리체계 전반에 대한 종합평가(등급, 코멘트 등)',
      '· 향후 개선이 필요한 핵심 과제와 일정',
    ],
    downloads: makeDownloads('safety-system-eval', '관리체계 평가표 양식'),
  },

  'safety-edu-result-report': {
    intro:
      '안전보건교육 결과보고서를 작성하기 위해 아래 정보를 알려주세요.',
    fields: [
      '· 교육 제목과 교육 목적',
      '· 교육 대상(직무, 직급, 인원수 등)',
      '· 교육 일시, 장소, 총 교육 시간',
      '· 교육 방식(집체, 온라인, 실습 등)',
      '· 실제 참석자 명단과 참석률, 결원 사유',
      '· 주요 교육 내용과 현장에서 강조한 핵심 메시지',
      '· 이해도·만족도 평가 결과(설문, 퀴즈 등)',
      '· 추가로 필요한 보완 교육이나 후속 조치 계획',
    ],
    downloads: makeDownloads('safety-edu-result-report', '교육 결과보고서 양식'),
  },

  'emergency-drill-report': {
    intro:
      '비상사태 대응 훈련 결과 보고서 작성을 위해 다음의 내용을 알려주세요.',
    fields: [
      '· 훈련 참가자 명단',
      '· 훈련 실시 부서',
      '· 훈련 내용',
      '· 훈련 장소',
      '· 훈련 이미지 2개 이상 첨부',
      '· 그 외 보고서 내 작성해야 할 정보',
    ],
    downloads: makeDownloads('emergency-drill-report', '결과보고서 기본 양식'),
  },

  /* =========================
   * 2) 회의·협의체 관련
   * ========================= */

  'worker-participation-minutes': {
    intro: '근로자 참여협의록 작성을 위해 회의 정보를 알려주세요.',
    fields: [
      '· 회의 일시와 장소',
      '· 회의 명칭과 주관 부서',
      '· 참석자 명단(근로자 대표, 관리자 등)',
      '· 논의한 주요 안건(작업환경, 안전 개선, 복지 등)',
      '· 안건별 제기된 의견과 질의 내용',
      '· 합의된 조치 사항, 담당자, 완료 예정일',
      '· 차기 회의 일정 및 후속 관리 계획',
    ],
    downloads: makeDownloads('worker-participation-minutes', '근로자 참여협의록 양식'),
  },

  'safety-council-minutes': {
    intro: '안전보건 협의체 회의록 작성을 위해 다음 정보를 알려주세요.',
    fields: [
      '· 협의체 명칭, 회의 일시와 장소',
      '· 참석자 명단(원청·협력업체, 노사 대표 등)',
      '· 회의 안건(재해 현황, 위험성평가, 공사 일정 등)',
      '· 안건별 보고 내용과 논의 사항',
      '· 결정된 사항과 이행 책임 부서·기한',
      '· 미해결 안건 및 차기 회의에서 다룰 사항',
    ],
    downloads: makeDownloads('safety-council-minutes', '안전보건 협의체 회의록 양식'),
  },

  'safety-fair-meeting-minutes': {
    intro: '안전공정회의 회의록 작성을 위해 다음 내용을 알려주세요.',
    fields: [
      '· 회의 일시·장소·참석 부서',
      '· 해당 공정 또는 작업의 개요(작업 내용, 일정 등)',
      '· 공정별 주요 위험요인과 논의된 안전대책',
      '· 공정·작업 순서상의 변경 사항 및 영향',
      '· 필요한 추가 안전조치, 인력·장비 지원 사항',
      '· 회의에서 합의된 follow-up 조치와 담당자',
    ],
    downloads: makeDownloads('safety-fair-meeting-minutes', '안전공정회의 회의록 양식'),
  },

  'suggestion-hearing-form': {
    intro: '건의사항 청취표 작성을 위해 건의 내용을 알려주세요.',
    fields: [
      '· 건의자 정보(성명, 소속, 연락처 등)',
      '· 건의 접수 일시와 장소',
      '· 건의 유형(안전, 보건, 환경, 복지 등)',
      '· 현재 문제 상황 또는 위험요인 설명',
      '· 건의자가 제안하는 개선 아이디어·조치 사항',
      '· 검토 결과(수용/보완/보류 등)와 그 사유',
      '· 실제 실행 여부와 후속 조치 내용',
    ],
    downloads: makeDownloads('suggestion-hearing-form', '건의사항 청취표 양식'),
  },

  /* =========================
   * 3) 일상점검·작업관리
   * ========================= */

  'tbm-log': {
    intro: 'TBM 활동일지를 작성하기 위해 다음 정보를 알려주세요.',
    fields: [
      '· TBM 실시 일시와 장소(작업 위치)',
      '· 참석자 명단과 작업 반/조 편성',
      '· 당일 작업 내용과 공정 개요',
      '· 작업 전 공유한 위험요인과 안전조치 사항',
      '· 작업자 의견·질문, 특이사항',
      '· 당일 안전 강조 메시지 또는 슬로건',
    ],
    downloads: makeDownloads('tbm-log', 'TBM 활동일지 양식'),
  },

  'heat-illness-control-sheet': {
    intro: '온열질환 관리표 작성을 위해 다음 데이터를 알려주세요.',
    fields: [
      '· 관리 대상 사업장·작업장 정보',
      '· 근로자 명단(고위험군 여부 포함)',
      '· 작업 시간대별 기온/습도 또는 WBGT 측정값',
      '· 무더위 시간대 작업 조정·휴식 시간 계획',
      '· 냉방·환기·음료 제공 등의 보호 조치 내용',
      '· 온열질환 의심 증상 발생 여부와 조치 내용',
    ],
    downloads: makeDownloads('heat-illness-control-sheet', '온열질환 관리표 양식'),
  },

  'ppe-issue-ledger': {
    intro: '보호구 지급 대장을 작성하기 위해 다음 정보를 알려주세요.',
    fields: [
      '· 지급 대상 근로자 성명·소속·직무',
      '· 지급한 보호구 종류(안전모, 안전화, 보안경 등)',
      '· 규격·모델명·인증번호 등 세부 사양',
      '· 지급 일자와 수량',
      '· 교체 예정일 또는 사용 기한',
      '· 근로자 서명·수령 확인 방법',
    ],
    downloads: makeDownloads('ppe-issue-ledger', '보호구 지급 대장 양식'),
  },

  'work-plan': {
    intro: '작업계획서 작성을 위해 작업 정보를 알려주세요.',
    fields: [
      '· 작업 명칭과 작업 개요(공정, 설비, 위치 등)',
      '· 작업 기간과 일정(시작·종료 예정일)',
      '· 투입 인원(직무·숙련도 등)과 장비·도구 목록',
      '· 작업 순서(단계별 주요 내용)',
      '· 단계별 잠재 위험요인과 안전조치 계획',
      '· 필요한 작업허가, 교육, 자격요건 등',
    ],
    downloads: makeDownloads('work-plan', '작업계획서 양식'),
  },

  'work-permit': {
    intro: '작업허가서(위험작업 허가) 작성을 위해 다음 내용을 알려주세요.',
    fields: [
      '· 허가 대상 작업 종류(밀폐공간, 화재위험, 고소작업 등)',
      '· 작업 장소와 공정·설비 정보',
      '· 작업 예정 일시와 예상 소요 시간',
      '· 작업 전 시행해야 할 안전조치(가스농도 측정, Lock-out/Tag-out 등)',
      '· 필요 자격·교육 이수 여부 확인 내용',
      '· 허가 발행자·감독자·작업자 서명/확인 절차',
    ],
    downloads: makeDownloads('work-permit', '작업허가서 양식'),
  },

  'daily-safety-council-minutes': {
    intro:
      '일상적인 안전보건 협의체 회의록 작성을 위해 아래 정보를 알려주세요.',
    fields: [
      '· 회의 일시와 장소',
      '· 참석자 명단 및 소속',
      '· 당일 작업·공정 현황 요약',
      '· 현안 이슈(사고, 아차사고, 민원 등)',
      '· 논의된 위험요인과 개선조치 내용',
      '· 조치 담당자, 완료 목표일, follow-up 계획',
    ],
    downloads: makeDownloads('daily-safety-council-minutes', '일상 협의체 회의록 양식'),
  },

  'msds-list': {
    intro:
      '물질안전보건자료목록표(MSDS) 작성을 위해 화학물질 정보를 알려주세요.',
    fields: [
      '· 취급 중인 화학물질명(제품명, 성분명 등)',
      '· CAS No., 함유 농도, 혼합물 여부',
      '· 보관 장소와 사용 공정·설비 정보',
      '· 연간 사용량 또는 보관량',
      '· 위험·유해성 분류와 주요 위험요인',
      '· 보유 중인 MSDS 발행처, 개정 일자, 언어 등',
    ],
    downloads: makeDownloads('msds-list', 'MSDS 목록표 양식'),
  },

  'work-stop-request-log': {
    intro:
      '작업중지요청 기록대장을 작성하기 위해 요청 내역을 알려주세요.',
    fields: [
      '· 작업중지 요청 일시와 요청자(성명, 소속)',
      '· 작업 위치와 작업 내용',
      '· 작업중지를 요청한 구체적 사유(위험요인, 사고 징후 등)',
      '· 현장에서 즉시 취한 조치 내용',
      '· 작업 재개 승인 일시와 승인자',
      '· 추가 개선조치 및 재발방지 계획',
    ],
    downloads: makeDownloads('work-stop-request-log', '작업중지요청 기록대장 양식'),
  },

  'work-stop-request-form': {
    intro: '작업중지 요청서 작성을 위해 다음 정보를 알려주세요.',
    fields: [
      '· 요청자 성명·소속·연락처',
      '· 요청 일시와 작업 위치',
      '· 현재 진행 중인 작업 내용',
      '· 즉시 중지해야 한다고 판단한 구체적 위험 상황',
      '· 작업 중지 범위(공정·설비·구역 등)',
      '· 요청자의 의견 및 긴급 개선이 필요한 사항',
    ],
    downloads: makeDownloads('work-stop-request-form', '작업중지 요청서 양식'),
  },

  /* =========================
   * 4) 재해·사고 관리
   * ========================= */

  'industrial-accident-investigation': {
    intro: '산업재해조사표 작성을 위해 사고 정보를 알려주세요.',
    fields: [
      '· 사고 발생 일시와 장소(현장, 설비, 공정 등)',
      '· 피재자 인적사항(성명, 소속, 직무, 경력 등)',
      '· 사고 유형(추락, 협착, 전도, 감전 등)과 상해 정도',
      '· 사고 발생 경위(시간 순서대로)',
      '· 직접 원인(불안전한 행동·상태)과 간접·배경 원인',
      '· 즉시 조치 내용(응급조치, 작업중지 등)',
      '· 재발방지 대책(공정 개선, 교육, 보호구 등)',
    ],
    downloads: makeDownloads('industrial-accident-investigation', '산업재해조사표 양식'),
  },

  'accident-report': {
    intro: '재해보고서 작성을 위해 다음 내용을 알려주세요.',
    fields: [
      '· 재해 발생 일시와 장소',
      '· 재해 유형과 피해 규모(인적·물적 피해)',
      '· 재해 발생 당시 작업 내용과 환경',
      '· 재해 원인에 대한 요약 분석',
      '· 즉시 조치 및 응급 대응 내용',
      '· 관계 기관 신고 여부 및 처리 현황',
      '· 향후 재발방지를 위한 주요 개선사항',
    ],
    downloads: makeDownloads('accident-report', '재해보고서 양식'),
  },

  'near-miss-investigation-report': {
    intro: '아차사고 조사 보고서 작성을 위해 다음 정보를 알려주세요.',
    fields: [
      '· 아차사고 발생 일시와 장소',
      '· 관련 작업 내용과 사용 설비·도구',
      '· 발생 당시 상황 및 “조금만 더 했으면” 일어날 수 있었던 피해',
      '· 발생 원인(작업 방법, 장비 상태, 주변 환경 등)',
      '· 유사 사고 재발 가능성이 높은 공정·조건',
      '· 재발방지를 위한 개선조치와 관리방안',
    ],
    downloads: makeDownloads('near-miss-investigation-report', '아차사고 조사 보고서 양식'),
  },

  /* =========================
   * 5) 법정 선임·자격·평가
   * ========================= */

  'safety-person-eval': {
    intro:
      '안전보건관계자 평가표 작성을 위해 평가 대상자 정보를 알려주세요.',
    fields: [
      '· 평가 대상자 성명, 직위, 담당 역할(안전보건관리책임자 등)',
      '· 평가 기간과 평가 기준(연 1회 등)',
      '· 평가 항목(법령 이해도, 이행 수준, 리더십, 의사소통 등)',
      '· 각 항목별 평가 등급 또는 점수',
      '· 주요 강점과 개선이 필요한 부분에 대한 코멘트',
      '· 종합 평가 의견과 향후 교육·지원 계획',
    ],
    downloads: makeDownloads('safety-person-eval', '안전보건관계자 평가표 양식'),
  },

  'supervisor-eval': {
    intro: '관리 감독자 평가표 작성을 위해 다음 정보를 알려주세요.',
    fields: [
      '· 관리감독자 성명, 소속, 담당 공정·라인',
      '· 평가 기간과 근무 형태(주·야간, 교대 등)',
      '· 일상 점검·TBM·작업허가 관리 수행 정도',
      '· 위험성평가 반영 및 작업 표준 준수 관리 수준',
      '· 부하 직원에 대한 교육·지도·피드백 사례',
      '· 사고·아차사고 발생 시 대응 및 재발방지 노력',
      '· 종합 평가 등급과 향후 육성 계획',
    ],
    downloads: makeDownloads('supervisor-eval', '관리 감독자 평가표 양식'),
  },

  'safety-qualification-register': {
    intro:
      '안전보건 자격등록 목록부 작성을 위해 보유 자격 정보를 알려주세요.',
    fields: [
      '· 자격 보유자 성명, 소속, 직무',
      '· 보유 자격명(산업안전기사, 위험물기능사 등)',
      '· 자격번호, 발급기관, 취득일자',
      '· 유효기간 또는 갱신 필요 여부',
      '· 자격과 연관된 담당 업무 또는 역할',
      '· 향후 취득 예정인 자격 및 계획',
    ],
    downloads: makeDownloads('safety-qualification-register', '자격등록 목록부 양식'),
  },

  'safety-person-appointment-report': {
    intro:
      '안전보건관계자 선임 등 보고서를 작성하기 위해 다음 정보를 알려주세요.',
    fields: [
      '· 선임 대상 직책(안전보건관리책임자, 관리감독자 등)',
      '· 선임 대상자 성명, 소속, 직위',
      '· 선임 일자와 적용 사업장 범위',
      '· 선임의 법적 근거(관련 조항, 기준 등)',
      '· 겸직 여부, 이전 선임자와의 인수인계 내용',
      '· 보고 대상 기관(관할 지방고용노동관서 등)과 보고 방법',
    ],
    downloads: makeDownloads('safety-person-appointment-report', '선임 등 보고서 양식'),
  },

  'safety-person-appointment-doc': {
    intro:
      '안전보건관계자 선임 및 지정서 작성을 위해 아래 정보를 알려주세요.',
    fields: [
      '· 선임·지정할 직무(안전관리자, 보건관리자, 감시인 등)',
      '· 대상자 성명, 소속, 직위, 담당 업무',
      '· 선임·지정 일자와 유효 기간',
      '· 부여되는 권한과 책임 범위',
      '· 보고·협의·결재 라인 등 의사소통 체계',
      '· 대표자 또는 권한대행자의 서명·날인 정보',
    ],
    downloads: makeDownloads('safety-person-appointment-doc', '선임 및 지정서 양식'),
  },
};

/** 개별 교육자료(교육 교안, PPT 등) */
export interface SafetyEduMaterial {
  id: string;        // 'crane-basic-training'
  title: string;     // '크레인 작업 안전교육(기초)'
  guideKey: string;  // SAFETY_EDU_GUIDES 의 key
}

/** 공정별 교육 카테고리 */
export interface SafetyEduCategory {
  id: string;             // 'lifting-height'
  title: string;          // '크레인·양중·고소작업'
  description: string;
  materials: SafetyEduMaterial[];
}

/** 교육자료 설명 + 다운로드 정보 */
export interface SafetyEduGuide {
  intro: string;
  bulletPoints: string[];      // 기존 fields랑 같은 역할
  downloadLabel?: string;
  downloadUrl?: string;
}

/**
 * 공정별 교육 카테고리 + 교육자료 목록
 */
export const SAFETY_EDU_CATEGORIES_RAW: SafetyEduCategory[] = [
  /* =========================
   * 1) 크레인·양중·고소작업
   * ========================= */
  {
    id: 'lifting-height',
    title: '크레인·양중·고소작업',
    description:
      '크레인, 이동식 크레인, 고소작업대, 비계 등 물건을 들어 올리거나 높은 곳에서 작업할 때 필요한 필수 안전교육 자료입니다.',
    materials: [
      {
        id: 'crane-basic-training',
        title: '크레인 작업 안전교육(기초)',
        guideKey: 'crane-basic-training',
      },
      {
        id: 'rigging-signal-training',
        title: '와이어로프·슬링·신호수 교육',
        guideKey: 'rigging-signal-training',
      },
      {
        id: 'fall-protection-training',
        title: '고소작업·추락방지 기본교육',
        guideKey: 'fall-protection-training',
      },
    ],
  },

  /* =========================
   * 2) 밀폐공간 작업
   * ========================= */
  {
    id: 'confined-space',
    title: '밀폐공간 작업',
    description:
      '탱크, 맨홀, 피트, 저장조 등 밀폐·반폐쇄 공간에서 가스 중독·질식사고를 예방하기 위한 교육자료입니다.',
    materials: [
      {
        id: 'confined-space-basic',
        title: '밀폐공간 작업 안전 기본교육',
        guideKey: 'confined-space-basic',
      },
      {
        id: 'confined-space-gas-measure',
        title: '밀폐공간 가스측정·환기·감시인 교육',
        guideKey: 'confined-space-gas-measure',
      },
      {
        id: 'confined-space-rescue',
        title: '밀폐공간 비상대응·구조훈련 교육',
        guideKey: 'confined-space-rescue',
      },
    ],
  },

  /* =========================
   * 3) 전기작업·LOTO
   * ========================= */
  {
    id: 'electrical-loto',
    title: '전기작업·LOTO',
    description:
      '수배전반, 전동기, 설비 유지보수 등 감전·아크플래시 위험이 있는 전기작업과 Lock-out/Tag-out 절차 교육자료입니다.',
    materials: [
      {
        id: 'electrical-basic-training',
        title: '전기 안전 일반(감전·아크플래시)',
        guideKey: 'electrical-basic-training',
      },
      {
        id: 'lockout-tagout-training',
        title: 'Lock-out/Tag-out(LOTO) 절차 교육',
        guideKey: 'lockout-tagout-training',
      },
      {
        id: 'electrical-permit-training',
        title: '전기 설비 작업허가·검전·접지 교육',
        guideKey: 'electrical-permit-training',
      },
    ],
  },

  /* =========================
   * 4) 화기 작업·용접·절단
   * ========================= */
  {
    id: 'hot-work-fire',
    title: '화기 작업·용접·절단',
    description:
      '용접·가스절단·연마 등 불꽃·고열이 발생하는 작업에서 화재·폭발사고를 예방하기 위한 교육자료입니다.',
    materials: [
      {
        id: 'hot-work-basic-training',
        title: '화기 작업 기본 안전교육',
        guideKey: 'hot-work-basic-training',
      },
      {
        id: 'hot-work-permit-training',
        title: '화기 작업허가·화재감시자 교육',
        guideKey: 'hot-work-permit-training',
      },
      {
        id: 'gas-cutting-welding-training',
        title: '가스용접·절단기 취급 및 사고 사례',
        guideKey: 'gas-cutting-welding-training',
      },
    ],
  },

  /* =========================
   * 5) 굴착·중장비·토공
   * ========================= */
  {
    id: 'excavation-heavy-equip',
    title: '굴착·중장비·토공',
    description:
      '굴착공사, 흙막이, 굴착기·불도저·덤프 등 중장비 사용 시 발생할 수 있는 붕괴·협착·접촉사고 예방 교육자료입니다.',
    materials: [
      {
        id: 'excavation-shoring-training',
        title: '굴착·흙막이 붕괴 재해 예방 교육',
        guideKey: 'excavation-shoring-training',
      },
      {
        id: 'heavy-equipment-operation-training',
        title: '굴착기·지게차·덤프 등 중장비 작업자 교육',
        guideKey: 'heavy-equipment-operation-training',
      },
      {
        id: 'spotter-traffic-control-training',
        title: '유도자·차량 통행 관리 교육',
        guideKey: 'spotter-traffic-control-training',
      },
    ],
  },

  /* =========================
   * 6) 화학물질·MSDS·호흡보호구
   * ========================= */
  {
    id: 'chemicals-msds',
    title: '화학물질·MSDS·호흡보호구',
    description:
      '도장, 세척, 공정용 화학물질 사용 사업장에서 필요한 MSDS 이해, 취급·보관, 호흡보호구 착용 교육자료입니다.',
    materials: [
      {
        id: 'msds-basic-training',
        title: 'MSDS 이해 및 화학물질 표지 교육',
        guideKey: 'msds-basic-training',
      },
      {
        id: 'chemical-handling-storage-training',
        title: '화학물질 취급·보관·누출 대응 교육',
        guideKey: 'chemical-handling-storage-training',
      },
      {
        id: 'respiratory-protection-training',
        title: '호흡보호구 종류·선정·밀착교육',
        guideKey: 'respiratory-protection-training',
      },
    ],
  },
];

/**
 * 각 교육자료별 상세 설명 + 다운로드 정보
 */
export const SAFETY_EDU_GUIDES_RAW: Record<string, SafetyEduGuide> = {
  /* ---------- 1) 크레인·양중·고소작업 ---------- */

  'crane-basic-training': {
    intro:
      '크레인 운전원·신호수·줄걸이 작업자에게 실시할 기초 안전교육(PPT/교안)을 구성할 때 포함해야 할 주요 내용을 정리했습니다.',
    bulletPoints: [
      '· 관련 법령: 산업안전보건법, 크레인 설치·운영 규정, 정기·수시점검 기준',
      '· 크레인 종류별 특징(호이스트, 이동식 크레인, 타워크레인 등)과 주요 위험요인',
      '· 정격하중, 작업반경, 아웃트리거 전개 등 기본 안전원칙',
      '· 운전 전 점검항목(와이어로프, 브레이크, 훅, 리미트 스위치 등)',
      '· 작업 중 금지행위(사람 태우기, 편하중 작업, 지반 불안정 상태 작업 등)',
      '· 신호수와 운전원의 의사소통 원칙(표준 수신호·무전 사용 요령)',
      '· 실제 사고 사례(전도, 붕괴, 와이어 단선 등)와 교훈',
    ],
    downloadLabel: '크레인 작업 기초 안전교육(PPT) 다운로드',
    downloadUrl: '/templates/crane-basic-training.ppt',
  },

  'rigging-signal-training': {
    intro:
      '줄걸이 작업자·신호수를 대상으로 하는 와이어로프·샤클·슬링 사용법과 표준 수신호 교육자료입니다.',
    bulletPoints: [
      '· 줄걸이 작업의 역할 분담(운전원·신호수·줄걸이 작업자)',
      '· 와이어로프, 체인, 섬유 슬링의 구조와 사용 가능 하중(WLL) 표시 읽는 법',
      '· 각종 걸이 방법(바스켓, 초크, 2점·4점 걸이 등)과 각도에 따른 하중 변화',
      '· 손상·마모·꼬임 등 사용 불가 기준과 폐기 절차',
      '· 표준 수신호(정지, 상승, 하강, 천천히, 비상정지 등)와 무전 사용 시 유의사항',
      '· 줄걸이 작업 중 협착·낙하 사고 사례와 예방대책',
    ],
    downloadLabel: '와이어로프·슬링·신호수 교육자료 다운로드',
    downloadUrl: '/templates/rigging-signal-training.ppt',
  },

  'fall-protection-training': {
    intro:
      '비계, 발판, 지붕, 고소작업대 등에서 작업하는 근로자를 위한 추락재해 예방 기본교육자료입니다.',
    bulletPoints: [
      '· 추락 위험 작업의 범위(2m 이상, 개구부, 개방된 단부 등)',
      '· 비계·작업발판·난간의 설치 기준과 점검 포인트',
      '· 안전대(전신형, 허리식)의 올바른 착용법과 앵커 포인트 기준',
      '· 고소작업대 사용 시 전도·끼임·접촉사고 주요 사례',
      '· 개구부·개방된 단부의 덮개·난간·표지 설치 기준',
      '· 비·풍속·야간 등 기상·환경 조건에 따른 작업 중지 기준',
    ],
    downloadLabel: '고소작업·추락방지 기본교육(PPT) 다운로드',
    downloadUrl: '/templates/fall-protection-training.ppt',
  },

  /* ---------- 2) 밀폐공간 작업 ---------- */

  'confined-space-basic': {
    intro:
      '밀폐공간에 출입하는 작업자에게 실시하는 기본 안전교육으로, 질식·중독사고 예방을 위한 필수 내용을 담고 있습니다.',
    bulletPoints: [
      '· 밀폐공간의 정의와 대표 사례(맨홀, 탱크, 피트, 보일러 등)',
      '· 산소결핍, 유해가스(황화수소, 일산화탄소 등)의 위험성',
      '· 밀폐공간 작업 시 법적 요구사항(작업허가, 감시인, 교육 등)',
      '· 출입 전 체크리스트: 환기, 가스측정, 비상구·통신수단 확보',
      '· 비상 시 대피 절차와 구조 요청 방법',
      '· 실제 질식사고 사례와 주요 원인 분석',
    ],
    downloadLabel: '밀폐공간 작업 기본교육(PPT) 다운로드',
    downloadUrl: '/templates/confined-space-basic.ppt',
  },

  'confined-space-gas-measure': {
    intro:
      '밀폐공간 작업 전·중 가스 측정 및 환기, 감시인 역할에 초점을 맞춘 실무형 교육자료입니다.',
    bulletPoints: [
      '· 산소농도·폭발하한계(LEL)·유해가스 기준치 이해',
      '· 가스측정기 종류(고정식·휴대식)와 교정·점검 방법',
      '· 측정 위치·순서(상·중·하층)와 시간 간격 설정',
      '· 송풍기·배기팬을 활용한 환기 방법과 주의사항',
      '· 감시인의 역할(출입관리, 인원 파악, 비상연락, 작업중지 권한 등)',
      '· 측정·환기 기록 양식 작성 예시',
    ],
    downloadLabel: '밀폐공간 가스측정·환기 교육자료 다운로드',
    downloadUrl: '/templates/confined-space-gas-measure.ppt',
  },

  'confined-space-rescue': {
    intro:
      '밀폐공간 내 사고 발생 시 구조대 도착 전까지 사업장 자체에서 수행해야 할 초기 대응·구조 절차 교육자료입니다.',
    bulletPoints: [
      '· 구조 시 2차 질식·중독사고 발생 위험(무방비 진입의 위험성)',
      '· “절대 단독 진입 금지” 원칙과 비접촉 구조 개념',
      '· 삼각대, 윈치, 하네스 등 구조장비 기본 구성',
      '· 구조·응급조치 흐름(상황 파악 → 119 신고 → 환기·측정 → 안전한 구조 시도)',
      '· 정기적인 모의훈련 계획 수립과 체크리스트 예시',
      '· 실제 밀폐공간 구조 실패 사례와 교훈',
    ],
    downloadLabel: '밀폐공간 비상대응·구조훈련 교육자료 다운로드',
    downloadUrl: '/templates/confined-space-rescue.ppt',
  },

  /* ---------- 3) 전기작업·LOTO ---------- */

  'electrical-basic-training': {
    intro:
      '전기 설비를 취급하는 모든 근로자를 대상으로 하는 감전·아크플래시 예방 기본교육자료입니다.',
    bulletPoints: [
      '· 인체에 대한 전기의 영향(전류·통전경로·통전시간)',
      '· 감전 사고 주요 유형(누전, 합선, 설비 접촉, 젖은 손·바닥 등)',
      '· 아크플래시·아크블라스트 현상과 보호대책',
      '· 누전차단기, 접지, 절연 보호구의 역할',
      '· 젖은 환경·금속 사다리 사용 금지 등 작업수칙',
      '· 감전 시 응급조치(전원 차단, 안전한 구조, 심폐소생술 연계)',
    ],
    downloadLabel: '전기 안전 일반교육(PPT) 다운로드',
    downloadUrl: '/templates/electrical-basic-training.ppt',
  },

  'lockout-tagout-training': {
    intro:
      '설비 정비·청소·점검 시 오동작·예기치 않은 기동을 막기 위한 Lock-out/Tag-out(LOTO) 절차 교육자료입니다.',
    bulletPoints: [
      '· LOTO가 필요한 작업의 범위(전기, 유압, 공압, 중력에너지 등)',
      '· 에너지 차단 장치 종류(개폐기, 밸브, 차단기 등)와 잠금 장치',
      '· LOTO 6단계 절차(통보 → 정지 → 에너지 차단 → 잠금·표지 → 에너지 해소 → 검증)',
      '· 개인 잠금장치(PADLOCK)와 그룹 잠금 방법',
      '· 작업 완료 후 해제 절차와 인원 확인',
      '· LOTO 미준수로 인한 실제 중대사고 사례',
    ],
    downloadLabel: 'LOTO 절차 교육자료 다운로드',
    downloadUrl: '/templates/lockout-tagout-training.ppt',
  },

  'electrical-permit-training': {
    intro:
      '수배전반·고압 설비 등 위험도가 높은 전기작업 수행자에게 필요한 작업허가 및 검전·접지 교육자료입니다.',
    bulletPoints: [
      '· 고압·특고압 설비 작업 시 요구되는 자격·교육 요건',
      '· 전기작업 허가서 주요 항목(작업범위, 차단범위, 책임자 등)',
      '· 검전 절차(검전기 점검 → 비접촉 검전 → 접촉 검전)',
      '· 작업 전 접지 설치 기준과 순서',
      '· 활선근접 작업 시 접근한계거리 및 보호구 기준',
      '· 전기작업 중 위험 징후(소음, 냄새, 발열 등) 발견 시 조치요령',
    ],
    downloadLabel: '전기 설비 작업허가·검전 교육자료 다운로드',
    downloadUrl: '/templates/electrical-permit-training.ppt',
  },

  /* ---------- 4) 화기 작업·용접·절단 ---------- */

  'hot-work-basic-training': {
    intro:
      '용접·가스절단·연마 작업 시 화재·폭발·화상사고를 예방하기 위한 기본 안전교육자료입니다.',
    bulletPoints: [
      '· 화기 작업의 정의와 대표 작업(아크용접, 가스절단, 그라인더 등)',
      '· 불티 비산 거리와 하역장·가연물 근접 작업의 위험성',
      '· 인화성 물질(페인트, 용제, 가스 등) 주변 작업 금지 원칙',
      '· 용접면·보안경·방염포 등 보호구 및 방호장비 사용',
      '· 작업 전 주변 정리·차단·소화기 비치 등 준비 사항',
      '· 작업 종료 후 최소 30분 이상 화재감시의 필요성',
    ],
    downloadLabel: '화기 작업 기본 안전교육(PPT) 다운로드',
    downloadUrl: '/templates/hot-work-basic-training.ppt',
  },

  'hot-work-permit-training': {
    intro:
      '공사 현장·공장 내 화기 작업허가제 운영을 위한 담당자·감시원 교육자료입니다.',
    bulletPoints: [
      '· 화기 작업허가제가 필요한 이유와 법적 요구사항',
      '· 작업허가서 필수 항목(장소, 시간, 가연물 제거, 소화설비 등)',
      '· 화재감시자의 역할(감시 범위, 비상연락, 작업중지 권한 등)',
      '· 인근 설비·배관·케이블 트레이 등 은폐 공간 화재 위험',
      '· 화기 작업 전·중·후 점검 체크리스트 예시',
      '· 허가제 미운영으로 발생한 대형 화재 사고 사례',
    ],
    downloadLabel: '화기 작업허가·감시자 교육자료 다운로드',
    downloadUrl: '/templates/hot-work-permit-training.ppt',
  },

  'gas-cutting-welding-training': {
    intro:
      '가스용접·절단 장비 취급자에게 필요한 안전사용·보관·점검 요령과 사고 사례를 다룬 교육자료입니다.',
    bulletPoints: [
      '· 산소·아세틸렌·LPG 용기의 구조와 색상 구분',
      '· 역화·역류 방지기, 조정기, 호스 점검 방법',
      '· 용기 고정, 밸브 개폐 요령, 누설 점검 방법(비눗물 검사 등)',
      '· 불꽃 역류, 호스 파열, 용기 전도 시 대응 절차',
      '· 용기 보관 장소·온도·거리 기준',
      '· 가스용접·절단 작업 중 폭발사고 사례 분석',
    ],
    downloadLabel: '가스용접·절단기 안전 취급 교육자료 다운로드',
    downloadUrl: '/templates/gas-cutting-welding-training.ppt',
  },

  /* ---------- 5) 굴착·중장비·토공 ---------- */

  'excavation-shoring-training': {
    intro:
      '지하 매설물, 토사 붕괴, 흙막이 붕괴 사고를 예방하기 위한 굴착·흙막이 공사 안전교육자료입니다.',
    bulletPoints: [
      '· 굴착깊이·토질·지하수 등에 따른 붕괴 위험요인',
      '· 흙막이 공법별(버팀보, 어스앵커 등) 안전관리 포인트',
      '· 굴착면 경사, 토사 적치 위치, 차량 하중 영향',
      '· 지하 매설물(가스, 통신, 상·하수도) 확인 절차',
      '· 우기·동절기 굴착 작업 시 추가 위험요인',
      '· 붕괴 징후(균열, 토사 이동 등) 발견 시 작업중지 기준',
    ],
    downloadLabel: '굴착·흙막이 붕괴 재해 예방 교육자료 다운로드',
    downloadUrl: '/templates/excavation-shoring-training.ppt',
  },

  'heavy-equipment-operation-training': {
    intro:
      '굴착기, 지게차, 휠로더, 덤프트럭 등 중장비 운전원·신호수·보행자를 대상으로 하는 안전교육자료입니다.',
    bulletPoints: [
      '· 장비별 사각지대 및 회전반경 이해',
      '· 전도·전복 사고 주요 원인(과적, 경사, 지반 침하 등)',
      '· 인근 보행자·작업자 보호를 위한 출입 통제·유도 방법',
      '· 장비 일일점검 항목(타이어/트랙, 제동장치, 작업기 등)',
      '· 유도자와 운전원의 수신호·무전 통신 규칙',
      '· 중장비와 보행자 충돌·협착 사고 사례와 교훈',
    ],
    downloadLabel: '중장비 작업자·유도자 안전교육자료 다운로드',
    downloadUrl: '/templates/heavy-equipment-operation-training.ppt',
  },

  'spotter-traffic-control-training': {
    intro:
      '현장 내 차량 통행이 많은 사업장에서 유도자·신호수에게 필요한 교통관리·통행계획 교육자료입니다.',
    bulletPoints: [
      '· 현장 내 차량·보행자 동선 파악과 일방통행·출입구 계획',
      '· 유도자의 위치 선정(안전거리, 피난 경로 확보 등)',
      '· 수신호·지시신호 표준과 야간·우천 시 보조 장비(라이트, 형광조끼 등)',
      '· 차단봉·콘·바리케이드 등 물리적 차단 수단 사용법',
      '· 덤프트럭 후진·굴착기 회전 구간 등 고위험 구역 관리',
      '· 교통사고 발생 시 초기 대응·신고 절차',
    ],
    downloadLabel: '유도자·차량 통행 관리 교육자료 다운로드',
    downloadUrl: '/templates/spotter-traffic-control-training.ppt',
  },

  /* ---------- 6) 화학물질·MSDS·호흡보호구 ---------- */

  'msds-basic-training': {
    intro:
      '사업장 내 사용하는 화학제품의 MSDS를 이해하고 경고표지를 읽을 수 있도록 하는 기초 교육자료입니다.',
    bulletPoints: [
      '· MSDS의 목적과 법적 비치·교육 의무',
      '· MSDS 주요 항목(위험·유해성, 취급·저장, 누출 시 조치 등) 읽는 방법',
      '· GHS pictogram(위험표지) 의미와 예시',
      '· 라벨 정보(제품명, 신호어, 유해·위험문구, 예방조치문구 등) 해석',
      '· 작업 전 MSDS 확인 절차와 실습 예시',
      '· MSDS 미비 또는 외국어 MSDS 활용 시 주의사항',
    ],
    downloadLabel: 'MSDS 이해 및 화학물질 표지 교육자료 다운로드',
    downloadUrl: '/templates/msds-basic-training.ppt',
  },

  'chemical-handling-storage-training': {
    intro:
      '도장, 세척, 세정 공정 등에서 사용하는 화학물질의 안전한 취급·보관·누출 대응을 다루는 실무 교육자료입니다.',
    bulletPoints: [
      '· 휘발성 유기화합물, 산·알칼리, 독성가스 등 물질별 주요 위험성',
      '· 취급 시 필요한 개인보호구(PPE) 선택 기준',
      '· 저장탱크·드럼·용기 보관 기준(온도, 통풍, 분리보관 등)',
      '· 소량·대량 누출 시 대응 절차(제거, 흡착제 사용, 격리 등)',
      '· 배관·밸브·호스 연결 전 누설 점검 요령',
      '· 화학물질 관련 화재·폭발·누출 사고 사례',
    ],
    downloadLabel: '화학물질 취급·보관·누출 대응 교육자료 다운로드',
    downloadUrl: '/templates/chemical-handling-storage-training.ppt',
  },

  'respiratory-protection-training': {
    intro:
      '분진, 유기용제, 용접흄 등 호흡기 유해요인에 노출되는 작업자를 위한 호흡보호구 교육자료입니다.',
    bulletPoints: [
      '· 호흡보호구 필요 작업(분진, 유기용제, 용접흄, 곰팡이 등)',
      '· 필터 종류(방진, 방독, 겸용)와 색상·기호 의미',
      '· 적합한 보호구 선정 절차(농도, 노출시간, 작업형태 등)',
      '· 밀착성 확보 방법(밀착검사, 수염·안경 등 영향요인)',
      '· 보관·교체 주기 관리와 필터 포화 징후',
      '· 호흡보호구 착용 불량으로 인한 건강장해 사례',
    ],
    downloadLabel: '호흡보호구 선택·착용·관리 교육자료 다운로드',
    downloadUrl: '/templates/respiratory-protection-training.ppt',
  },
};

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
    items: ['doc_create', 'doc_review', 'edu_material', 'risk_assessment'],
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
    const evidenceHtmlHeader = /<(?:h[1-6]|p|div)[^>]*>\s*(?:<[^>]+>\s*)*(?:2\)|2\.|②)?\s*근거\s*:?\s*(?:<\/[^>]+>\s*)*<\/(?:h[1-6]|p|div)>/i;
  
    // ✅ 2) 텍스트 라인에서 "## 근거" 자체가 남아있는 경우(렌더 전 text를 넣는 경우 대비)
    const evidenceMarkdownHeader = /^\s*#{2,6}\s*근거\s*:?\s*$/m;
  
    // ✅ 3) 기존 번호형 + 무번호형(굵게 포함)도 같이
    const evidenceTextHeader1 = /^\s*(?:2\)|2\.|②)\s*근거\s*:?\s*$/m;
    const evidenceTextHeader2 = /^\s*(?:\*\*+)?\s*근거\s*(?:\*\*+)?\s*:?\s*$/m;
  
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
    if (evidenceIdx >= 0 && accidentIdx >= 0) cutIdx = Math.min(evidenceIdx, accidentIdx);
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

    const fetchWeeklySafetyNews = async () => {
    // ✅ 로딩 버블 먼저 띄우기
    beginMenuLoading('금주의 안전 뉴스');

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
        endMenuLoadingError(
          '금주의 안전 뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        );
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

      // ✅ 로딩 버블(마지막 assistant)을 최종 HTML로 교체
      endMenuLoadingSuccess(html);
    } catch (e) {
      console.error('[ChatArea] safety-news fetch error:', e);
      endMenuLoadingError('금주의 안전 뉴스를 불러오는 중 오류가 발생했습니다.');
    }
  };

    const fetchLawNoticeSummary = async () => {
    // ✅ 로딩 버블 먼저 띄우기
    beginMenuLoading('입법 예고 요약');

    try {
      const res = await fetch('/api/expect-law/latest', { cache: 'no-store' });

      if (!res.ok) {
        console.error('[ChatArea] law-notice-summary error status:', res.status);
        endMenuLoadingError(
          '입법 예고 요약을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        );
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

      // ✅ 로딩 버블(마지막 assistant)을 최종 HTML로 교체
      endMenuLoadingSuccess(html);
    } catch (e) {
      console.error('[ChatArea] expect-law-summary fetch error:', e);
      endMenuLoadingError('입법 예고 요약을 불러오는 중 오류가 발생했습니다.');
    }
  };
  
  const [noticeToast, setNoticeToast] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNoticeToast(msg);
    window.setTimeout(() => setNoticeToast(null), 2500);
  };

  const handleQuickActionClick = (action: QuickAction) => {
    if (menuLoading) return;
    // ✅ 문서 모드 초기화
    setDocMode(null);
    setReviewDoc(null);

    if (action.taskType) {
      setSelectedTask(action.taskType);
    }

    // ✅ 위험성평가 기능 준비중 알림
    if (action.id === 'risk_assessment') {
      setShowRiskWizard(true);
      return;
    }

    if (action.id === 'today_accident') {
      setActiveHintTask(null);
      setActiveHints([]);
      fetchWeeklySafetyNews();
      return;
    }

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
      setActiveHints(pickRandomHints(ACCIDENT_HINTS, 3));

      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();

      return;
    }

    if (action.id === 'doc_review') {
      setActiveHintTask(null);
      setActiveHints([]);
      setDocMode('review');

      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();

      return;
    }

    if (action.id === 'doc_create') {
      setActiveHintTask(null);
      setActiveHints([]);
      setDocMode('create');

      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();
      return;
    }

    // ✅ 여기 새로 추가: "교육 자료 생성"은 패널 모드로
    if (action.id === 'edu_material') {
      // 혹시 taskType 안 넣어놨으면 강제로라도 세팅
      setSelectedTask('edu_material');

      setActiveHintTask(null);
      setActiveHints([]);

      // docMode는 문서 생성/검토용이니까 굳이 안 써도 되지만 초기화는 유지
      setDocMode(null);

      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();
      return;
    }

    // ✅ 나머지: 법령 / 가이드 해석용 기존 인트로 + 힌트 플로우
    if (
      action.id === 'law_interpret' ||
      action.id === 'guideline_interpret'
    ) {
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

      const intro: ChatMessage = {
        role: 'assistant',
        content: introText,
      };

      if (messages.length === 0) {
        setMessages([intro]);
      } else {
        setMessages([...messages, intro]);
      }

      setActiveHints(pickRandomHints(pool, 3));
      setActiveHintTask(hintTask);

      setInput('');
      const el = document.querySelector<HTMLInputElement>('.chat-input');
      if (el) el.focus();

      return;
    }

    // 기본 동작
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

  // 문서 생성/검토 모드 상태
  const [docMode, setDocMode] = useState<'create' | 'review' | null>(null);

  // 검토 대상 문서 (카테고리 + 문서)
  const [reviewDoc, setReviewDoc] = useState<{
    category: SafetyDocCategory;
    doc: SafetyDoc;
  } | null>(null);

  const isSafetyDocTask = docMode === 'create' || docMode === 'review';
  const isEduTask = selectedTask === 'edu_material';
  const isRiskTask = selectedTask === 'risk_assessment';

  // 실제로 파일을 상태에 추가하는 공통 함수
  const addAttachments = (files: File[]) => {
    if (!files || files.length === 0) return;
    setAttachments(prev => [...prev, ...files]);
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

    // 단계별 status_message를 한 버블 안에서 누적해서 보여주고 싶으면 사용
    const progressLines: string[] = [];

    while (true) {
      const res = await fetch(
        `/api/check-task?jobId=${encodeURIComponent(jobId)}`,
        { cache: 'no-store' },
      );

      if (!res.ok) {
        updateLastAssistant(
          '문서 검토 결과를 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        );
        break;
      }

      const data = await res.json();
      const status: string | undefined = data.status;
      const statusMessage: string | undefined = data.status_message;
      const answer: string =
        data.gpt_response || data.full_report || '';

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
          // 여러 단계가 있으면 줄바꿈으로 누적해서 보여주기
          updateLastAssistant(progressLines.join('\n'));
        }

        if (Date.now() - startedAt > timeoutMs) {
          updateLastAssistant(
            '문서 검토가 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.',
          );
          break;
        }

        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }

      // ✅ 완료: 여기서만 "새 assistant 메시지(최종 답변)" 추가
      if (status === 'done') {
        const finalText =
          answer ||
          '문서 검토 결과를 불러왔지만, 내용이 비어 있습니다.';

        const html = simpleMarkdownToHtml(finalText);

        addMessage({
          role: 'assistant',
          content: html,
        });
        break;
      }

      // ❌ 에러
      if (status === 'error') {
        updateLastAssistant(
          data.error ||
            data.error_message ||
            '문서 검토 중 오류가 발생했습니다. 담당자에게 문의해 주세요.',
        );
        break;
      }

      // 알 수 없는 상태
      updateLastAssistant(
        `문서 검토 작업 상태를 알 수 없습니다. (status=${String(status)})`,
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

  const updateLastAssistant = useChatStore((s) => s.updateLastAssistant);

  const [selectedEduMaterialId, setSelectedEduMaterialId] = useState<string | null>(null);

  type EduSelectParams = {
    category: SafetyEduCategory;
    material: SafetyEduMaterial;
    guide: SafetyEduGuide;
  };

  const buildEduGuideHtml = ({ category, material, guide }: EduSelectParams) => { 
    const bullets = guide.bulletPoints
      .map((b) => b.replace(/^·\s?/, ''))
      .map((b) => `<li>${b}</li>`)
      .join('');

    return `
      <div data-ai-kind="edu-material">
        <div style="font-weight:700; margin-bottom:6px;">
          ${material.title}
          <span style="color:#9ca3af; font-weight:600; margin-left:6px;">
            ${category.title}
          </span>
        </div>

        <div style="margin-bottom:10px;">${guide.intro}</div>

        <ul style="margin:0 0 12px 18px;">
          ${bullets}
        </ul>

        <a href="${guide.downloadUrl}" target="_blank" rel="noopener noreferrer"
          style="display:inline-block; padding:10px 12px; border:1px solid #334155; border-radius:12px; text-decoration:none;">
          ⬇️ ${guide.downloadLabel}
        </a>
      </div>
    `;
  };


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

    // ✅ 1) 유저 메시지 추가 (이게 “유저가 선택했다”처럼 보이게 함)
    // addMessage({
    //   role: 'user',
    //   content: `[교육자료 찾기] ${material.title}`,
    // });

    // // ✅ 2) assistant 메시지 추가 (이게 “시스템이 답변”처럼 보이게 함)
    // addMessage({
    //   role: 'assistant',
    //   content: buildEduGuideHtml({ category, material, guide }),
    // });
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

  /**
   * ✅ 서버에서 데이터가 와야 하는 "메뉴 액션" 공용 로딩 시작
   * - assistant 말풍선 1개를 먼저 추가
   * - 응답 오면 updateLastAssistant로 그 말풍선을 교체
   */
  const beginMenuLoading = (label: string) => {
    setMenuLoading(true);
    setShowLanding(false);

    // 로딩 버블 하나 생성
    addMessage({
      role: 'assistant',
      content: `⏳ ${label} 을 가져오고 있어요...`,
    });
  };

  const endMenuLoadingSuccess = (finalHtml: string) => {
    updateLastAssistant(finalHtml);
    setMenuLoading(false);
  };

  const endMenuLoadingError = (msg: string) => {
    // 안전하게 HTML로 감싸기 (assistant bubble은 HTML로 렌더됨)
    updateLastAssistant(`<p>${msg}</p>`);
    setMenuLoading(false);
  };
  
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
              <>
              {isRiskTask ? (
                <div className={s.docWrap}>
                  <RiskAssessmentWizard
                    onClose={() => {
                      setSelectedTask(null);
                    }}
                    onSubmit={async (draft) => {
                      try {
                        if (!user?.email) {
                          alert("로그인해주세요")
                          return
                        }
                        // ✅ FastAPI로 엑셀 생성 요청 (Next 프록시 통해서)
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

                        // ✅ 파일 다운로드
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);

                        const a = document.createElement('a');
                        a.href = url;

                        // Content-Disposition에서 파일명 뽑기(없으면 fallback)
                        const cd = res.headers.get('content-disposition');
                        const filename =
                          getFilenameFromDisposition(cd) ||
                          `위험성평가_${draft.meta.dateISO || 'today'}.xlsx`;

                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();

                        window.URL.revokeObjectURL(url);

                        // ✅ UI 종료
                        setSelectedTask(null);
                      } catch (e: any) {
                        console.error(e);
                        alert(e?.message || '엑셀 다운로드에 실패했습니다.');
                      }
                    }}
                  />
                </div>
              ) :
                isEduTask ? (
                  <MakeSafetyEduMaterials
                    onSelectMaterial={handleSelectSafetyEduMaterial}
                    selectedMaterialId={selectedEduMaterialId}
                  />
                
                ): isSafetyDocTask ? (
                  <MakeSafetyDocs
                    mode={docMode === 'review' ? 'review' : 'create'}
                    onSelectDoc={(category, doc) => {
                      if (docMode === 'create') {
                        // ✅ 생성 모드: 선택 → 바로 프롬프트 안내
                        handleSelectSafetyDoc(category, doc);
                      } else if (docMode === 'review') {
                        // ✅ 검토 모드: 어떤 문서인지 상태만 저장
                        setReviewDoc({ category, doc });
                      }
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
                ) : (
                  // 그 외 작업들은 기존 "무엇을 도와드릴까요?" 퀵 액션 노출
                  <div className={s.quickWrap}>
                    <div className={s.quickTitle}>무엇을 도와드릴까요?</div>

                    {QUICK_ACTION_GROUPS.map((group) => {
                      const GroupIcon = group.icon;
                      return (
                        <div key={group.id} className={s.quickSection}>
                          <div className={s.quickSectionHeader}>
                            <GroupIcon className={s.quickSectionIcon} />
                            <span className={s.quickSectionTitle}>{group.title}</span>
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

                </>
              )}

              {messages.map((m, i) => {
                const isUser = m.role === 'user';

                let isSafetyNews = false;
                let isNoticeSummary = false;
                let isAccidentCases = false;
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
                
                const plain = m.role === 'assistant' ? htmlToText(m.content || '') : '';

                const isSafetyDocDownload =
                  m.role === 'assistant' &&
                  /양식\s*\((DOCX|XLSX)\)\s*다운로드/.test(plain);

                const isEduMaterial =
                  m.role === 'assistant' && m.content.includes('data-ai-kind="edu-material"');

                const hideActionRow = isIntro || isSafetyDocDownload || isEduMaterial;

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

                    {!hideActionRow && (
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

              {menuLoading && (
                <div className={s.loadingCard}>
                  <span>로딩중입니다...</span>
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
            onDrop={handleDropFiles}
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
      {noticeToast && <div className={s.toast}>{noticeToast}</div>}
    </>
  );
}

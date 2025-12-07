'use client';

import { useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import s from './ChatArea.module.css'; // docWrap, docCategoryCard 등 여기다 정의해 둔 CSS 사용

// ======================
// 타입 정의
// ======================
export type SafetyDoc = {
  id: string;
  label: string;
};

export type SafetyDocCategory = {
  id: string;
  title: string;
  description: string;
  docs: SafetyDoc[];
};

// ======================
// 카테고리 / 문서 데이터
// (docs 배열은 나중에 계속 추가하면 됨)
// ======================
export const SAFETY_DOC_CATEGORIES: SafetyDocCategory[] = [
    {
      id: 'edu-plan',
      title: '교육·안전관리 계획/평가 관련',
      description:
        '안전보건 추진 계획서, 안전보건교육 결과보고서 등 교육 및 관리에 대한 서류를 작성할 수 있어요',
      docs: [
        { id: 'goal-plan', label: '안전보건 목표 추진계획(안)' },
        { id: 'edu-plan-result', label: '교육훈련 계획대비 실적 결과표' },
        { id: 'disaster-drill-report', label: '비상재난 대응훈련 결과보고서' },
        { id: 'safety-cost-plan', label: '안전보건비용계획서' },
        { id: 'law-compliance-eval', label: '법규준수평가' },
        { id: 'safety-system-eval', label: '안전보건관리체계 평가표' },
        { id: 'safety-edu-result-report', label: '안전보건교육 결과보고서' },
        { id: 'emergency-drill-report', label: '비상사태 대응훈련 결과보고서' },
      ],
    },
    {
      id: 'meeting',
      title: '회의·협의체 관련',
      description:
        '근로자 참여 회의록, 건의사항 청취표 등 협의체와 관련된 서류를 작성할 수 있어요',
      docs: [
        { id: 'worker-participation-minutes', label: '근로자 참여협의록' },
        { id: 'safety-council-minutes', label: '안전보건 협의체 회의록' },
        { id: 'safety-fair-meeting-minutes', label: '안전공정회의 회의록' },
        { id: 'suggestion-hearing-form', label: '건의사항 청취표' },
      ],
    },
    {
      id: 'daily-check',
      title: '일상점검·작업관리',
      description:
        'TBM 활동일지, 보호구 지급대장, 작업 계획표 등의 서류를 작성할 수 있어요',
      docs: [
        { id: 'tbm-log', label: 'TBM활동일지' },
        { id: 'heat-illness-control-sheet', label: '온열질환관리표' },
        { id: 'ppe-issue-ledger', label: '보호구 지급 대장' },
        { id: 'work-plan', label: '작업계획서' },
        { id: 'work-permit', label: '작업허가서' },
        { id: 'daily-safety-council-minutes', label: '안전보건 협의체 회의록' },
        {
          id: 'msds-list',
          label: '물질안전보건자료목록표(MSDS)',
        },
        { id: 'work-stop-request-log', label: '작업중지요청 기록대장' },
        { id: 'work-stop-request-form', label: '작업중지 요청서' },
      ],
    },
    {
      id: 'accident',
      title: '재해·사고 관리',
      description:
        '사고 발생 시 처리해야 하는 재해 보고서, 아차사고 조사 보고서 등을 작성할 수 있어요',
      docs: [
        {
          id: 'industrial-accident-investigation',
          label: '산업재해조사표',
        },
        { id: 'accident-report', label: '재해보고서' },
        {
          id: 'near-miss-investigation-report',
          label: '아차사고 조사 보고서',
        },
      ],
    },
    {
      id: 'legal',
      title: '법정 선임·자격·평가',
      description:
        '안전보건 관계자 평가자료, 관리 감독자 평가표 등 법정 서류를 작성할 수 있어요',
      docs: [
        { id: 'safety-person-eval', label: '안전보건관계자 평가표' },
        { id: 'supervisor-eval', label: '관리 감독자 평가표' },
        {
          id: 'safety-qualification-register',
          label: '안전보건 자격등록 목록부',
        },
        {
          id: 'safety-person-appointment-report',
          label: '안전보건관계자 선임 등 보고서',
        },
        {
          id: 'safety-person-appointment-doc',
          label: '안전보건관계자 선임 및 지정서',
        },
      ],
    },
  ];
  

// ======================
// 컴포넌트 Props
// ======================
export type MakeSafetyDocsProps = {
  onSelectDoc?: (category: SafetyDocCategory, doc: SafetyDoc) => void;
};

// ======================
// 메인 컴포넌트
// ======================
export default function MakeSafetyDocs({ onSelectDoc }: MakeSafetyDocsProps) {
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(
    SAFETY_DOC_CATEGORIES[0]?.id ?? null,
  );

  return (
    <div className={s.docWrap}>
      <h2 className={s.docTitle}>
        REG AI가 업무에 필요할 안전 문서를 생성해드릴게요.
      </h2>
      <p className={s.docSubtitle}>어떤 문서를 생성해드릴까요?</p>

      <div className={s.docCategoryList}>
        {SAFETY_DOC_CATEGORIES.map((cat) => {
          const isOpen = cat.id === openCategoryId;

          return (
            <div
              key={cat.id}
              className={`${s.docCategoryCard} ${
                isOpen ? s.docCategoryCardOpen : ''
              }`}
            >
              {/* 상단 카테고리 영역 */}
              <button
                type="button"
                className={s.docCategoryHeader}
                onClick={() => setOpenCategoryId(isOpen ? null : cat.id)}
              >
                <div className={s.docCategoryText}>
                  <span className={s.docCategoryTitle}>{cat.title}</span>
                  <span className={s.docCategoryDesc}>
                    {cat.description}
                  </span>
                </div>
                <ChevronDown
                  className={`${s.docCategoryArrow} ${
                    isOpen ? s.docCategoryArrowOpen : ''
                  }`}
                />
              </button>

              {/* 펼쳐졌을 때 내부 문서 목록 */}
              {isOpen && (
                <div className={s.docList}>
                  {cat.docs.length > 0 ? (
                    cat.docs.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        className={s.docChip}
                        onClick={() => onSelectDoc?.(cat, doc)}
                      >
                        <FileText className={s.docChipIcon} />
                        <span className={s.docChipLabel}>{doc.label}</span>
                      </button>
                    ))
                  ) : (
                    <div className={s.docEmpty}>
                      아직 등록된 문서가 없습니다. 필요한 문서를
                      추가해 주세요.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

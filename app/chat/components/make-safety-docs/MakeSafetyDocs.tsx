'use client';

import { useMemo, useState, ReactNode } from 'react';
import { FileText, ClipboardList } from 'lucide-react';
import s from './MakeSafetyDocs.module.css';

// ✅ TBM
import TbmCreateModal, { TbmCreatePayload } from './tbm/TbmCreateModal';

// ✅ 월 작업장 순회 점검표
import MonthlyInspectionCreateModal, {
  MonthlyInspectionPayload,
} from './monthly-inspection/MonthlyInspectionCreateModal';

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

export type MakeSafetyDocsProps = {
  mode: 'create' | 'review';

  onSelectDoc?: (category: SafetyDocCategory, doc: SafetyDoc) => void;
  selectedDocId?: string | null;

  renderSelectedDocPane?: (
    category: SafetyDocCategory,
    doc: SafetyDoc,
  ) => ReactNode;

  onCreateTbm?: (
    payload: TbmCreatePayload & { categoryId: string; docId: string },
  ) => void;

  onCreateMonthlyInspection?: (
    payload: MonthlyInspectionPayload & { categoryId: string; docId: string },
  ) => void;
};

export default function MakeSafetyDocs({
  mode,
  onSelectDoc,
  selectedDocId,
  renderSelectedDocPane,
  onCreateTbm,
  onCreateMonthlyInspection,
}: MakeSafetyDocsProps) {
  // ✅ 지금은 2개 문서만 노출
  const category = useMemo<SafetyDocCategory>(
    () => ({
      id: 'daily-check',
      title: '일상점검·작업관리',
      description: '아래 문서 중 무엇을 생성할까요?',
      docs: [
        { id: 'tbm-log', label: 'TBM 활동일지' },
        { id: 'monthly-inspection', label: '월 작업장 순회 점검표' },
      ],
    }),
    [],
  );

  const tbmDoc = category.docs[0];
  const monthlyDoc = category.docs[1];

  // ✅ TBM 모달
  const [tbmModalOpen, setTbmModalOpen] = useState(false);
  const [tbmTarget, setTbmTarget] = useState<{
    category: SafetyDocCategory;
    doc: SafetyDoc;
  } | null>(null);

  // ✅ 월 점검표 모달
  const [monthlyModalOpen, setMonthlyModalOpen] = useState(false);
  const [monthlyTarget, setMonthlyTarget] = useState<{
    category: SafetyDocCategory;
    doc: SafetyDoc;
  } | null>(null);

  const titleText =
    mode === 'review'
      ? 'REG AI가 업로드된 안전 문서를 법령 기준으로 검토해드릴게요.'
      : 'REG AI가 업무에 필요할 안전 문서를 생성해드릴게요.';

  const subtitleText =
    mode === 'review'
      ? '어떤 문서를 업로드해서 검토받으시겠어요?'
      : category.description;

  const openTbm = () => {
    setTbmTarget({ category, doc: tbmDoc });
    setTbmModalOpen(true);
  };

  const openMonthly = () => {
    setMonthlyTarget({ category, doc: monthlyDoc });
    setMonthlyModalOpen(true);
  };

  const handleSelect = (doc: SafetyDoc) => {
    if (mode === 'create') {
      if (doc.id === 'tbm-log') return openTbm();
      if (doc.id === 'monthly-inspection') return openMonthly();
      return;
    }
    onSelectDoc?.(category, doc);
  };

  const selectedDoc =
    selectedDocId === tbmDoc.id
      ? tbmDoc
      : selectedDocId === monthlyDoc.id
        ? monthlyDoc
        : null;

  return (
    <section className={s.docWrap}>
      <header className={s.header}>
        <h2 className={s.docTitle}>{titleText}</h2>
        <p className={s.docSubtitle}>{subtitleText}</p>
      </header>

      <div className={s.panelGrid}>
        <button
          type="button"
          className={`${s.panel} ${selectedDocId === tbmDoc.id ? s.panelActive : ''}`}
          onClick={() => handleSelect(tbmDoc)}
        >
          <span className={s.panelIconWrap} aria-hidden="true">
            <FileText className={s.panelIcon} />
          </span>

          <span className={s.panelText}>
            <span className={s.panelTitle}>{tbmDoc.label}</span>
            <span className={s.panelDesc}>
              작업 전 위험요인/대책 정리 + 참석자 입력까지 한 번에 생성합니다.
            </span>
          </span>

          <span className={s.panelCta}>{mode === 'create' ? '생성하기' : '선택'}</span>
        </button>

        <button
          type="button"
          className={`${s.panel} ${selectedDocId === monthlyDoc.id ? s.panelActive : ''}`}
          onClick={() => handleSelect(monthlyDoc)}
        >
          <span className={s.panelIconWrap} aria-hidden="true">
            <ClipboardList className={s.panelIcon} />
          </span>

          <span className={s.panelText}>
            <span className={s.panelTitle}>{monthlyDoc.label}</span>
            <span className={s.panelDesc}>
              월간 순회 점검 체크리스트 구성 및 점검 기록 생성을 빠르게 진행합니다.
            </span>
          </span>

          <span className={s.panelCta}>{mode === 'create' ? '생성하기' : '선택'}</span>
        </button>
      </div>

      {/* ✅ review 모드: 선택된 문서 Pane */}
      {mode === 'review' && selectedDoc && renderSelectedDocPane && (
        <div className={s.selectedPane}>{renderSelectedDocPane(category, selectedDoc)}</div>
      )}

      {/* ✅ TBM 생성 모달 */}
      <TbmCreateModal
        open={tbmModalOpen}
        onClose={() => setTbmModalOpen(false)}
        onSubmit={(payload) => {
          if (tbmTarget) {
            onCreateTbm?.({
              ...payload,
              categoryId: tbmTarget.category.id,
              docId: tbmTarget.doc.id,
            });
          }
          setTbmModalOpen(false);
        }}
      />

      {/* ✅ 월 점검표 생성 모달 */}
      <MonthlyInspectionCreateModal
        open={monthlyModalOpen}
        onClose={() => setMonthlyModalOpen(false)}
        onSubmit={(payload) => {
          if (monthlyTarget) {
            onCreateMonthlyInspection?.({
              ...payload,
              categoryId: monthlyTarget.category.id,
              docId: monthlyTarget.doc.id,
            });
          }
          setMonthlyModalOpen(false);
        }}
      />
    </section>
  );
}

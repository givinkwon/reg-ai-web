'use client';

import { useMemo, useState, ReactNode } from 'react';
import { FileText, ClipboardList } from 'lucide-react';
import s from './MakeSafetyDocs.module.css';

// ✅ TBM
import TbmCreateModal, { TbmCreatePayload } from './tbm/TbmCreateModal';

// ✅ 월 작업장 순회 점검표 (모달)
import MonthlyInspectionCreateModal, {
  MonthlyInspectionPayload,
} from './monthly-inspection/MonthlyInspectionCreateModal';

// ======================
// 타입 정의 (기존 유지)
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
// Props (기존 유지)
// ======================
export type MakeSafetyDocsProps = {
  mode: 'create' | 'review';

  onSelectDoc?: (category: SafetyDocCategory, doc: SafetyDoc) => void;

  selectedDocId?: string | null;

  renderSelectedDocPane?: (
    category: SafetyDocCategory,
    doc: SafetyDoc,
  ) => ReactNode;

  // ✅ TBM 전용
  onCreateTbm?: (
    payload: TbmCreatePayload & { categoryId: string; docId: string },
  ) => void;

  // ✅ 월 점검표 전용
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
  // ✅ “임시로 2개만 노출”을 위한 단일 카테고리(기존 daily-check 의미 유지)
  const category = useMemo<SafetyDocCategory>(() => {
    return {
      id: 'daily-check',
      title: '일상점검·작업관리',
      description: '업무에 필요한 안전 문서를 생성/검토할 수 있어요',
      docs: [
        { id: 'tbm-log', label: 'TBM 활동일지' },
        { id: 'monthly-inspection', label: '월 작업장 순회 점검표' },
      ],
    };
  }, []);

  const tbmDoc = category.docs[0];
  const monthlyDoc = category.docs[1];

  // ✅ TBM 모달 상태
  const [tbmModalOpen, setTbmModalOpen] = useState(false);
  const [tbmTarget, setTbmTarget] = useState<{
    category: SafetyDocCategory;
    doc: SafetyDoc;
  } | null>(null);

  // ✅ 월 점검표 모달 상태
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
      : '아래 문서 중 무엇을 생성할까요? (현재 2종만 제공)';

  const openTbm = () => {
    setTbmTarget({ category, doc: tbmDoc });
    setTbmModalOpen(true);
  };

  const openMonthlyInspection = () => {
    setMonthlyTarget({ category, doc: monthlyDoc });
    setMonthlyModalOpen(true);
  };

  const handleSelect = (doc: SafetyDoc) => {
    // create 모드: 해당 문서 모달 오픈
    if (mode === 'create') {
      if (doc.id === 'tbm-log') {
        openTbm();
        return;
      }
      if (doc.id === 'monthly-inspection') {
        openMonthlyInspection();
        return;
      }
      return;
    }

    // review 모드: 선택 콜백
    onSelectDoc?.(category, doc);
  };

  const selectedDoc =
    selectedDocId === tbmDoc.id
      ? tbmDoc
      : selectedDocId === monthlyDoc.id
        ? monthlyDoc
        : null;

  return (
    <div className={s.docWrap}>
      <div className={s.header}>
        <h2 className={s.docTitle}>{titleText}</h2>
        <p className={s.docSubtitle}>{subtitleText}</p>
      </div>

      {/* ✅ 큰 패널 2개 */}
      <div className={s.panelGrid}>
        <button
          type="button"
          className={`${s.panel} ${selectedDocId === tbmDoc.id ? s.panelActive : ''}`}
          onClick={() => handleSelect(tbmDoc)}
        >
          <div className={s.panelLeft}>
            <div className={s.panelIconWrap}>
              <FileText className={s.panelIcon} />
            </div>

            <div className={s.panelText}>
              <div className={s.panelTitle}>{tbmDoc.label}</div>
              <div className={s.panelDesc}>
                작업 전 위험요인/대책을 정리하고 참여자 서명까지 한 번에 생성합니다.
              </div>
            </div>
          </div>

          <div className={s.panelRight}>
            <span className={s.panelCta}>
              {mode === 'create' ? '생성하기' : '선택'}
            </span>
          </div>
        </button>

        <button
          type="button"
          className={`${s.panel} ${
            selectedDocId === monthlyDoc.id ? s.panelActive : ''
          }`}
          onClick={() => handleSelect(monthlyDoc)}
        >
          <div className={s.panelLeft}>
            <div className={s.panelIconWrap}>
              <ClipboardList className={s.panelIcon} />
            </div>

            <div className={s.panelText}>
              <div className={s.panelTitle}>{monthlyDoc.label}</div>
              <div className={s.panelDesc}>
                월간 순회 점검 체크리스트를 구성하고 현장 점검 기록을 빠르게 생성합니다.
              </div>
            </div>
          </div>

          <div className={s.panelRight}>
            <span className={s.panelCta}>
              {mode === 'create' ? '생성하기' : '선택'}
            </span>
          </div>
        </button>
      </div>

      {/* ✅ review 모드에서 선택된 문서 Pane 렌더 (원하면 유지) */}
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

      {/* ✅ 월 작업장 순회 점검표 생성 모달 */}
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
    </div>
  );
}

'use client';

import { useState, useCallback } from 'react';
import { AlertTriangle, Plus, FileText } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from '../components/ToolLayout.module.css';

// ✅ 컴포넌트 임포트
import RiskAssessmentWizard, { RiskAssessmentDraft } from './components/RiskAssessmentWizard';
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

// ✅ Store
import { useUserStore } from '../../store/user';
import { useChatStore } from '../../store/chat';

// ✅ 파일명 추출 헬퍼 (Content-Disposition 헤더 파싱)
function getFilenameFromDisposition(disposition: string | null) {
  if (!disposition) return null;
  const utf8 = disposition.match(/filename\*=UTF-8''(.+)$/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1];
  return null;
}

export default function RiskPage() {
  const [isWriting, setIsWriting] = useState(false);

  // Store 상태
  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const refreshSignupStatus = useUserStore((st) => st.refreshSignupStatus);
  const setUser = useUserStore((st) => st.setUser);
  const { showLoginModal, setShowLoginModal } = useChatStore();

  // 회원가입 모달 상태
  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // 1. 보고서 생성 요청 (수정된 버전)
  const handleSubmit = useCallback(async (draft: RiskAssessmentDraft, opts?: { signal?: AbortSignal; userEmail?: string }) => {
    
    // ✅ 백엔드로 보낼 페이로드 구성 (buildExcelPayload 로직 내장)
    // 필요한 데이터 구조에 맞춰서 draft와 이메일을 합칩니다.
    const payload = {
      ...draft,
      user_email: opts?.userEmail, // 백엔드에서 요구하는 필드명 확인 필요
      project_name: draft.meta.siteName || '무제 프로젝트',
    };

    // ✅ [수정] 프록시 API 호출 (?endpoint=export-excel)
    // 원래 로직과 동일하게 맞췄습니다.
    const response = await fetch('/api/risk-assessment?endpoint=export-excel', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // 'x-user-email': opts?.userEmail || '' // route.ts에서 자동으로 처리됨
      },
      body: JSON.stringify(payload),
      signal: opts?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      // JSON 에러 메시지 파싱 시도
      try {
        const json = JSON.parse(errorText);
        throw new Error(json.message || json.error || '엑셀 생성 실패');
      } catch {
        throw new Error(errorText || '엑셀 생성 실패');
      }
    }

    // ✅ 파일 다운로드 처리 (Blob)
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // 파일명 추출
    const cd = response.headers.get('content-disposition');
    const filename = getFilenameFromDisposition(cd) || `위험성평가_${draft.meta.dateISO || 'report'}.xlsx`;

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

  }, []);

  const showExtraModal = forceExtraOpen && !!accountEmail;

  return (
    <div className={s.container}>
      {/* 랜딩 페이지 */}
      {!isWriting && (
        <>
          <section className={s.actionSection}>
            <div className={s.actionBox}>
              <div className={s.iconWrapper}>
                <AlertTriangle size={40} color="white" strokeWidth={1.5} />
              </div>
              <h1 className={s.title}>위험성평가 (Risk Assessment)</h1>
              <p className={s.desc}>
                작업 공정의 유해·위험요인을 파악하고 감소대책을 수립하세요.<br />
                복잡한 계산 없이 간편하게 등급을 산정하고 보고서를 생성할 수 있습니다.
              </p>
              <div className={s.btnGroup}>
                <Button className={s.whiteBtn} onClick={() => setIsWriting(true)}>
                  <Plus size={20} className="mr-2" />
                  새 평가 작성하기
                </Button>
                <Button className={s.glassBtn}>
                  <FileText size={20} className="mr-2" />
                  지난 기록 보기
                </Button>
              </div>
            </div>
          </section>

          <section className={s.infoSection}>
            <h2 className={s.sectionTitle}>3단계로 끝내는 위험성평가</h2>
            <div className={s.grid}>
              <div className={s.card}>
                <div className={s.stepBadge}>1</div>
                <h3 className={s.cardTitle}>작업 및 공정 선택</h3>
                <p className={s.cardDesc}>
                  평가할 작업을 선택하면 관련된 세부 공정 데이터를 자동으로 불러옵니다.
                </p>
              </div>
              <div className={s.card}>
                <div className={s.stepBadge}>2</div>
                <h3 className={s.cardTitle}>위험요인 파악</h3>
                <p className={s.cardDesc}>
                  각 공정에서 발생할 수 있는 위험요인을 식별하고 추가합니다.
                </p>
              </div>
              <div className={s.card}>
                <div className={s.stepBadge}>3</div>
                <h3 className={s.cardTitle}>위험성 판단 및 대책</h3>
                <p className={s.cardDesc}>
                  위험성을 상/중/하로 판단하고 감소 대책을 수립하여 보고서를 완성합니다.
                </p>
              </div>
            </div>
          </section>

          <section className={s.faqSection}>
            <div className={s.faqContainer}>
              <h3 className={s.sectionTitle}>자주 묻는 질문</h3>
              <div className={s.faqItem}>
                <div className={s.faqQ}>법적으로 반드시 해야 하나요?</div>
                <div className={s.faqA}>
                  네, 산업안전보건법에 따라 사업주는 정기적으로 위험성평가를 실시하고 기록을 보존해야 합니다.
                </div>
              </div>
              <div className={s.faqItem}>
                <div className={s.faqQ}>작성된 문서는 어떻게 받나요?</div>
                <div className={s.faqA}>
                  생성된 보고서는 엑셀(Excel) 파일로 즉시 다운로드됩니다.
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ✅ Wizard 컴포넌트 */}
      <RiskAssessmentWizard
        open={isWriting}
        onClose={() => setIsWriting(false)}
        onSubmit={handleSubmit}
        onRequireLogin={() => setShowLoginModal(true)}
      />

      {/* ✅ 로그인 모달 */}
      {showLoginModal && !showExtraModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}

      {/* ✅ 회원가입 추가정보 모달 */}
      {showExtraModal && accountEmail && (
        <SignupExtraInfoModal
          email={accountEmail}
          onComplete={() => {
            const cur = useUserStore.getState().user;
            if (cur) setUser({ ...cur, isSignupComplete: true });
            setForceExtraOpen(false);
            setAccountEmail(null);
          }}
        />
      )}
    </div>
  );
}
'use client';

import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, Plus, Search, FileText, CheckCircle, Download } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

import RiskAssessmentWizard, { RiskAssessmentDraft } from './components/RiskAssessmentWizard';
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

import { useUserStore } from '../../store/user';
import { useChatStore } from '../../store/chat';

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
  
  // ✅ Store 상태
  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const refreshSignupStatus = useUserStore((st) => st.refreshSignupStatus);
  const setUser = useUserStore((st) => st.setUser);

  const { showLoginModal, setShowLoginModal } = useChatStore();

  // ✅ 회원가입 추가정보 모달 상태 (TBM 페이지와 동일하게 추가)
  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // 1. 유저 상태 확인 및 추가정보 입력 유도 (TBM 참고)
  useEffect(() => {
    if (!initialized) return;

    if (!user?.email) {
      setForceExtraOpen(false);
      setAccountEmail(null);
      return;
    }

    if (user.isSignupComplete === false) {
      setAccountEmail(user.email);
      setForceExtraOpen(true);
      return;
    }

    if (user.isSignupComplete === true) {
      setForceExtraOpen(false);
      setAccountEmail(null);
      return;
    }

    (async () => {
      await refreshSignupStatus();
      const latest = useUserStore.getState().user;
      if (latest?.email && latest.isSignupComplete === false) {
        setAccountEmail(latest.email);
        setForceExtraOpen(true);
      } else {
        setForceExtraOpen(false);
        setAccountEmail(null);
      }
    })();
  }, [initialized, user?.email, user?.isSignupComplete, refreshSignupStatus]);


  // ✅ [유지] 서버 스펙에 맞춘 데이터 변환 및 제출 로직
  const handleSubmit = useCallback(async (draft: RiskAssessmentDraft, opts?: { signal?: AbortSignal; userEmail?: string }) => {
    
    if (!opts?.userEmail) throw new Error('이메일 정보가 누락되었습니다.');

    // 🚀 서버의 RiskExcelItem 리스트 구조로 평탄화(Flatten)
    const flattenedItems = draft.tasks.flatMap(task => 
      (task.processes || []).flatMap(process => 
        (process.hazards || []).map(hazard => ({
          process_name: String(task.title || '').trim(),
          sub_process: String(process.title || '').trim(),
          risk_situation_result: String(hazard.title || '').trim(),
          judgement: hazard.judgement || '중',
          current_control_text: (hazard.current_control_text || '').trim(),
          mitigation_text: (hazard.mitigation_text || '').trim()
        }))
      )
    );

    // 🚀 서버가 정의한 ExportRiskExcelRequest 형식 구성
    const payload = {
      email: opts.userEmail,
      dateISO: draft.meta.dateISO,
      items: flattenedItems 
    };

    const response = await fetch('/api/risk-assessment?endpoint=export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: opts?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      try {
        const json = JSON.parse(errorText);
        throw new Error(json.detail?.[0]?.msg || json.message || '엑셀 생성 실패');
      } catch {
        throw new Error('서버 데이터 처리 중 오류가 발생했습니다.');
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const cd = response.headers.get('content-disposition');
    const filename = getFilenameFromDisposition(cd) || `위험성평가_${draft.meta.dateISO}.xlsx`;

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, []);

  return (
    <div className={s.container}>
      {/* 작성 모드가 아닐 때만 랜딩 페이지(안내문구) 표시 */}
      {!isWriting && (
        <>
          {/* 1. 상단 액션 섹션 */}
          <section className={s.actionSection}>
            <div className={s.actionBox}>
              <div className={s.iconWrapper}>
                <AlertTriangle size={40} color="white" strokeWidth={1.5} />
              </div>
              <h1 className={s.title}>위험성평가 (Risk Assessment)</h1>
              <p className={s.desc}>
                산업안전보건법에 따라 유해·위험요인을 파악하고 감소대책을 수립하세요.<br />
                AI가 공정별 위험요인을 추천하고, 엑셀 보고서를 자동으로 생성해드립니다.
              </p>
              
              <div className={s.btnGroup}>
                <Button className={s.whiteBtn} onClick={() => setIsWriting(true)}>
                  <Plus size={20} className="mr-2" />
                  새 평가 작성하기
                </Button>
                {/* <Button className={s.glassBtn}>
                  <History size={20} className="mr-2" />
                  지난 기록 조회
                </Button> */}
              </div>
            </div>
          </section>

          {/* 2. 정보 섹션 (절차 소개 - TBM 스타일 적용) */}
          <section className={s.infoSection}>
            <h2 className={s.sectionTitle}>쉽고 빠른 위험성평가 절차</h2>
            <div className={s.grid}>
              <div className={s.card}>
                <div className={s.stepBadge}>1</div>
                <h3 className={s.cardTitle}>공정 및 작업 입력</h3>
                <p className={s.cardDesc}>
                  '용접', '도장' 등 수행하는 작업을 입력하면 관련된 유해·위험요인을 AI가 자동으로 찾아냅니다.
                </p>
                <div style={{ marginTop: 'auto', alignSelf: 'flex-end', opacity: 0.2 }}>
                  <Search size={40} />
                </div>
              </div>
              <div className={s.card}>
                <div className={s.stepBadge}>2</div>
                <h3 className={s.cardTitle}>위험성 추정 및 결정</h3>
                <p className={s.cardDesc}>
                  발견된 위험요인의 빈도와 강도를 선택하여 위험성 수준(상/중/하)을 3단계로 결정합니다.
                </p>
                <div style={{ marginTop: 'auto', alignSelf: 'flex-end', opacity: 0.2 }}>
                  <FileText size={40} />
                </div>
              </div>
              <div className={s.card}>
                <div className={s.stepBadge}>3</div>
                <h3 className={s.cardTitle}>감소대책 및 리포트</h3>
                <p className={s.cardDesc}>
                  위험성을 낮추기 위한 구체적인 개선 대책을 입력하고 엑셀 파일로 즉시 다운로드합니다.
                </p>
                <div style={{ marginTop: 'auto', alignSelf: 'flex-end', opacity: 0.2 }}>
                  <Download size={40} />
                </div>
              </div>
            </div>
          </section>

          {/* 3. FAQ 영역 (TBM 스타일 적용) */}
          <section className={s.faqSection}>
            <div className={s.faqContainer}>
              <h3 className={s.sectionTitle}>자주 묻는 질문</h3>
              <div className={s.faqItem}>
                <div className={s.faqQ}>Q. 위험성평가는 의무인가요?</div>
                <div className={s.faqA}>
                  네, 산업안전보건법 제36조에 따라 모든 사업주는 매년 1회 이상 정기적으로 실시해야 하며, 필요 시 수시 평가를 진행해야 합니다.
                </div>
              </div>
              <div className={s.faqItem}>
                <div className={s.faqQ}>Q. 3단계 판단법이 무엇인가요?</div>
                <div className={s.faqA}>
                  복잡한 빈도/강도 계산 대신 위험성을 '상, 중, 하' 3단계로 직관적으로 구분하여, 현장에서 간편하게 위험 수준을 판단하고 관리하는 기법입니다.
                </div>
              </div>
              <div className={s.faqItem}>
                <div className={s.faqQ}>Q. 결과물은 어떤 형식인가요?</div>
                <div className={s.faqA}>
                  작성하신 내용은 표준 양식의 엑셀 파일(.xlsx)로 변환되어, 출력 및 보관이 용이합니다.
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* 작성 마법사 모달 */}
      <RiskAssessmentWizard
        open={isWriting}
        onClose={() => setIsWriting(false)}
        onSubmit={handleSubmit}
        onRequireLogin={() => setShowLoginModal(true)}
      />

      {/* 로그인 유도 모달 */}
      {showLoginModal && !forceExtraOpen && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
      
      {/* 회원가입 추가정보 입력 (필요 시) */}
      {forceExtraOpen && accountEmail && (
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
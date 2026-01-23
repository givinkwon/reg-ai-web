'use client';

import { useState, useEffect } from 'react';
import { CalendarCheck, Camera, FileCheck, PenTool, Download, ClipboardCheck } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

// ✅ 실제 기능을 수행하는 모달 컴포넌트 임포트
import MonthlyInspectionCreateModal from './components/MonthlyInspectionCreateModal';
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

// ✅ Store 임포트
import { useUserStore } from '@/app/store/user';
import { useChatStore } from '@/app/store/chat';

export default function MonthlyPage() {
  // 작성 모드 상태 (모달 Open 여부)
  const [isWriting, setIsWriting] = useState(false);

  // ✅ User Store 상태
  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const refreshSignupStatus = useUserStore((st) => st.refreshSignupStatus);
  const setUser = useUserStore((st) => st.setUser);

  // ✅ Chat Store (로그인 모달 제어)
  const { showLoginModal, setShowLoginModal } = useChatStore();

  // ✅ 회원가입 추가정보(Signup Extra Info) 모달 상태
  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // 1. 유저 로그인/회원가입 상태 체크 및 추가정보 모달 트리거
  useEffect(() => {
    if (!initialized) return;

    // 비로그인 상태
    if (!user?.email) {
      setForceExtraOpen(false);
      setAccountEmail(null);
      return;
    }

    // 로그인 했으나 추가정보 미입력 상태
    if (user.isSignupComplete === false) {
      setAccountEmail(user.email);
      setForceExtraOpen(true);
      return;
    }

    // 가입 완료 상태
    if (user.isSignupComplete === true) {
      setForceExtraOpen(false);
      setAccountEmail(null);
      return;
    }

    // 상태 동기화 (새로고침 직후 등)
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

  const showExtraModal = forceExtraOpen && !!accountEmail;

  return (
    <div className={s.container}>
      {/* ✅ 작성 중이 아닐 때만 랜딩 페이지 내용을 보여줍니다.
        작성 중일 때는 모달이 화면을 덮습니다.
      */}
      {!isWriting && (
        <>
          {/* 1. 상단 액션 섹션 */}
          <section className={s.actionSection}>
            <div className={s.actionBox}>
              <div className={s.iconWrapper}>
                <CalendarCheck size={40} color="white" strokeWidth={1.5} />
              </div>
              <h1 className={s.title}>월 순회점검표</h1>
              <p className={s.desc}>
                매월 실시하는 노사 합동점검을 체계적으로 기록하세요.<br />
                현장에서 스마트폰으로 사진을 찍어 지적사항을 남기고 즉시 리포트를 생성합니다.
              </p>
              
              <div className={s.btnGroup}>
                <Button className={s.whiteBtn} onClick={() => setIsWriting(true)}>
                  <Camera size={20} className="mr-2" />
                  점검 시작하기
                </Button>
                {/* <Button className={s.glassBtn}>
                  <FileCheck size={20} className="mr-2" />
                  점검 리포트 확인
                </Button> */}
              </div>
            </div>
          </section>

          {/* 2. 정보 섹션 (3단계) */}
          <section className={s.infoSection}>
            <h2 className={s.sectionTitle}>현장 점검, 이렇게 쉬워집니다</h2>
            <div className={s.grid}>
              <div className={s.card}>
                <div className={s.stepBadge}>1</div>
                <h3 className={s.cardTitle}>체크리스트 점검</h3>
                <p className={s.cardDesc}>
                  추락, 화재, 장비 등 표준화된 안전 점검 항목을 모바일로 빠르게 체크(O/X)합니다.
                </p>
              </div>
              <div className={s.card}>
                <div className={s.stepBadge}>2</div>
                <h3 className={s.cardTitle}>부적합 사항 촬영</h3>
                <p className={s.cardDesc}>
                  지적 사항이 있는 곳은 카메라 아이콘을 눌러 사진을 찍고 개선 요구사항을 바로 입력합니다.
                </p>
              </div>
              <div className={s.card}>
                <div className={s.stepBadge}>3</div>
                <h3 className={s.cardTitle}>자동 리포트 생성</h3>
                <p className={s.cardDesc}>
                  점검이 끝나면 사진 대지와 지적 사항이 포함된 깔끔한 PDF 점검 리포트가 완성됩니다.
                </p>
              </div>
            </div>
          </section>

          {/* 3. 추가 기능 (특장점) */}
          <section className={s.featureSection}>
            <div className={s.featureGrid}>
              <div className={s.featureItem}>
                <div className={s.featureIcon}><PenTool size={24} /></div>
                <div className={s.featureText}>
                  <h4>합동 점검자 서명</h4>
                  <p>노사 양측 점검자가 태블릿 화면에 직접 전자 서명을 남길 수 있습니다.</p>
                </div>
              </div>
              <div className={s.featureItem}>
                <div className={s.featureIcon}><Download size={24} /></div>
                <div className={s.featureText}>
                  <h4>엑셀/PDF 다운로드</h4>
                  <p>작성된 문서는 언제든지 원본 양식의 엑셀이나 PDF 파일로 다운로드 가능합니다.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 4. FAQ 영역 */}
          <section className={s.faqSection}>
            <div className={s.faqContainer}>
              <h3 className={s.sectionTitle}>자주 묻는 질문</h3>
              <div className={s.faqItem}>
                <div className={s.faqQ}>Q. 점검표 양식을 수정할 수 있나요?</div>
                <div className={s.faqA}>
                  네, 현장 상황에 맞게 점검 항목을 추가하거나 제외하는 등 커스텀이 가능합니다.
                </div>
              </div>
              <div className={s.faqItem}>
                <div className={s.faqQ}>Q. 이전에 지적된 사항을 불러올 수 있나요?</div>
                <div className={s.faqA}>
                  네, 지난 점검 내역을 조회하여 조치 결과가 미흡한 항목을 다시 확인할 수 있습니다.
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ✅ 월 순회점검표 작성 모달 (실제 기능 연결) */}
      <MonthlyInspectionCreateModal
        open={isWriting}
        onClose={() => setIsWriting(false)}
        onRequireLogin={() => setShowLoginModal(true)}
      />

      {/* ✅ 로그인 모달 */}
      {showLoginModal && !showExtraModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}

      {/* ✅ 회원가입 추가정보 모달 (강제 입력) */}
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
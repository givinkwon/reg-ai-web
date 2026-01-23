'use client';

import { useState, useEffect } from 'react';
import { Users, ClipboardList, History } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

// ✅ 컴포넌트 임포트
import TbmCreateModal from './components/TbmCreateModal';
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

// ✅ Store
import { useUserStore } from '../../store/user';
import { useChatStore } from '../../store/chat';

export default function TBMPage() {
  const [isWriting, setIsWriting] = useState(false);

  // Store 상태
  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const refreshSignupStatus = useUserStore((st) => st.refreshSignupStatus);
  const setUser = useUserStore((st) => st.setUser);
  
  const { showLoginModal, setShowLoginModal } = useChatStore();

  // 회원가입 추가정보 모달 상태
  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // 1. 유저 상태 확인
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

  const showExtraModal = forceExtraOpen && !!accountEmail;

  return (
    <div className={s.container}>
      {/* 1. 상단 액션 섹션 */}
      <section className={s.actionSection}>
        <div className={s.actionBox}>
          <div className={s.iconWrapper}>
            <Users size={40} color="white" strokeWidth={1.5} />
          </div>
          <h1 className={s.title}>TBM (작업전 안전점검)</h1>
          <p className={s.desc}>
            작업 시작 전 10분! 근로자와 함께 위험요인을 공유하고 기록하세요.<br />
            PC/모바일 어디서든 간편하게 작성하고 서명까지 완료할 수 있습니다.
          </p>
          
          <div className={s.btnGroup}>
            <Button className={s.whiteBtn} onClick={() => setIsWriting(true)}>
              <ClipboardList size={20} className="mr-2" />
              오늘의 TBM 시작하기
            </Button>
            {/* <Button className={s.glassBtn}>
              <History size={20} className="mr-2" />
              지난 일지 조회
            </Button> */}
          </div>
        </div>
      </section>

      {/* 2. 정보 섹션 */}
      <section className={s.infoSection}>
        <h2 className={s.sectionTitle}>스마트한 TBM 진행 절차</h2>
        <div className={s.grid}>
          <div className={s.card}>
            <div className={s.stepBadge}>1</div>
            <h3 className={s.cardTitle}>작업 내용 입력</h3>
            <p className={s.cardDesc}>
              '용접', '굴착' 등 핵심 키워드를 입력하면 관련 위험요인을 AI가 자동으로 추천합니다.
            </p>
          </div>
          <div className={s.card}>
            <div className={s.stepBadge}>2</div>
            <h3 className={s.cardTitle}>참석자 명단 작성</h3>
            <p className={s.cardDesc}>
              작업 인원을 추가하고 서명을 받습니다. (이전 기록 불러오기 가능)
            </p>
          </div>
          <div className={s.card}>
            <div className={s.stepBadge}>3</div>
            <h3 className={s.cardTitle}>일지 생성 및 다운로드</h3>
            <p className={s.cardDesc}>
              작성이 완료되면 표준 양식의 엑셀 파일로 즉시 변환되어 다운로드됩니다.
            </p>
          </div>
        </div>
      </section>

      {/* 3. FAQ 영역 */}
      <section className={s.faqSection}>
        <div className={s.faqContainer}>
          <h3 className={s.sectionTitle}>자주 묻는 질문</h3>
          <div className={s.faqItem}>
            <div className={s.faqQ}>Q. 매일 작성해야 하나요?</div>
            <div className={s.faqA}>
              네, 산업안전보건법에 따라 작업 전 안전점검 회의(TBM) 기록은 필수입니다.
            </div>
          </div>
          <div className={s.faqItem}>
            <div className={s.faqQ}>Q. 모바일에서도 되나요?</div>
            <div className={s.faqA}>
              네, 스마트폰이나 태블릿에서도 똑같이 작성하고 다운로드할 수 있습니다.
            </div>
          </div>
        </div>
      </section>

      {/* ✅ TBM 작성 모달 */}
      <TbmCreateModal
        open={isWriting}
        onClose={() => setIsWriting(false)}
        onRequireLogin={() => setShowLoginModal(true)}
        userEmail={user?.email}
        // 🔴 [수정] 타입 에러 해결: (user as any)
        companyName={(user as any)?.secondary_info?.company}
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
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { 
  Users, ClipboardList, 
  Clock, FileSignature, Sparkles, 
  MousePointerClick, Building2, Settings, Bell, Download 
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

// ✅ [변경] 기존 Modal 대신 Wizard 사용
import TbmWizard from './components/TbmWizard'; 
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

import { useUserStore } from '@/app/store/user';
import { useChatStore } from '@/app/store/chat';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';
import Footer from '@/app/components/landing/Footer';

// ✅ GA Context
const GA_CTX = { page: 'Docs', section: 'TBM', area: 'Landing' } as const;

export default function TBMPage() {
  const [isWriting, setIsWriting] = useState(false);

  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const refreshSignupStatus = useUserStore((st) => st.refreshSignupStatus);
  const setUser = useUserStore((st) => st.setUser);
  
  const { showLoginModal, setShowLoginModal } = useChatStore();

  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // ✅ GA: Page View Tracking
  const viewTracked = useRef(false);
  
  useEffect(() => {
    if (!initialized || viewTracked.current) return;
    viewTracked.current = true;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      is_logged_in: !!user?.email,
    });
  }, [initialized, user?.email]);

  // 유저 상태 확인 로직
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

  // ✅ GA: TBM 시작 버튼 핸들러
  const handleStartClick = () => {
    track(gaEvent(GA_CTX, 'ClickStart'), {
      ui_id: gaUiId(GA_CTX, 'ClickStart'),
      button_label: '오늘의 TBM 시작하기',
      is_logged_in: !!user?.email,
    });
    setIsWriting(true);
  };

  return (
    <div className={s.container}>
      
      {/* 위저드가 실행 중이 아닐 때만 랜딩 페이지 표시 */}
      {!isWriting ? (
        <>
          {/* 1. 상단 액션 섹션 (Hero) */}
          <section className={s.actionSection}>
            <div className={s.actionBox}>
              <div className={s.iconWrapper}>
                <Users size={40} color="white" strokeWidth={1.5} />
              </div>
              <h1 className={s.title}>TBM (작업전 안전점검)</h1>
              <p className={s.desc}>
                작업 시작 전 1분! 근로자와 함께 위험요인을 공유하고 기록하세요.<br />
                PC/모바일 어디서든 간편하게 작성하고 서명까지 완료할 수 있습니다.
              </p>
              
              <div className={s.btnGroup}>
                <Button 
                  className={s.whiteBtn} 
                  onClick={handleStartClick}
                  data-ga-event="ClickStart"
                  data-ga-id={gaUiId(GA_CTX, 'ClickStart')}
                  data-ga-label="오늘의 TBM 시작하기 버튼"
                >
                  <ClipboardList size={20} className="mr-2" />
                  오늘의 TBM 시작하기
                </Button>
              </div>
            </div>
          </section>

          {/* 2. 상단 특징 3가지 */}
          <section className={s.featureSection}>
            <div className={s.featureGrid}>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Clock size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>1분 TBM 완성</h3>
                <p className={s.featureDesc}>
                  1분이면 TBM 일지가 완성됩니다. 오늘 작업만 입력하면 작업 별 위험요소와 안전 준수 사항을 자동으로 작성합니다.
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <FileSignature size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>서명 자동 발송 & 기입</h3>
                <p className={s.featureDesc}>
                  참석자에게 TBM 일지와 서명 요청이 자동으로 발송됩니다. 완료된 서명은 문서에서 바로 확인할 수 있습니다.
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Sparkles size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>AI 문서 자동 작성</h3>
                <p className={s.featureDesc}>
                  24만 가지 사고 사례를 학습한 AI가 위험 요인과 안전 준수 사항을 금일 작업에 맞게 작성해줍니다.
                </p>
              </div>
            </div>
          </section>

          {/* 3. 무엇을 할 수 있나요? */}
          <section className={s.previewSection}>
            <h2 className={s.sectionHeader}>무엇을 할 수 있나요?</h2>
            
            <div className={s.previewRow}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/TBM 회의록.png" 
                  alt="TBM 회의록 예시" 
                  width={500} 
                  height={700}
                  className={s.previewImg}
                  priority
                />
                <div className={s.caption}>1. TBM 회의록</div>
              </div>
              <div className={s.previewContent}>
                <h3>업체 정보부터 금일 작업, 위험 요소, 안전 준수 사항까지</h3>
                <p>오늘의 TBM 일지가 자동으로 생성됩니다.</p>
              </div>
            </div>

            <div className={`${s.previewRow} ${s.reverse}`}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/서명.png" 
                  alt="모바일 서명 화면" 
                  width={500} 
                  height={700} 
                  className={s.previewImg}
                />
                <div className={s.caption}>2. TBM 활동 일지와 서명 자동 발송</div>
              </div>
              <div className={s.previewContent}>
                <h3>작성된 TBM 일지는<br/>작업자에게 자동으로 전송됩니다.</h3>
                <p>작업자는 확인 후 서명 제출을 진행합니다.<br/>제출된 서명은 일지에 자동으로 기입됩니다.</p>
              </div>
            </div>
          </section>

          {/* 4. 사용 방법 */}
          <section className={s.guideSection}>
            <h2 className={s.sectionHeader}>사용 방법</h2>
            <div className={s.guideGrid}>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><MousePointerClick size={32} /></div>
                <h4>1. 오늘의 TBM 시작하기 클릭</h4>
                <p>간단합니다. 오늘의 TBM 시작하기 버튼을 눌러, 오늘 작업에 딱 맞는 TBM 일지 작성을 시작하세요.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Building2 size={32} /></div>
                <h4>2. 금일 작업 파악</h4>
                <p>오늘 예정된 주요 공정과 작업을 입력하세요. 2만 가지의 예시 공정을 검색하여 작성할 수 있습니다</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Settings size={32} /></div>
                <h4>3. 참석자 명단 입력</h4>
                <p>참석자 명단을 입력하세요. 성함과 연락처만 입력하면 서명이 자동으로 발송됩니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Bell size={32} /></div>
                <h4>4. 알림 기다리기</h4>
                <p>서명이 완료되면 등록된 연락처로 알림이 발송됩니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Download size={32} /></div>
                <h4>5. 문서 다운로드</h4>
                <p>모든 과정이 완료되었습니다. 제출용 또는 사내 보관용 보고서 양식으로 깔끔하게 다운로드하세요.</p>
              </div>
            </div>
          </section>

          <Footer />
        </>
      ) : (
        /* ✅ [변경] TBM Wizard 실행 (전체 화면) */
        <TbmWizard
          open={isWriting}
          onClose={() => {
            track(gaEvent(GA_CTX, 'CloseWizard'), {
              ui_id: gaUiId(GA_CTX, 'CloseWizard'),
            });
            setIsWriting(false);
          }}
          onRequireLogin={() => setShowLoginModal(true)}
          companyName={(user as any)?.secondary_info?.company}
        />
      )}

      {showLoginModal && !showExtraModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}

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
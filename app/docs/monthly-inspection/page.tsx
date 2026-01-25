'use client';

import { useState, useEffect, useRef } from 'react'; // ✅ useRef 추가
import Image from 'next/image';
import { 
  CalendarCheck, ClipboardList, CheckSquare, Sparkles,
  MousePointerClick, Building2, Cpu, CheckCircle2, Search, Download 
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

import MonthlyInspectionCreateModal from './components/MonthlyInspectionCreateModal';
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

import { useUserStore } from '@/app/store/user';
import { useChatStore } from '@/app/store/chat';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context
const GA_CTX = { page: 'SafetyDocs', section: 'MonthlyInspection', area: 'Landing' } as const;

export default function MonthlyPage() {
  const [isWriting, setIsWriting] = useState(false);

  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const refreshSignupStatus = useUserStore((st) => st.refreshSignupStatus);
  const setUser = useUserStore((st) => st.setUser);

  const { showLoginModal, setShowLoginModal } = useChatStore();

  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // ✅ GA: Page View Tracking (1회만)
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;

    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      is_logged_in: !!user?.email,
    });
  }, [user?.email]);

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

  // ✅ GA: 시작 버튼 핸들러
  const handleStartClick = () => {
    track(gaEvent(GA_CTX, 'ClickStart'), {
      ui_id: gaUiId(GA_CTX, 'ClickStart'),
      is_logged_in: !!user?.email,
    });
    setIsWriting(true);
  };

  return (
    <div className={s.container}>
      {!isWriting && (
        <>
          {/* === 1. Hero Section === */}
          <section className={s.actionSection}>
            <div className={s.actionBox}>
              <div className={s.iconWrapper}>
                <CalendarCheck size={40} color="white" strokeWidth={1.5} />
              </div>
              <h1 className={s.title}>월 순회점검표</h1>
              <p className={s.desc}>
                사업장 순회 점검표를 체계적으로 기록하세요.<br />
                사업장 맞춤 점검표를 즉시 생성하고, 점검을 진행합니다.
              </p>
              
              <div className={s.btnGroup}>
                <Button className={s.whiteBtn} onClick={handleStartClick}> {/* ✅ 핸들러 교체 */}
                  점검표 생성하기
                </Button>
              </div>
            </div>
          </section>

          {/* === 2. Top Features (3단계) === */}
          <section className={s.featureSection}>
            <div className={s.featureGrid}>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <ClipboardList size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>맞춤 점검표 1분 생성</h3>
                <p className={s.featureDesc}>
                  1분 만에 사업장 점검표가 만들어집니다. 작업과 공정을 입력하면 맞춤 점검 리스트가 자동으로 생성됩니다.
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <CheckSquare size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>체크리스트 점검</h3>
                <p className={s.featureDesc}>
                  안전 점검 항목을 세 가지 기준으로 빠르게 확인합니다. 개선이 필요한 공정을 바로 파악하세요.
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Sparkles size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>AI 문서 자동 작성</h3>
                <p className={s.featureDesc}>
                  점검이 필요한 작업과 공정을 분석하여 사업장에 딱 맞는 점검표를 자동으로 생성합니다.
                </p>
              </div>
            </div>
          </section>

          {/* === 3. Preview Section (Images) === */}
          <section className={s.previewSection}>
            <h2 className={s.sectionHeader}>무엇을 할 수 있나요?</h2>
            
            {/* 1. 맞춤 점검표 생성 */}
            <div className={s.previewRow}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/생성.png" 
                  alt="사업장 맞춤 점검표 생성" 
                  width={500} 
                  height={600}
                  className={s.previewImg}
                />
                <div className={s.caption}>1. 사업장 맞춤 점검표 생성</div>
              </div>
              <div className={s.previewContent}>
                <h3>작성한 작업과 공정에 맞는 점검표를 자동으로 생성합니다.</h3>
                <p>불필요한 점검 사항을 삭제하거나, 필요한 점검을 추가하세요.</p>
              </div>
            </div>

            {/* 2. 체크리스트 점검 진행 (Reverse) */}
            <div className={`${s.previewRow} ${s.reverse}`}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/점검하기.png" 
                  alt="체크리스트 점검 진행" 
                  width={500} 
                  height={600} 
                  className={s.previewImg}
                />
                <div className={s.caption}>2. 체크리스트 점검 진행</div>
              </div>
              <div className={s.previewContent}>
                <h3>간단히 사업장을 점검하세요</h3>
                <p>지적사항 및 조치계획을 입력하면 점검표에 자동 기입됩니다.</p>
              </div>
            </div>

            {/* 3. 점검표 다운로드 */}
            <div className={s.previewRow}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/점검표.png" 
                  alt="순회 점검표 다운로드" 
                  width={700} 
                  height={500}
                  className={s.previewImg} 
                />
                <div className={s.caption}>3. 순회 점검표 다운로드</div>
              </div>
              <div className={s.previewContent}>
                <h3>기록된 순회 점검표를 다운로드 하세요</h3>
                <p>점검 기간 동안의 모든 점검 사항을 한 눈에 확인하세요</p>
              </div>
            </div>
          </section>

          {/* === 4. Guide Grid (6단계) === */}
          <section className={s.guideSection}>
            <h2 className={s.sectionHeader}>사용 방법</h2>
            <div className={s.guideGrid}>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><MousePointerClick size={32} /></div>
                <h4>1. 점검표 생성하기 클릭</h4>
                <p>점검표 생성하기 버튼을 클릭해 맞춤 점검표 생성을 시작하세요.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Building2 size={32} /></div>
                <h4>2. 공정 및 작업 입력</h4>
                <p>사업장에서 점검이 필요한 공정 또는 작업을 입력하세요. 2만가지의 예시 공정을 검색 가능합니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Cpu size={32} /></div>
                <h4>3. 점검표 AI 생성</h4>
                <p>점검표 생성하기 버튼을 눌러, 공정 맞춤 점검표 생성을 기다리세요.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Search size={32} /></div>
                <h4>4. 점검표 확인 및 수정</h4>
                <p>생성된 점검 사항을 확인하고, 사업장에 더 알맞게 수정하세요.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><CheckCircle2 size={32} /></div>
                <h4>5. 순회 점검 실시</h4>
                <p>매일 같은 양식으로 순회 점검을 실시하세요. 지난 기록은 자동으로 저장됩니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Download size={32} /></div>
                <h4>6. 점검표 다운로드</h4>
                <p>한 달의 순회 점검이 완료되면, 문서를 다운로드 하세요. 제출 혹은 사내 보관용으로 깔끔하게 보관하세요.</p>
              </div>
            </div>
          </section>
        </>
      )}

      <MonthlyInspectionCreateModal
        open={isWriting}
        onClose={() => {
            // ✅ GA: 모달 닫힘
            track(gaEvent(GA_CTX, 'CloseCreateModal'), {
                ui_id: gaUiId(GA_CTX, 'CloseCreateModal'),
            });
            setIsWriting(false);
        }}
        onRequireLogin={() => setShowLoginModal(true)}
      />

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
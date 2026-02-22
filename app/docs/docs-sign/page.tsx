'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { 
  Users, ClipboardList, 
  Clock, FileSignature, Sparkles, 
  MousePointerClick, FileText, Settings, Bell, Download, UploadCloud, CheckSquare
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

import DocsSignWizard from './components/DocsSignWizard'; 
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

import { useUserStore } from '@/app/store/user';
import { useChatStore } from '@/app/store/chat';

import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';
import Footer from '@/app/components/landing/Footer';
import Navbar from '@/app/docs/components/Navbar';

const GA_CTX = { page: 'DocsSign', section: 'Sign', area: 'Landing' } as const;

export default function DocsSignPage() {
  const [isWriting, setIsWriting] = useState(false);

  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const refreshSignupStatus = useUserStore((st) => st.refreshSignupStatus);
  const setUser = useUserStore((st) => st.setUser);
  
  const { showLoginModal, setShowLoginModal } = useChatStore();

  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  const viewTracked = useRef(false);
  
  useEffect(() => {
    if (!initialized || viewTracked.current) return;
    viewTracked.current = true;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      is_logged_in: !!user?.email,
    });
  }, [initialized, user?.email]);

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

  const handleStartClick = () => {
    track(gaEvent(GA_CTX, 'ClickStart'), {
      ui_id: gaUiId(GA_CTX, 'ClickStart'),
      button_label: '안전 문서 요약 및 서명 시작하기',
      is_logged_in: !!user?.email,
    });
    setIsWriting(true);
  };

  return (
    <div className={s.container}>
      
      <div style={{ position: 'relative', zIndex: 100, width: '100%' }}>
        <Navbar />
      </div>
      
      {!isWriting ? (
        <>
          <section className={s.actionSection}>
            <div className={s.actionBox}>
              <div className={s.iconWrapper}>
                <FileSignature size={40} color="white" strokeWidth={1.5} />
              </div>
              <h1 className={s.title}>안전 문서 핵심 요약 & 디지털 서명</h1>
              <p className={s.desc}>
                수십 장의 복잡한 안전 문서를 AI가 3초 만에 핵심 수칙으로 요약해줍니다.<br />
                근로자에게 요약된 내용을 모바일로 발송하고, 간편하게 서명까지 받아보세요.
              </p>
              
              <div className={s.btnGroup}>
                <Button 
                  className={s.whiteBtn} 
                  onClick={handleStartClick}
                  data-ga-event="ClickStart"
                  data-ga-id={gaUiId(GA_CTX, 'ClickStart')}
                  data-ga-label="안전 문서 요약 및 서명 시작하기"
                >
                  <CheckSquare size={20} className="mr-2" />
                  문서 서명 프로세스 시작
                </Button>
              </div>
            </div>
          </section>

          <section className={s.featureSection}>
            <div className={s.featureGrid}>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Sparkles size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>AI 핵심 내용 요약</h3>
                <p className={s.featureDesc}>
                  PDF, Word, Excel 등 어떤 문서든 업로드만 하세요. AI가 현장 근로자가 반드시 알아야 할 핵심 안전 수칙 3~5가지를 정확하게 추출합니다.
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Bell size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>모바일 서명 링크 자동 발송</h3>
                <p className={s.featureDesc}>
                  추출된 요약 내용과 함께 디지털 서명을 진행할 수 있는 모바일 링크가 근로자의 카카오톡 또는 문자로 즉시 발송됩니다.
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Download size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>증빙 시트 자동 병합</h3>
                <p className={s.featureDesc}>
                  근로자 전원의 서명이 완료되면, 원본 문서의 맨 뒷장에 서명 내역이 포함된 증빙 시트가 자동으로 병합되어 파일로 제공됩니다.
                </p>
              </div>
            </div>
          </section>

          <section className={s.previewSection}>
            <h2 className={s.sectionHeader}>무엇을 할 수 있나요?</h2>
            
            <div className={s.previewRow}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/TBM 회의록.png" 
                  alt="AI 요약 예시" 
                  width={500} 
                  height={700}
                  className={s.previewImg}
                  priority
                />
                <div className={s.caption}>1. AI 문서 요약 추출</div>
              </div>
              <div className={s.previewContent}>
                <h3>방대한 안전보건 교안도<br/>단 3초 만에 핵심만!</h3>
                <p>근로자들이 수십 장의 문서를 모두 읽기란 어렵습니다.<br/>AI가 문서의 문맥을 파악하여 가장 중요한<br/>안전 수칙만을 뽑아냅니다.</p>
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
                <div className={s.caption}>2. 모바일 서명 발송 및 수합</div>
              </div>
              <div className={s.previewContent}>
                <h3>근로자는 모바일로 핵심만 읽고<br/>간편하게 서명합니다.</h3>
                <p>작업자는 수신된 링크를 통해 요약본을 확인하고,<br/>화면에서 바로 서명 제출을 진행합니다.<br/>수합된 서명은 관리자에게 실시간 연동됩니다.</p>
              </div>
            </div>
          </section>

          <section className={s.guideSection}>
            <h2 className={s.sectionHeader}>사용 방법</h2>
            <div className={s.guideGrid}>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><MousePointerClick size={32} /></div>
                <h4>1. 프로세스 시작</h4>
                <p>문서 서명 시작하기 버튼을 눌러 작업을 시작하세요.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><UploadCloud size={32} /></div>
                <h4>2. 문서 업로드</h4>
                <p>교육이 필요한 안전 문서(PDF, Word, Excel) 원본을 업로드합니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Sparkles size={32} /></div>
                <h4>3. AI 요약 확인</h4>
                <p>AI가 추출한 3~5가지 핵심 안전 수칙을 검토합니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Users size={32} /></div>
                <h4>4. 참석자 지정</h4>
                <p>서명이 필요한 근로자 명단(이름, 연락처)을 입력합니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Bell size={32} /></div>
                <h4>5. 알림톡 발송 및 서명 대기</h4>
                <p>근로자에게 알림톡이 발송되며, 서명이 완료될 때까지 대기합니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Download size={32} /></div>
                <h4>6. 증빙 문서 다운로드</h4>
                <p>서명이 모두 수합되면, 서명 시트가 병합된 최종 PDF를 다운로드합니다.</p>
              </div>
            </div>
          </section>

          <Footer />
        </>
      ) : (
        /* ✅ [수정] 로그인 모달 팝업 함수 전달 */
        <DocsSignWizard
          open={isWriting}
          onClose={() => {
            track(gaEvent(GA_CTX, 'CloseWizard'), {
              ui_id: gaUiId(GA_CTX, 'CloseWizard'),
            });
            setIsWriting(false);
          }}
          onRequireLogin={() => setShowLoginModal(true)}
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
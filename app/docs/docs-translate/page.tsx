'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { 
  Globe, Languages, 
  FileText, Sparkles, 
  MousePointerClick, Download, CheckCircle2,
  UploadCloud, LayoutTemplate
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

// ✅ Wizard 컴포넌트 Import
import DocsTranslateWizard from './components/DocsTranslateWizard'; 
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

import { useUserStore } from '@/app/store/user';
import { useChatStore } from '@/app/store/chat';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';
import Footer from '@/app/components/landing/Footer';
import Navbar from '@/app/docs/components/Navbar';

// ✅ GA Context
const GA_CTX = { page: 'DocsTranslate', section: 'Translate', area: 'Landing' } as const;

export default function DocsTranslatePage() {
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

  // ✅ 시작 버튼 핸들러
  const handleStartClick = () => {
    track(gaEvent(GA_CTX, 'ClickStart'), {
      ui_id: gaUiId(GA_CTX, 'ClickStart'),
      button_label: '다국어 문서 생성 시작',
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
                <Globe size={40} color="white" strokeWidth={1.5} />
              </div>
              <h1 className={s.title}>외국인 근로자 다국어 교안 생성</h1>
              <p className={s.desc}>
                PPT, Word, Excel 원본 교안의 디자인을 그대로 유지한 채 다국어 문서로 변환하세요.<br />
                중국어, 베트남어, 몽골어 등 다양한 언어를 클릭 한 번에 일괄 생성할 수 있습니다.
              </p>
              
              <div className={s.btnGroup}>
                <Button 
                  className={s.whiteBtn} 
                  onClick={handleStartClick}
                  data-ga-event="ClickStart"
                  data-ga-id={gaUiId(GA_CTX, 'ClickStart')}
                  data-ga-label="다국어 문서 생성 시작하기"
                >
                  <Languages size={20} className="mr-2" />
                  다국어 문서 생성 시작
                </Button>
              </div>
            </div>
          </section>

          {/* 2. 상단 특징 3가지 */}
          <section className={s.featureSection}>
            <div className={s.featureGrid}>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <LayoutTemplate size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>원본 레이아웃 유지</h3>
                <p className={s.featureDesc}>
                  업로드한 PPT, Word 파일의 서식, 표, 이미지는 건드리지 않고 내부의 텍스트만 완벽하게 번역하여 덮어씁니다.
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Globe size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>9개국 이상 다국어 지원</h3>
                <p className={s.featureDesc}>
                  영어, 중국어, 베트남어, 몽골어, 우즈베크어 등 산업 현장에서 외국인 근로자 비중이 높은 언어를 지원합니다.
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Download size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>일괄 변환 및 다운로드</h3>
                <p className={s.featureDesc}>
                  번역할 언어를 여러 개 체크만 하세요. 단 한 번의 클릭으로 선택한 모든 언어의 파일이 생성되어 다운로드됩니다.
                </p>
              </div>
            </div>
          </section>

          {/* 3. 무엇을 할 수 있나요? (미리보기) */}
          <section className={s.previewSection}>
            <h2 className={s.sectionHeader}>무엇을 할 수 있나요?</h2>
            
            <div className={s.previewRow}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/번역_원본유지.png" // TODO: 추후 적절한 이미지(PPT 번역 전/후 화면)로 교체
                  alt="원본 유지 번역 예시" 
                  width={500} 
                  height={700}
                  className={s.previewImg}
                  priority
                />
                <div className={s.caption}>1. 양식 파괴 없는 완벽한 번역</div>
              </div>
              <div className={s.previewContent}>
                <h3>PPT, Word 양식은 그대로,<br/>내용만 해당 국가 언어로 바뀝니다.</h3>
                <p>기존에 힘들게 텍스트 상자를 하나하나 복사해서<br/>번역기를 돌리던 수고를 덜어드립니다.<br/>AI가 문서 구조를 파악해 텍스트만 깔끔하게 교체합니다.</p>
              </div>
            </div>

            <div className={`${s.previewRow} ${s.reverse}`}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/다국어_선택.png" // TODO: 추후 다국어 체크박스/파일 여러개 다운로드 이미지로 교체
                  alt="다국어 동시 생성 화면" 
                  width={500} 
                  height={700} 
                  className={s.previewImg}
                />
                <div className={s.caption}>2. 다국어 교안 일괄 생성</div>
              </div>
              <div className={s.previewContent}>
                <h3>체크 한 번으로<br/>여러 언어의 교안을 동시에 만드세요.</h3>
                <p>베트남어, 중국어, 몽골어 등 현장에 필요한<br/>여러 국가의 언어를 중복 선택하세요.<br/>선택한 언어 수만큼 원본 파일이 변환되어 제공됩니다.</p>
              </div>
            </div>
          </section>

          {/* 4. 사용 방법 */}
          <section className={s.guideSection}>
            <h2 className={s.sectionHeader}>사용 방법</h2>
            <div className={s.guideGrid}>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><MousePointerClick size={32} /></div>
                <h4>1. 프로세스 시작</h4>
                <p>다국어 문서 생성 시작 버튼을 눌러 작업을 시작하세요.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><UploadCloud size={32} /></div>
                <h4>2. 교안 업로드</h4>
                <p>번역이 필요한 안전보건 교안(PPT, Word, Excel) 원본을 업로드합니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><CheckCircle2 size={32} /></div>
                <h4>3. 국가 언어 선택</h4>
                <p>현장의 외국인 근로자 국적에 맞게 변환할 언어들을 다중 선택합니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Sparkles size={32} /></div>
                <h4>4. AI 번역 변환</h4>
                <p>AI가 파일 구조를 분석하여 양식을 유지한 채 텍스트를 번역합니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Download size={32} /></div>
                <h4>5. 일괄 다운로드</h4>
                <p>변환이 완료된 파일들이 각 언어별로 자동 다운로드됩니다.</p>
              </div>
            </div>
          </section>

          <Footer />
        </>
      ) : (
        /* ✅ Wizard 모달 실행 */
        <DocsTranslateWizard
          open={isWriting}
          onClose={() => {
            track(gaEvent(GA_CTX, 'CloseWizard'), { ui_id: gaUiId(GA_CTX, 'CloseWizard') });
            setIsWriting(false);
          }}
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
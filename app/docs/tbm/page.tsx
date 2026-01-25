'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image'; // ✅ 이미지 컴포넌트 추가
import { 
  Users, ClipboardList, 
  Clock, FileSignature, Sparkles, // 상단 특징 아이콘
  MousePointerClick, Building2, Settings, Bell, Download // 하단 가이드 아이콘
} from 'lucide-react';
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
            <Button className={s.whiteBtn} onClick={() => setIsWriting(true)}>
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

      {/* 3. 무엇을 할 수 있나요? (Preview) */}
      <section className={s.previewSection}>
        <h2 className={s.sectionHeader}>무엇을 할 수 있나요?</h2>
        
        {/* Row 1: TBM 회의록 */}
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
            <h3>내 업체 정보와<br/>작업 인원<br/>금일 작업<br/>위험 요소<br/>안전 준수 사항 까지</h3>
            <p>반영된 TBM 일지가 자동으로 생성됩니다.</p>
          </div>
        </div>

        {/* Row 2: 자동 발송 및 서명 (Reverse Layout) */}
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

      {/* 4. 사용 방법 (Grid) */}
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
          {/* 5번은 디자인상 비어있거나 통합된 경우도 있으나, 6번(다운로드)와 균형을 위해 배치하거나, 
              디자인 시안에 5번이 없다면 생략 가능. 여기서는 시안의 6.문서 다운로드를 5번째 슬롯에 배치하거나 Grid 유지 */}
           {/* <div className={s.guideItem} style={{ visibility: 'hidden' }}> */}
             {/* 빈 공간 (레이아웃 유지용) */}
          {/* </div> */}
          <div className={s.guideItem}>
            <div className={s.guideIcon}><Download size={32} /></div>
            <h4>5. 문서 다운로드</h4>
            <p>모든 과정이 완료되었습니다. 제출용 또는 사내 보관용 보고서 양식으로 깔끔하게 다운로드하세요.</p>
          </div>
        </div>
      </section>

      {/* ✅ TBM 작성 모달 */}
      <TbmCreateModal
        open={isWriting}
        onClose={() => setIsWriting(false)}
        onRequireLogin={() => setShowLoginModal(true)}
        userEmail={user?.email}
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
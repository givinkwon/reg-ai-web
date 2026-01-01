// app/chat/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import RightPanel from './components/RightPannel';
import LoginPromptModal from './components/LoginPromptModal';
import SignupExtraInfoModal from './components/SignupExtraInfoModal';

import { useChatStore } from '../store/chat';
import { initUserStore, useUserStore } from '../store/user';
import s from './page.module.css';

export default function ChatPage() {
  const {
    sidebarMobileOpen,
    setSidebarMobileOpen,
    showLoginModal,
    setShowLoginModal,
  } = useChatStore();

  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const refreshSignupStatus = useUserStore((st) => st.refreshSignupStatus);
  const setUser = useUserStore((st) => st.setUser);

  // ✅ “가입 미완료면 강제로 띄우는” 전역 모달 플래그
  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // ✅ Firebase + localStorage → Zustand 동기화
  useEffect(() => {
    initUserStore();
  }, []);

  /**
   * ✅ 새로고침 후에도 “가입 미완료”면 무조건 추가정보 모달을 띄우기
   * - 케이스1) localStorage에 isSignupComplete=false로 저장돼있으면 즉시 띄움
   * - 케이스2) isSignupComplete가 undefined(모름)으로 복원되면 서버에 재확인(refreshSignupStatus) 후 띄움
   */
  useEffect(() => {
    if (!initialized) return;

    // 로그인 상태 아님
    if (!user?.email) {
      setForceExtraOpen(false);
      setAccountEmail(null);
      return;
    }

    // 1) 이미 false면 즉시 오픈
    if (user.isSignupComplete === false) {
      setAccountEmail(user.email);
      setForceExtraOpen(true);
      return;
    }

    // 2) 이미 true면 닫기
    if (user.isSignupComplete === true) {
      setForceExtraOpen(false);
      setAccountEmail(null);
      return;
    }

    // 3) undefined(모름)이면 서버에 재확인 후 판단
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
    <div className={s.shell}>
      {/* 모바일 오버레이 (사이드바) */}
      {sidebarMobileOpen && (
        <>
          <div
            className={s.overlay}
            onClick={() => setSidebarMobileOpen(false)}
          />
          <div className={s.sideFloat}>
            <Sidebar />
          </div>
        </>
      )}

      {/* 데스크톱 사이드바 */}
      <div className={s.sideDesktop}>
        <Sidebar />
      </div>

      {/* 본문 */}
      <div className={s.main}>
        <ChatArea />
      </div>

      {/* 오른쪽 근거 패널 */}
      <div className={s.rightDesktop}>
        <RightPanel />
      </div>

      {/* ✅ 전역: 가입 미완료면 강제 추가정보 모달 */}
      {showExtraModal && accountEmail && (
        <SignupExtraInfoModal
          email={accountEmail}
          onComplete={() => {
            // SignupExtraInfoModal 내부에서 서버 저장 완료 후 onComplete 호출됨
            // ✅ 프론트도 즉시 완료로 반영(로컬스토리지 포함)
            const cur = useUserStore.getState().user;
            if (cur) setUser({ ...cur, isSignupComplete: true });

            setForceExtraOpen(false);
            setAccountEmail(null);
          }}
        />
      )}

      {/* ✅ 전역 상태 기반 로그인 모달
          - 가입 미완료 강제 모달이 떠있을 때는 로그인 모달을 막는 게 안전 */}
      {showLoginModal && !showExtraModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
}

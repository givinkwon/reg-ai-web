// app/chat/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import RightPanel from './components/RightPannel';
import LoginPromptModal from './components/LoginPromptModal';
import SignupExtraInfoModal from './components/SignupExtraInfoModal';
import DocsVault from './components/DocsVault';

import { useChatStore } from '../store/chat';
import { initUserStore, useUserStore } from '../store/user';
import s from './page.module.css';
import WeeklySafetyNewsModal from './components/news/WeeklySafetyNewsModal';
import NewsArticlesModal from './components/news/NewsArticlesModal';

export default function ChatPage() {
  const searchParams = useSearchParams();
  const view = searchParams.get('view'); // ✅ e.g. 'docs'

  const {
    sidebarMobileOpen,
    setSidebarMobileOpen,
    showLoginModal,
    setShowLoginModal,
    mainView, // 'chat' | 'docs'
    setMainView, // ✅ 추가: store에 있어야 함
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
   * ✅ 이메일 딥링크 진입: /chat?view=docs
   * - 문서함 자동 오픈
   * - 비로그인 시 로그인 모달 자동 오픈
   */
  useEffect(() => {
    if (!initialized) return;

    if (view === 'docs') {
      setMainView('docs');

      // 비로그인이라면 로그인 모달 오픈
      if (!user?.email) {
        setShowLoginModal(true);
      }
    }
  }, [initialized, view, user?.email, setMainView, setShowLoginModal]);

  /**
   * ✅ 새로고침 후에도 “가입 미완료”면 무조건 추가정보 모달을 띄우기
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

  const showDocs = mainView === 'docs';

  return (
    <div className={s.shell}>
      {/* 모바일 오버레이 (사이드바) */}
      {sidebarMobileOpen && (
        <>
          <div className={s.overlay} onClick={() => setSidebarMobileOpen(false)} />
          <div className={s.sideFloat}>
            <Sidebar />
          </div>
        </>
      )}

      {/* 데스크톱 사이드바 */}
      <div className={s.sideDesktop}>
        <Sidebar />
      </div>

      {/* 본문: chat/docs 분기 */}
      <div className={s.main}>
        {showDocs ? (
          <DocsVault
            userEmail={user?.email ?? null}
            onRequireLogin={() => setShowLoginModal(true)}
          />
        ) : (
          <ChatArea />
        )}
      </div>

      {/* 오른쪽 근거 패널: 문서함에서는 숨김 */}
      <div className={s.rightDesktop}>{showDocs ? null : <RightPanel />}</div>

      {/* ✅ 전역: 가입 미완료면 강제 추가정보 모달 */}
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

      {/* ✅ 전역 상태 기반 로그인 모달 */}
      {showLoginModal && !showExtraModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}

      <WeeklySafetyNewsModal />
      <NewsArticlesModal />
    </div>
  );
}

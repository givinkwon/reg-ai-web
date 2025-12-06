// app/chat/page.tsx
'use client';

import { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import RightPanel from './components/RightPannel';
import LoginPromptModal from './components/LoginPromptModal';
import { useChatStore } from '../store/chat';
import { initUserStore } from '../store/user';
import s from './page.module.css';

export default function ChatPage() {
  const { sidebarMobileOpen, setSidebarMobileOpen, showLoginModal, setShowLoginModal } =
    useChatStore();

  // ✅ Firebase + localStorage → Zustand 동기화
  useEffect(() => {
    initUserStore();
  }, []);

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

      {/* ✅ 전역 상태 기반 로그인 모달 */}
      {showLoginModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
}

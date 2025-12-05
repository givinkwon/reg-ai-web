// app/chat/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import RightPanel from './components/RightPannel';
import LoginPromptModal from './components/LoginPromptModal';
import { useChatStore } from '../store/chat';
import { useUserStore } from '../store/user';
import s from './page.module.css';

const GUEST_Q_KEY = 'regai_guest_q_count_v1';
const GUEST_MODAL_SHOWN_KEY = 'regai_guest_login_modal_shown_v1';

export default function ChatPage() {
  const { sidebarMobileOpen, setSidebarMobileOpen } = useChatStore();
  const messages = useChatStore((st) => st.messages);
  const userInfo = useUserStore((st) => st.userInfo); // userInfo.email 로 로그인 여부 판단

  const [showLoginModal, setShowLoginModal] = useState(false);

  // 🔹 비로그인 상태에서 user 메시지 3개 이상이면 팝업 노출
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 이미 로그인 했으면 카운트/팝업 리셋
    if (userInfo?.email) {
      window.localStorage.removeItem(GUEST_Q_KEY);
      window.localStorage.removeItem(GUEST_MODAL_SHOWN_KEY);
      setShowLoginModal(false);
      return;
    }

    // user 메시지 개수만 카운트
    const userMsgCount = messages.filter((m) => m.role === 'user').length;
    if (userMsgCount === 0) return;

    const prevCount = Number(
      window.localStorage.getItem(GUEST_Q_KEY) || '0',
    );

    const newCount = Math.max(prevCount, userMsgCount);
    window.localStorage.setItem(GUEST_Q_KEY, String(newCount));

    if (newCount >= 3) {
      setShowLoginModal(true);
      window.localStorage.setItem(GUEST_MODAL_SHOWN_KEY, '1');
    }
  }, [messages, userInfo?.email]);

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

      {/* ✅ 비로그인 + 3회 이상 입력 시 로그인 팝업 */}
      {showLoginModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
}

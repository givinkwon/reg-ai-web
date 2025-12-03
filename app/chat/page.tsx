// app/chat/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import RightPanel from './components/RightPannel';
import { useChatStore } from '../store/chat';
import { useUserStore } from '../store/user';
import s from './page.module.css';

const GUEST_Q_KEY = 'regai_guest_q_count_v1';
const GUEST_MODAL_SHOWN_KEY = 'regai_guest_login_modal_shown_v1';

/** 로그인 유도 팝업 */
function LoginPromptModal({ onClose }: { onClose: () => void }) {
  const handleGoogleLogin = () => {
    // ✅ 실제 프로젝트 로그인 경로로 교체
    // 예: window.location.href = '/api/auth/google';
    window.location.href = '/auth/google';
  };

  const handleKakaoLogin = () => {
    // ✅ 실제 프로젝트 로그인 경로로 교체
    // 예: window.location.href = '/api/auth/kakao';
    window.location.href = '/auth/kakao';
  };

  return (
    <div className={s.loginOverlay}>
      <div className={s.loginCard}>
        <div className={s.loginBadge}>REG AI</div>

        <h2 className={s.loginTitle}>REG AI와 함께 안전 시작</h2>
        <p className={s.loginSub}>
          5초만에 시작하세요.
          <br />
          더 정확한 응답을 받아보세요.
        </p>

        <button
          type="button"
          className={s.loginBtnGoogle}
          onClick={handleGoogleLogin}
        >
          {/* 아이콘 넣고 싶으면 span 하나 더 추가해서 background-image 로 처리 가능 */}
          <span className={s.loginBtnLabel}>구글로 시작하기</span>
        </button>

        <button
          type="button"
          className={s.loginBtnKakao}
          onClick={handleKakaoLogin}
        >
          <span className={s.loginBtnLabel}>카카오로 시작하기</span>
        </button>

        <button
          type="button"
          className={s.loginBack}
          onClick={onClose}
        >
          뒤로가기
        </button>
      </div>
    </div>
  );
}

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

    // 이미 한 번 보여줬으면 다시 안 띄움
    const alreadyShown = window.localStorage.getItem(GUEST_MODAL_SHOWN_KEY);

    if (newCount >= 3 && !alreadyShown) {
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

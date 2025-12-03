// app/chat/components/LoginPromptModal.tsx
'use client';

import s from './LoginPromptModal.module.css';

type LoginPromptModalProps = {
  onClose: () => void;
};

export default function LoginPromptModal({ onClose }: LoginPromptModalProps) {
  const handleGoogleLogin = () => {
    // ✅ 실제 로그인 URL 로 교체
    // 예시) window.location.href = '/api/auth/google';
    window.location.href = '/auth/google';
  };

  const handleKakaoLogin = () => {
    // ✅ 실제 로그인 URL 로 교체
    window.location.href = '/auth/kakao';
  };

  return (
    <div className={s.loginOverlay}>
      <div className={s.loginCard}>
        {/* 상단 REG AI 동그란 뱃지 느낌 */}
        <div className={s.loginBadge}>REG</div>

        <h2 className={s.loginTitle}>REG AI와 함께 안전 시작</h2>
        <p className={s.loginSub}>
          5초만에 시작하세요.
          <br />
          더 정확한 응답을 받아보세요.
        </p>

        {/* 구글 로그인 버튼 */}
        <button
          type="button"
          className={s.loginBtnGoogle}
          onClick={handleGoogleLogin}
        >
          <span className={s.loginBtnLabel}>구글로 시작하기</span>
        </button>

        {/* 카카오 로그인 버튼 */}
        <button
          type="button"
          className={s.loginBtnKakao}
          onClick={handleKakaoLogin}
        >
          <span className={s.loginBtnLabel}>카카오로 시작하기</span>
        </button>

        {/* 닫기(뒤로가기) */}
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

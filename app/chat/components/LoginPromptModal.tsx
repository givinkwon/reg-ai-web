// app/chat/components/LoginPromptModal.tsx
'use client';

import React from 'react';
import s from './LoginPromptModal.module.css';

type LoginPromptModalProps = {
  onClose: () => void;
};

const GOOGLE_LOGIN_URL =
  process.env.NEXT_PUBLIC_GOOGLE_LOGIN_URL || '/api/auth/google/login';

const KAKAO_LOGIN_URL =
  process.env.NEXT_PUBLIC_KAKAO_LOGIN_URL || '/api/auth/kakao/login';

export default function LoginPromptModal({ onClose }: LoginPromptModalProps) {
  const handleGoogleLogin = () => {
    // OAuth 시작: 백엔드 또는 Next 라우트로 리다이렉트
    window.location.href = GOOGLE_LOGIN_URL;
  };

  const handleKakaoLogin = () => {
    window.location.href = KAKAO_LOGIN_URL;
  };

  return (
    <div className={s.loginOverlay} onClick={onClose}>
      <div className={s.loginCard} onClick={(e) => e.stopPropagation()}>
        <div className={s.loginBadge}>REG</div>

        <h3 className={s.loginTitle}>REG AI와 함께 안전 시작</h3>
        <p className={s.loginSub}>
          5초 만에 시작하세요.
          <br />
          더 정확한 응답을 받아보실 수 있어요.
        </p>

        {/* 구글 로그인 */}
        <button
          type="button"
          className={s.loginBtnGoogle}
          onClick={handleGoogleLogin}
        >
          <span className={s.loginBtnLabel}>구글로 시작하기</span>
        </button>

        {/* 카카오 로그인 */}
        <button
          type="button"
          className={s.loginBtnKakao}
          onClick={handleKakaoLogin}
        >
          <span className={s.loginBtnLabel}>카카오로 시작하기</span>
        </button>

        {/* 뒤로가기 */}
        <button type="button" className={s.loginBack} onClick={onClose}>
          뒤로가기
        </button>
      </div>
    </div>
  );
}

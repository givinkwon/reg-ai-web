// app/chat/components/LoginPromptModal.tsx
'use client';

import React, { useEffect, useState } from 'react';
import s from './LoginPromptModal.module.css';
import { signInWithGoogle } from '@/app/lib/firebase';
import { useUserStore } from '@/app/store/user';
import SignupExtraInfoModal from './SignupExtraInfoModal';

type LoginPromptModalProps = {
  onClose: () => void;
};

type PendingKakaoUser = {
  kakaoId: string;
  email: string;
};

export default function LoginPromptModal({ onClose }: LoginPromptModalProps) {
  const user = useUserStore((st) => st.user);
  const setUser = useUserStore((st) => st.setUser);
  const [loading, setLoading] = useState(false);

  const [showExtraModal, setShowExtraModal] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [pendingKakaoUser, setPendingKakaoUser] =
    useState<PendingKakaoUser | null>(null);

  // ✅ 로그인되면 자동으로 닫되,
  //    "추가 정보 모달"이 떠 있을 때는 닫지 않는다.
  useEffect(() => {
    if (user && !showExtraModal) {
      onClose();
    }
  }, [user, showExtraModal, onClose]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);

      const fbUser = await signInWithGoogle();

      if (!fbUser.email) {
        alert('구글 계정에 이메일 정보가 없어 로그인에 실패했습니다.');
        return;
      }

      // 백엔드 계정 upsert
      const res = await fetch('/api/accounts/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_id: fbUser.uid,
          email: fbUser.email,
          name: fbUser.displayName,
          picture: fbUser.photoURL,
        }),
      });

      const data = await res.json().catch(() => null);
      console.log('[LoginPromptModal] account result:', data);

      // ✅ "가입 완료가 아닌" 상태면 추가 정보 팝업만 띄우고
      //    로그인 모달은 숨긴다.
      const needExtra =
        res.ok &&
        data &&
        (data.is_signup_complete === false ||
          data.is_signup_complete === undefined);

      if (needExtra) {
        setAccountEmail(fbUser.email);
        setShowExtraModal(true); // 추가 정보 팝업 오픈
      } else {
        // 이미 가입 완료 상태면 바로 닫기 (useEffect가 처리)
        onClose();
      }
    } catch (err) {
      console.error('[LoginPromptModal] Google login error:', err);
      alert('구글 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  /* =========================
   * Kakao 로그인
   * ========================= */
  const handleKakaoLogin = () => {
    if (typeof window === 'undefined' || !window.Kakao) {
      alert('카카오 SDK 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const kakao = window.Kakao;

    // ✅ 최초 한 번만 init
    if (!kakao.isInitialized()) {
      const key = "79c1a2486d79d909091433229e814d9d"

      if (!key) {
        console.error('[Kakao] NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY is not set');
        alert('카카오 설정 오류가 있습니다. 관리자에게 문의해 주세요.');
        return;
      }
      kakao.init(key);
    }

    setLoading(true);

    kakao.Auth.login({
      throughTalk: false,
      scope: 'account_email',
      success: async () => {
        try {
          const kakaoUser = await new Promise<any>((resolve, reject) => {
            kakao.API.request({
              url: '/v2/user/me',
              success: resolve,
              fail: reject,
            });
          });

          const kakaoAccount = kakaoUser.kakao_account ?? {};
          const email: string | null = kakaoAccount.email ?? null;

          if (!email) {
            alert(
              '카카오 계정에 이메일 정보가 없습니다. 카카오 설정에서 이메일 제공 동의를 켜 주세요.',
            );
            return;
          }

          const kakaoId = String(kakaoUser.id);

          // 우리 서버에 upsert
          const res = await fetch('/api/accounts/kakao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kakao_id: kakaoId,
              email,
              name: null,
              picture: null,
            }),
          });

          const data = await res.json().catch(() => null);
          console.log('[LoginPromptModal] kakao account result:', data);

          const needExtra =
            res.ok &&
            data &&
            (data.is_signup_complete === false ||
              data.is_signup_complete === undefined);

          if (needExtra) {
            // 🔹 추가 정보 모달을 위해 잠시 저장
            setPendingKakaoUser({ kakaoId, email });
            setAccountEmail(email);
            setShowExtraModal(true);
            // 👈 여기서는 setUser() 호출 안 함
          } else {
            // 이미 가입 완료된 카카오 계정이면 바로 로그인 처리
            setUser({
              uid: `kakao:${kakaoId}`,
              email,
              name: null,
              photoUrl: null,
              provider: 'kakao',
            });
            onClose();
          }
        } catch (err) {
          console.error('[LoginPromptModal] Kakao login error:', err);
          alert('카카오 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
          setLoading(false);
        }
      },
      fail: (err: any) => {
        console.error('[LoginPromptModal] Kakao login fail:', err);
        alert('카카오 로그인에 실패했습니다.');
        setLoading(false);
      },
    });
  };

  const handleExtraComplete = () => {
    setShowExtraModal(false);
    onClose(); // 온보딩 끝났으니 메인으로
  };

  return (
    <>
      {/* 🔻 showExtraModal 이 false일 때만 로그인 모달 렌더링 */}
      {!showExtraModal && (
        <div className={s.loginOverlay} onClick={onClose}>
          <div className={s.loginCard} onClick={(e) => e.stopPropagation()}>
            <div className={s.loginBadge}>REG</div>

            <h3 className={s.loginTitle}>REG AI와 함께 안전 시작</h3>
            <p className={s.loginSub}>
              5초 만에 시작하세요.
              <br />
              더 정확한 응답을 받아보실 수 있어요.
            </p>

            <button
              type="button"
              className={s.loginBtnGoogle}
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <span className={s.loginBtnLabel}>
                {loading ? '로그인 중...' : '구글로 시작하기'}
              </span>
            </button>

            <button
              type="button"
              className={s.loginBtnKakao}
              onClick={handleKakaoLogin}
              disabled={loading}
            >
              <span className={s.loginBtnLabel}>카카오로 시작하기</span>
            </button>

            <button
              type="button"
              className={s.loginBack}
              onClick={onClose}
              disabled={loading}
            >
              뒤로가기
            </button>
          </div>
        </div>
      )}

      {/* 🔻 추가 정보 입력 모달 */}
      {showExtraModal && accountEmail && (
        <SignupExtraInfoModal
          email={accountEmail}
          onComplete={handleExtraComplete}
        />
      )}
    </>
  );
}

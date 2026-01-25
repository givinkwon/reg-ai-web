// app/chat/components/LoginPromptModal.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react'; // useRef 추가
import s from './LoginPromptModal.module.css';
import { signInWithGoogle } from '@/app/lib/firebase';
import { useUserStore } from '@/app/store/user';
import SignupExtraInfoModal from './SignupExtraInfoModal';

type LoginPromptModalProps = {
  onClose: () => void;
};

// ✅ 슬랙 전송 유틸 함수 (내부 정의)
const sendSlackMessage = (text: string) => {
  fetch('/api/slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 3500) }),
  }).catch((err) => console.error('[LoginPromptModal] Slack send failed:', err));
};

export default function LoginPromptModal({ onClose }: LoginPromptModalProps) {
  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const setUser = useUserStore((st) => st.setUser);

  const [loading, setLoading] = useState(false);

  const [showExtraModal, setShowExtraModal] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // ✅ 중복 전송 방지를 위한 Ref
  const slackSentRef = useRef(false);

  // ✅ (NEW) 모달이 열릴 때 슬랙 알림 전송 (1회만)
  useEffect(() => {
    if (slackSentRef.current) return;
    
    // 모달이 렌더링되었다는 것은 로그인 시도가 있다는 의미
    // (만약 showExtraModal 상태가 아니라면 로그인 프롬프트가 뜬 것)
    if (!showExtraModal) {
      sendSlackMessage('👀 [LoginPromptModal] 로그인 유도 팝업이 열렸습니다.');
      slackSentRef.current = true;
    }
  }, [showExtraModal]);

  // ✅ (1) 새로고침/복원된 user가 "가입 미완료"면 자동으로 추가정보 모달 오픈
  useEffect(() => {
    if (!initialized) return;
    if (!user?.email) return;

    if (user.isSignupComplete === false) {
      setAccountEmail(user.email);
      setShowExtraModal(true);
    }
  }, [initialized, user?.email, user?.isSignupComplete]);

  // ✅ (2) 가입 완료된 로그인 상태면 자동 close (단, extra modal/로딩 중이면 닫지 않음)
  useEffect(() => {
    if (!initialized) return;
    if (loading) return;
    if (!user) return;

    // extra modal이 떠있으면 닫지 않기
    if (showExtraModal) return;

    // 가입 완료면 닫기
    if (user.isSignupComplete !== false) {
      onClose();
    }
  }, [initialized, user, showExtraModal, loading, onClose]);

  const handleGoogleLogin = async () => {
    // ✅ 슬랙 알림: 버튼 클릭 시
    sendSlackMessage('👉 [LoginPromptModal] 구글 로그인 버튼 클릭');

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
      console.log('[LoginPromptModal] google account result:', data);

      const needExtra =
        !!res.ok &&
        !!data &&
        (data.is_signup_complete === false ||
          data.is_signup_complete === undefined);

      // ✅ needExtra여도 user 저장 (새로고침 복원 목적)
      setUser({
        uid: `google:${fbUser.uid}`,
        email: fbUser.email ?? null,
        name: fbUser.displayName ?? null,
        photoUrl: fbUser.photoURL ?? null,
        provider: 'google',
        isSignupComplete: !needExtra,
      });

      if (needExtra) {
        sendSlackMessage(`✅ [LoginPromptModal] 구글 1차 성공 → 추가정보 입력 필요 (${fbUser.email})`);
        setAccountEmail(fbUser.email);
        setShowExtraModal(true);
      } else {
        sendSlackMessage(`🎉 [LoginPromptModal] 구글 로그인 완료 (${fbUser.email})`);
        // useEffect가 onClose 처리
        onClose();
      }
    } catch (err) {
      console.error('[LoginPromptModal] Google login error:', err);
      sendSlackMessage(`❌ [LoginPromptModal] 구글 로그인 에러 발생`);
      alert('구글 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  /* =========================
   * Kakao 로그인
   * ========================= */
  const handleKakaoLogin = () => {
    // ✅ 슬랙 알림: 버튼 클릭 시
    sendSlackMessage('👉 [LoginPromptModal] 카카오 로그인 버튼 클릭');

    if (typeof window === 'undefined' || !window.Kakao) {
      alert('카카오 SDK 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const kakao = window.Kakao;

    // ✅ 최초 한 번만 init
    if (!kakao.isInitialized()) {
      const key = '79c1a2486d79d909091433229e814d9d';

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
            !!res.ok &&
            !!data &&
            (data.is_signup_complete === false ||
              data.is_signup_complete === undefined);

          // ✅ needExtra여도 user 저장 (새로고침 복원 목적)
          setUser({
            uid: `kakao:${kakaoId}`,
            email,
            name: null,
            photoUrl: null,
            provider: 'kakao',
            isSignupComplete: !needExtra,
          });

          if (needExtra) {
            sendSlackMessage(`✅ [LoginPromptModal] 카카오 1차 성공 → 추가정보 입력 필요 (${email})`);
            setAccountEmail(email);
            setShowExtraModal(true);
          } else {
            sendSlackMessage(`🎉 [LoginPromptModal] 카카오 로그인 완료 (${email})`);
            onClose(); // useEffect가 처리해도 되지만 즉시 닫아도 OK
          }
        } catch (err) {
          console.error('[LoginPromptModal] Kakao login error:', err);
          sendSlackMessage(`❌ [LoginPromptModal] 카카오 로그인 처리 중 에러`);
          alert('카카오 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
          setLoading(false);
        }
      },
      fail: (err: any) => {
        console.error('[LoginPromptModal] Kakao login fail:', err);
        sendSlackMessage(`❌ [LoginPromptModal] 카카오 로그인 실패 (SDK fail)`);
        alert('카카오 로그인에 실패했습니다.');
        setLoading(false);
      },
    });
  };

  const handleExtraComplete = () => {
    sendSlackMessage(`🎉 [LoginPromptModal] 추가 정보 입력 완료`);
    setShowExtraModal(false);
    onClose(); // 온보딩 끝났으니 메인으로
  };

  useEffect(() => {
    if (!initialized) return;
    if (user?.email && user.isSignupComplete === false) {
      setShowExtraModal(true);
    }
  }, [initialized, user?.email, user?.isSignupComplete]);

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
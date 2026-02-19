'use client';

import React, { useEffect, useState, useRef } from 'react';
import s from './LoginPromptModal.module.css';
import { signInWithGoogle } from '@/app/lib/firebase';
import { useUserStore } from '@/app/store/user';
import SignupExtraInfoModal from './SignupExtraInfoModal';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context: 전역 인증 모달
const GA_CTX = { page: 'Shared', section: 'Auth', area: 'LoginModal' } as const;

type LoginPromptModalProps = {
  onClose: () => void;
};

// ✅ 슬랙 전송 유틸 함수
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
  const gaViewSentRef = useRef(false);

  // ✅ (수정) 모달이 마운트될 때 최초 1회만 실행되도록 의존성 정리
  useEffect(() => {
    // 1. 슬랙 알림
    if (!slackSentRef.current && !showExtraModal) {
      sendSlackMessage('👀 [LoginPromptModal] 로그인 유도 팝업이 열렸습니다.');
      slackSentRef.current = true;
    }

    // 2. GA View Event
    if (!gaViewSentRef.current && !showExtraModal) {
        track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View') });
        gaViewSentRef.current = true;
    }
  }, [showExtraModal]);

  // ✅ (통합 및 수정) 유저 상태에 따른 모달 제어 로직
  // 75번 라인과 278번 라인의 중복 로직을 하나로 합쳤습니다.
  useEffect(() => {
    if (!initialized) return;
    if (loading) return;

    // 1. 가입 미완료 상태인 경우 추가정보 모달로 전환
    if (user?.email && user.isSignupComplete === false) {
      setAccountEmail(user.email);
      setShowExtraModal(true);
      return; // 추가 정보 모달을 보여줘야 하므로 여기서 종료
    }

    // 2. 가입이 완료된 유저이거나, 이미 로그인된 상태면 팝업 닫기
    // 단, 추가 정보 입력 중(showExtraModal)에는 닫지 않음
    if (user && user.isSignupComplete !== false && !showExtraModal) {
      onClose();
    }
  }, [initialized, user, user?.email, user?.isSignupComplete, showExtraModal, loading, onClose]);

  // ✅ GA: 닫기 버튼 핸들러
  const handleCloseClick = () => {
    track(gaEvent(GA_CTX, 'Close'), { ui_id: gaUiId(GA_CTX, 'Close') });
    onClose();
  };

  const handleGoogleLogin = async () => {
    sendSlackMessage('👉 [LoginPromptModal] 구글 로그인 버튼 클릭');
    
    // ✅ GA: 구글 로그인 시도
    track(gaEvent(GA_CTX, 'ClickLogin'), { 
        ui_id: gaUiId(GA_CTX, 'ClickLogin'),
        provider: 'google' 
    });

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
      
      const needExtra =
        !!res.ok &&
        !!data &&
        (data.is_signup_complete === false ||
          data.is_signup_complete === undefined);

      // ✅ GA: 로그인 성공
      track(gaEvent(GA_CTX, 'LoginSuccess'), { 
          provider: 'google',
          is_signup_complete: !needExtra 
      });

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
        onClose();
      }
    } catch (err: any) {
      console.error('[LoginPromptModal] Google login error:', err);
      sendSlackMessage(`❌ [LoginPromptModal] 구글 로그인 에러 발생`);
      
      // ✅ GA: 로그인 실패
      track(gaEvent(GA_CTX, 'LoginFailure'), { 
          provider: 'google',
          error_msg: err?.message || 'unknown'
      });
      
      alert('구글 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  /* =========================
   * Kakao 로그인
   * ========================= */
  const handleKakaoLogin = () => {
    sendSlackMessage('👉 [LoginPromptModal] 카카오 로그인 버튼 클릭');

    // ✅ GA: 카카오 로그인 시도
    track(gaEvent(GA_CTX, 'ClickLogin'), { 
        ui_id: gaUiId(GA_CTX, 'ClickLogin'),
        provider: 'kakao' 
    });

    if (typeof window === 'undefined' || !window.Kakao) {
      alert('카카오 SDK 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const kakao = window.Kakao;

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

          const needExtra =
            !!res.ok &&
            !!data &&
            (data.is_signup_complete === false ||
              data.is_signup_complete === undefined);

          // ✅ GA: 로그인 성공
          track(gaEvent(GA_CTX, 'LoginSuccess'), { 
              provider: 'kakao',
              is_signup_complete: !needExtra 
          });

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
            onClose(); 
          }
        } catch (err: any) {
          console.error('[LoginPromptModal] Kakao login error:', err);
          sendSlackMessage(`❌ [LoginPromptModal] 카카오 로그인 처리 중 에러`);
          
          // ✅ GA: 로그인 실패
          track(gaEvent(GA_CTX, 'LoginFailure'), { 
              provider: 'kakao',
              error_msg: err?.message || 'unknown'
          });

          alert('카카오 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
          setLoading(false);
        }
      },
      fail: (err: any) => {
        console.error('[LoginPromptModal] Kakao login fail:', err);
        sendSlackMessage(`❌ [LoginPromptModal] 카카오 로그인 실패 (SDK fail)`);
        
        // ✅ GA: 로그인 실패 (SDK)
        track(gaEvent(GA_CTX, 'LoginFailure'), { 
            provider: 'kakao',
            error_msg: 'sdk_fail'
        });

        alert('카카오 로그인에 실패했습니다.');
        setLoading(false);
      },
    });
  };

  const handleExtraComplete = () => {
    sendSlackMessage(`🎉 [LoginPromptModal] 추가 정보 입력 완료`);
    setShowExtraModal(false);
    onClose(); 
  };

  // ⚠️ 278번 라인에 있던 중복 useEffect는 위쪽의 통합 로직으로 옮기고 삭제했습니다.

  return (
    <>
      {/* 🔻 showExtraModal 이 false일 때만 로그인 모달 렌더링 */}
      {!showExtraModal && (
        <div className={s.loginOverlay} onClick={handleCloseClick}>
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
              data-ga-event="ClickLogin"
              data-ga-id={gaUiId(GA_CTX, 'ClickLogin')}
              data-ga-label="google"
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
              data-ga-event="ClickLogin"
              data-ga-id={gaUiId(GA_CTX, 'ClickLogin')}
              data-ga-label="kakao"
            >
              <span className={s.loginBtnLabel}>카카오로 시작하기</span>
            </button>

            <button
              type="button"
              className={s.loginBack}
              onClick={handleCloseClick}
              disabled={loading}
              data-ga-event="Close"
              data-ga-id={gaUiId(GA_CTX, 'Close')}
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
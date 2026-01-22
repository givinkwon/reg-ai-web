// app/chat/components/LoginPromptModal.tsx
'use client';

import React, { useEffect, useState } from 'react';
import s from './LoginPromptModal.module.css';
import { signInWithGoogle } from '@/app/lib/firebase';
import { useUserStore } from '@/app/store/user';
import SignupExtraInfoModal from './SignupExtraInfoModal';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

type LoginPromptModalProps = {
  onClose: () => void;
};

const GA_CTX = {
  page: 'Chat',
  section: 'Auth',
  component: 'LoginPromptModal',
} as const;

export default function LoginPromptModal({ onClose }: LoginPromptModalProps) {
  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const setUser = useUserStore((st) => st.setUser);

  const [loading, setLoading] = useState(false);

  const [showExtraModal, setShowExtraModal] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // ✅ (view) 모달 노출
  useEffect(() => {
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
    });
  }, []);

  // ✅ (1) 새로고침/복원된 user가 "가입 미완료"면 자동으로 추가정보 모달 오픈
  useEffect(() => {
    if (!initialized) return;
    if (!user?.email) return;

    if (user.isSignupComplete === false) {
      track(gaEvent(GA_CTX, 'AutoOpenExtraInfo'), {
        ui_id: gaUiId(GA_CTX, 'AutoOpenExtraInfo'),
        provider: user.provider ?? '',
      });

      setAccountEmail(user.email);
      setShowExtraModal(true);
    }
  }, [initialized, user?.email, user?.isSignupComplete, user?.provider]);

  // ✅ (2) 가입 완료된 로그인 상태면 자동 close (단, extra modal/로딩 중이면 닫지 않음)
  useEffect(() => {
    if (!initialized) return;
    if (loading) return;
    if (!user) return;

    // extra modal이 떠있으면 닫지 않기
    if (showExtraModal) return;

    // 가입 완료면 닫기
    if (user.isSignupComplete !== false) {
      track(gaEvent(GA_CTX, 'AutoCloseOnLoggedIn'), {
        ui_id: gaUiId(GA_CTX, 'AutoCloseOnLoggedIn'),
        provider: user.provider ?? '',
      });

      onClose();
    }
  }, [initialized, user, showExtraModal, loading, onClose]);

  const handleGoogleLogin = async () => {
    track(gaEvent(GA_CTX, 'ClickGoogle'), {
      ui_id: gaUiId(GA_CTX, 'ClickGoogle'),
    });

    try {
      setLoading(true);
      track(gaEvent(GA_CTX, 'GoogleAuthStart'), {
        ui_id: gaUiId(GA_CTX, 'GoogleAuthStart'),
      });

      const fbUser = await signInWithGoogle();

      if (!fbUser.email) {
        track(gaEvent(GA_CTX, 'GoogleAuthNoEmail'), {
          ui_id: gaUiId(GA_CTX, 'GoogleAuthNoEmail'),
        });
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
        (data.is_signup_complete === false || data.is_signup_complete === undefined);

      track(gaEvent(GA_CTX, 'GoogleUpsertResult'), {
        ui_id: gaUiId(GA_CTX, 'GoogleUpsertResult'),
        ok: !!res.ok,
        need_extra: !!needExtra,
      });

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
        track(gaEvent(GA_CTX, 'OpenExtraInfo'), {
          ui_id: gaUiId(GA_CTX, 'OpenExtraInfo'),
          provider: 'google',
          reason: 'signup_incomplete',
        });

        setAccountEmail(fbUser.email);
        setShowExtraModal(true);
      } else {
        track(gaEvent(GA_CTX, 'LoginComplete'), {
          ui_id: gaUiId(GA_CTX, 'LoginComplete'),
          provider: 'google',
        });

        // useEffect가 onClose 처리
        onClose();
      }
    } catch (err: any) {
      console.error('[LoginPromptModal] Google login error:', err);

      track(gaEvent(GA_CTX, 'GoogleAuthError'), {
        ui_id: gaUiId(GA_CTX, 'GoogleAuthError'),
        name: err?.name ?? '',
        message: err?.message ?? '',
      });

      alert('구글 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
      track(gaEvent(GA_CTX, 'GoogleAuthEnd'), {
        ui_id: gaUiId(GA_CTX, 'GoogleAuthEnd'),
      });
    }
  };

  /* =========================
   * Kakao 로그인
   * ========================= */
  const handleKakaoLogin = () => {
    track(gaEvent(GA_CTX, 'ClickKakao'), {
      ui_id: gaUiId(GA_CTX, 'ClickKakao'),
    });

    if (typeof window === 'undefined' || !(window as any).Kakao) {
      track(gaEvent(GA_CTX, 'KakaoSdkNotReady'), {
        ui_id: gaUiId(GA_CTX, 'KakaoSdkNotReady'),
      });
      alert('카카오 SDK 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const kakao = (window as any).Kakao;

    // ✅ 최초 한 번만 init
    if (!kakao.isInitialized()) {
      const key = '79c1a2486d79d909091433229e814d9d';

      if (!key) {
        track(gaEvent(GA_CTX, 'KakaoMissingKey'), {
          ui_id: gaUiId(GA_CTX, 'KakaoMissingKey'),
        });
        console.error('[Kakao] NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY is not set');
        alert('카카오 설정 오류가 있습니다. 관리자에게 문의해 주세요.');
        return;
      }

      kakao.init(key);

      track(gaEvent(GA_CTX, 'KakaoInit'), {
        ui_id: gaUiId(GA_CTX, 'KakaoInit'),
      });
    }

    setLoading(true);

    track(gaEvent(GA_CTX, 'KakaoAuthStart'), {
      ui_id: gaUiId(GA_CTX, 'KakaoAuthStart'),
    });

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
            track(gaEvent(GA_CTX, 'KakaoNoEmail'), {
              ui_id: gaUiId(GA_CTX, 'KakaoNoEmail'),
            });

            alert('카카오 계정에 이메일 정보가 없습니다. 카카오 설정에서 이메일 제공 동의를 켜 주세요.');
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
            (data.is_signup_complete === false || data.is_signup_complete === undefined);

          track(gaEvent(GA_CTX, 'KakaoUpsertResult'), {
            ui_id: gaUiId(GA_CTX, 'KakaoUpsertResult'),
            ok: !!res.ok,
            need_extra: !!needExtra,
          });

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
            track(gaEvent(GA_CTX, 'OpenExtraInfo'), {
              ui_id: gaUiId(GA_CTX, 'OpenExtraInfo'),
              provider: 'kakao',
              reason: 'signup_incomplete',
            });

            setAccountEmail(email);
            setShowExtraModal(true);
          } else {
            track(gaEvent(GA_CTX, 'LoginComplete'), {
              ui_id: gaUiId(GA_CTX, 'LoginComplete'),
              provider: 'kakao',
            });

            onClose(); // useEffect가 처리해도 되지만 즉시 닫아도 OK
          }
        } catch (err: any) {
          console.error('[LoginPromptModal] Kakao login error:', err);

          track(gaEvent(GA_CTX, 'KakaoAuthError'), {
            ui_id: gaUiId(GA_CTX, 'KakaoAuthError'),
            name: err?.name ?? '',
            message: err?.message ?? '',
          });

          alert('카카오 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
          setLoading(false);
          track(gaEvent(GA_CTX, 'KakaoAuthEnd'), {
            ui_id: gaUiId(GA_CTX, 'KakaoAuthEnd'),
          });
        }
      },
      fail: (err: any) => {
        console.error('[LoginPromptModal] Kakao login fail:', err);

        track(gaEvent(GA_CTX, 'KakaoAuthFail'), {
          ui_id: gaUiId(GA_CTX, 'KakaoAuthFail'),
          name: err?.name ?? '',
          message: err?.error_description ?? err?.message ?? '',
        });

        alert('카카오 로그인에 실패했습니다.');
        setLoading(false);
      },
    });
  };

  const handleExtraComplete = () => {
    track(gaEvent(GA_CTX, 'ExtraInfoComplete'), {
      ui_id: gaUiId(GA_CTX, 'ExtraInfoComplete'),
      provider: user?.provider ?? '',
    });

    setShowExtraModal(false);
    onClose(); // 온보딩 끝났으니 메인으로
  };

  // (기존 유지) 초기화 이후 가입 미완료면 extra 모달 오픈
  useEffect(() => {
    if (!initialized) return;
    if (user?.email && user.isSignupComplete === false) {
      setShowExtraModal(true);
    }
  }, [initialized, user?.email, user?.isSignupComplete]);

  const closeByOverlay = () => {
    track(gaEvent(GA_CTX, 'CloseOverlay'), {
      ui_id: gaUiId(GA_CTX, 'CloseOverlay'),
    });
    onClose();
  };

  const closeByBack = () => {
    track(gaEvent(GA_CTX, 'ClickBack'), {
      ui_id: gaUiId(GA_CTX, 'ClickBack'),
    });
    onClose();
  };

  return (
    <>
      {/* 🔻 showExtraModal 이 false일 때만 로그인 모달 렌더링 */}
      {!showExtraModal && (
        <div
          className={s.loginOverlay}
          onClick={closeByOverlay}
          data-ga-event={gaEvent(GA_CTX, 'Overlay')}
          data-ga-id={gaUiId(GA_CTX, 'Overlay')}
        >
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
              data-ga-event={gaEvent(GA_CTX, 'ClickGoogle')}
              data-ga-id={gaUiId(GA_CTX, 'ClickGoogle')}
            >
              <span className={s.loginBtnLabel}>{loading ? '로그인 중...' : '구글로 시작하기'}</span>
            </button>

            <button
              type="button"
              className={s.loginBtnKakao}
              onClick={handleKakaoLogin}
              disabled={loading}
              data-ga-event={gaEvent(GA_CTX, 'ClickKakao')}
              data-ga-id={gaUiId(GA_CTX, 'ClickKakao')}
            >
              <span className={s.loginBtnLabel}>카카오로 시작하기</span>
            </button>

            <button
              type="button"
              className={s.loginBack}
              onClick={closeByBack}
              disabled={loading}
              data-ga-event={gaEvent(GA_CTX, 'ClickBack')}
              data-ga-id={gaUiId(GA_CTX, 'ClickBack')}
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

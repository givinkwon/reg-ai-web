'use client';

import { useEffect, useState } from 'react';
import styles from './SignupExtraInfoModal.module.css';
import { useUserStore } from '@/app/store/user';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context
const GA_CTX = { page: 'Shared', section: 'Auth', area: 'SignupExtraModal' } as const;

type Props = {
  email: string;
  onComplete: () => void;
};

export default function SignupExtraInfoModal({ email, onComplete }: Props) {
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);

  const user = useUserStore((st) => st.user);
  const setUser = useUserStore((st) => st.setUser);

  // ✅ GA View 추적 (1회)
  useEffect(() => {
    track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View') });
  }, []);

  // 유효성 검사: 회사명 AND 전화번호 모두 필수
  const formValid = company.trim().length > 0 && phone.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ GA: 제출 시도
    track(gaEvent(GA_CTX, 'ClickSubmit'), {
        ui_id: gaUiId(GA_CTX, 'ClickSubmit'),
        company_len: company.length,
        phone_len: phone.length, // (선택사항) 전화번호 길이도 로깅하고 싶다면 추가
    });

    try {
      setLoading(true);

      // 1) secondary info 저장 + mark_complete
      const res = await fetch('/api/accounts/update-secondary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          secondary_info: {
            phone,
            company,
            // 나머지 필드 제거됨
          },
          mark_complete: true,
        }),
      });

      if (!res.ok) {
        console.error('update-secondary error', res.status);
        throw new Error('update failed');
      }

      // 2) 서버에서 계정 다시 읽어서 store 갱신
      try {
        const res2 = await fetch('/api/accounts/find-by-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (res2.ok) {
          const acc = await res2.json();
          const provider = acc.google_id
            ? 'google'
            : acc.kakao_id
            ? 'kakao'
            : 'local';

          const nextUid =
            user?.uid ??
            (acc.google_id
              ? `google:${acc.google_id}`
              : acc.kakao_id
              ? `kakao:${acc.kakao_id}`
              : acc.account_id);

          setUser({
            uid: nextUid,
            email: acc.email ?? email ?? null,
            name: acc.name ?? null,
            photoUrl: acc.picture ?? null,
            provider,
            isSignupComplete: true, 
          } as const);
        } else {
          if (user) {
            setUser({ ...user, isSignupComplete: true });
          }
        }
      } catch (e) {
        console.error('[SignupExtraInfoModal] refresh user error:', e);
        if (user) {
          setUser({ ...user, isSignupComplete: true });
        }
      }

      // ✅ GA: 가입 완료(성공)
      track(gaEvent(GA_CTX, 'SignupComplete'), {
          ui_id: gaUiId(GA_CTX, 'SignupComplete'),
      });

      onComplete();
    } catch (err: any) {
      console.error(err);
      
      // ✅ GA: 가입 에러
      track(gaEvent(GA_CTX, 'SignupError'), {
          ui_id: gaUiId(GA_CTX, 'SignupError'),
          error_msg: err.message || 'unknown'
      });

      alert('정보 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h3 className={styles.title}>회원 정보 입력</h3>
        <p className={styles.subtitle}>추가 정보를 입력해 주세요.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span>회사명 *</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="회사명"
              required
            />
          </label>

          <label className={styles.field}>
            {/* 시각적으로 필수임을 표시 (*) */}
            <span>연락처 *</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="전화번호"
              // 브라우저 폼 검증을 위한 required 추가
              required
            />
          </label>

          <button
            type="submit"
            className={styles.submit}
            // 둘 다 값이 있어야만 버튼 활성화
            disabled={loading || !formValid}
            data-ga-event="ClickSubmit"
            data-ga-id={gaUiId(GA_CTX, 'ClickSubmit')}
          >
            {loading ? '제출 중...' : '제출하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
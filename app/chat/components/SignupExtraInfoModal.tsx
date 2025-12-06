// app/chat/components/SignupExtraInfoModal.tsx
'use client';

import { useState } from 'react';
import styles from './SignupExtraInfoModal.module.css';
import { useUserStore } from '@/app/store/user';

type Props = {
  email: string;
  onComplete: () => void;
};

export default function SignupExtraInfoModal({ email, onComplete }: Props) {
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [position, setPosition] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);

  // 이미 로그인돼 있는 경우가 대부분이지만,
  // 혹시 모를 경우를 위해 fallback 으로 userStore 도 가져온다.
  const user = useUserStore((st) => st.user);
  const setUser = useUserStore((st) => st.setUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      // 1) 추가 정보 저장 + is_signup_complete = true
      const res = await fetch('/api/accounts/update-secondary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          secondary_info: {
            phone,
            company,
            employee_count: employeeCount,
            position,
            website,
          },
          mark_complete: true, // 🔹 온보딩 완료 플래그
        }),
      });

      if (!res.ok) {
        console.error('update-secondary error', res.status);
        alert('정보 저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
        return;
      }

      // 2) 혹시 아직 userStore 에 로그인 정보가 없다면
      //    백엔드에서 계정 정보를 한 번 더 읽어서 userStore 에 세팅 (fallback)
      if (!user && email) {
        try {
          const res2 = await fetch('/api/accounts/find-by-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });

          if (res2.ok) {
            const acc = await res2.json();

            // google / kakao 구분해서 uid / provider 세팅
            const provider =
              acc.google_id ? 'google' : acc.kakao_id ? 'kakao' : 'local';

            const simpleUser = {
              uid: acc.google_id
                ? `google:${acc.google_id}`
                : acc.kakao_id
                ? `kakao:${acc.kakao_id}`
                : acc.account_id,
              email: acc.email ?? null,
              name: acc.name ?? null,
              photoUrl: acc.picture ?? null,
              provider,
            } as const;

            setUser(simpleUser);
          }
        } catch (e) {
          console.error('[SignupExtraInfoModal] ensure-login error:', e);
          // 로그인 보정 실패해도 치명적이진 않으니 알림만 로그로 남김
        }
      }

      // 3) 부모에게 "온보딩 완료" 알리기 (모달 닫기 등)
      onComplete();
    } catch (err) {
      console.error(err);
      alert('정보 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h3 className={styles.title}>회원 정보 입력</h3>
        <p className={styles.subtitle}>거의 다 왔어요!</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span>연락처</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="전화번호"
            />
          </label>

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
            <span>상시 근로자 수 *</span>
            <input
              value={employeeCount}
              onChange={(e) => setEmployeeCount(e.target.value)}
              placeholder="상시 근로자 수"
              required
            />
          </label>

          <label className={styles.field}>
            <span>직책 *</span>
            <input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="직책"
              required
            />
          </label>

          <label className={styles.field}>
            <span>회사 웹사이트</span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="웹사이트 주소"
            />
          </label>

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? '제출 중...' : '제출하기'}
          </button>
        </form>
      </div>
    </div>
  );
}

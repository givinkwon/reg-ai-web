'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '../../store/user';
import GoogleButton from './GoogleButton';
import GoogleLogoutButton from './GoogleLogoutButton'; // ✅ 새로 추가
import BackButton from './BackButton';
import styles from './Header.module.css';

export default function Header() {
  const email = useUserStore((state) => state.userInfo.email);
  const displayName = useUserStore((state) => state.userInfo.displayName);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className={styles.header}>
      <BackButton />
      {mounted && (
        <div className={styles.userInfo}>
          {email ? (
            <>
              <span>👤 {displayName || email}</span>
              <GoogleLogoutButton /> {/* ✅ 로그아웃 버튼 */}
            </>
          ) : (
            <GoogleButton />
          )}
        </div>
      )}
    </div>
  );
}

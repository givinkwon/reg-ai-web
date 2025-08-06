'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '../../store/user';
import GoogleButton from './GoogleButton';
import BackButton from './BackButton';
import styles from './Header.module.css';

export default function Header() {
  const email = useUserStore((state) => state.userInfo.email);
  const displayName = useUserStore((state) => state.userInfo.displayName);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // ✅ hydration mismatch 방지
  }, []);

  return (
    <div className={styles.header}>
      <BackButton />
      {mounted && (
        <div className={styles.userInfo}>
          {email ? (
            <span>👤 {displayName || email}</span>
          ) : (
            <GoogleButton />
          )}
        </div>
      )}
    </div>
  );
}

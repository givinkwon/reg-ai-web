'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '../../store/user';
import GoogleButton from './GoogleButton';
import GoogleLogoutButton from './GoogleLogoutButton';
import BackButton from './BackButton';
import styles from './Header.module.css';

export default function Header() {
  const email = useUserStore((state) => state.userInfo.email);
  const displayName = useUserStore((state) => state.userInfo.displayName);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <div className={styles.header}>
      <BackButton />

      {mounted && (
        <>
          <div className={styles.desktopUserInfo}>
            {email ? (
              <>
                <span>👤 {displayName || email}</span>
                <GoogleLogoutButton />
              </>
            ) : (
              <GoogleButton />
            )}
          </div>

          <div className={styles.mobileMenuIcon} onClick={toggleMenu}>
            ☰
          </div>

          {menuOpen && (
            <div className={styles.mobileMenu}>
              {email ? (
                <>
                  <span>👤 {displayName || email}</span>
                  <GoogleLogoutButton />
                </>
              ) : (
                <GoogleButton />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

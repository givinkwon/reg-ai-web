'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, ShieldCheck, User, LogOut, Loader2, ChevronRight } from 'lucide-react';

// ✅ UI 컴포넌트
import { Button } from '@/app/components/ui/button'; 
import s from './Navbar.module.css';

// ✅ Store 임포트
import { useUserStore, initUserStore } from '@/app/store/user';
import { useChatStore } from '@/app/store/chat';

// ✅ 로그인 모달
import LoginPromptModal from '@/app/docs/components/LoginPromptModal';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context: 전역 헤더이므로 'Shared' 페이지로 분류
const GA_CTX = { page: 'Shared', section: 'Header', area: 'Navigation' } as const;

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ✅ Store 상태 가져오기
  const user = useUserStore((state) => state.user);
  const initialized = useUserStore((state) => state.initialized);
  const logout = useUserStore((state) => state.logout);
  
  const { showLoginModal, setShowLoginModal } = useChatStore();

  // ✅ 페이지 로드 시 유저 스토어 초기화
  useEffect(() => {
    initUserStore();
  }, []);

  // ✅ 유저 이름 표시 로직
  const displayName = user?.name || user?.email?.split('@')[0] || '사용자';

  const NAV_LINKS = [
    { name: '문서함', href: '/docs/docs-box' },
    { name: '위험성평가', href: '/docs/risk-assessment' },
    { name: 'TBM', href: '/docs/tbm' },
    { name: '순회점검표', href: '/docs/monthly-inspection' },
  ];

  const isActive = (path: string) => pathname === path;

  // ✅ GA: 로그아웃 핸들러
  const handleLogout = async () => {
    track(gaEvent(GA_CTX, 'ClickLogout'), {
      ui_id: gaUiId(GA_CTX, 'ClickLogout'),
      user_email: user?.email
    });

    try {
      await logout();
      setMobileMenuOpen(false); 
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // ✅ GA: 모바일 메뉴 토글 핸들러
  const toggleMobileMenu = () => {
    const nextState = !mobileMenuOpen;
    track(gaEvent(GA_CTX, 'ToggleMobileMenu'), {
      ui_id: gaUiId(GA_CTX, 'ToggleMobileMenu'),
      state: nextState ? 'open' : 'close'
    });
    setMobileMenuOpen(nextState);
  };

  // ✅ GA: 메뉴 클릭 핸들러 (공통)
  const handleMenuClick = (name: string, href: string, isMobile: boolean) => {
    track(gaEvent(GA_CTX, 'ClickMenu'), {
      ui_id: gaUiId(GA_CTX, 'ClickMenu'),
      menu_name: name,
      link_url: href,
      device_type: isMobile ? 'mobile' : 'desktop'
    });

    if (isMobile) setMobileMenuOpen(false);
  };

  // ✅ GA: 로그인 버튼 핸들러
  const handleLoginClick = (source: 'desktop' | 'mobile') => {
    track(gaEvent(GA_CTX, 'ClickLogin'), {
      ui_id: gaUiId(GA_CTX, 'ClickLogin'),
      source_view: source
    });
    setShowLoginModal(true);
    if (source === 'mobile') setMobileMenuOpen(false);
  };

  // ✅ GA: 회원가입 버튼 핸들러
  const handleSignupClick = (source: 'desktop' | 'mobile') => {
    track(gaEvent(GA_CTX, 'ClickSignup'), {
      ui_id: gaUiId(GA_CTX, 'ClickSignup'),
      source_view: source
    });
    if (source === 'mobile') setMobileMenuOpen(false);
  };

  return (
    <>
      <nav className={s.nav}>
        <div className={s.container}>
          {/* 로고 */}
          <Link 
            href="/" 
            className={s.logo} 
            onClick={() => {
                track(gaEvent(GA_CTX, 'ClickLogo'), { ui_id: gaUiId(GA_CTX, 'ClickLogo') });
                setMobileMenuOpen(false);
            }}
          >
            <ShieldCheck size={28} className={s.logoIcon} />
            <span className={s.logoText}>RegAI</span>
          </Link>

          {/* 데스크톱 메뉴 */}
          <div className={s.desktopMenu}>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`${s.navLink} ${isActive(link.href) ? s.active : ''}`}
                onClick={() => handleMenuClick(link.name, link.href, false)}
                data-ga-event="ClickMenu"
                data-ga-label={link.name}
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* 우측 액션 버튼 영역 (데스크톱 전용) */}
          <div className={s.actions}>
            {!initialized ? (
              <div className={s.loadingBox}>
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            ) : user ? (
              <div className={s.loggedInBox}>
                <div className={s.userInfo} title={displayName}>
                  <User size={16} style={{ flexShrink: 0 }} />
                  <span className={s.userName}>{displayName}님</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={s.logoutBtn} 
                  onClick={handleLogout}
                  data-ga-event="ClickLogout"
                >
                  <LogOut size={16} className="mr-1" style={{ flexShrink: 0 }} />
                  로그아웃
                </Button>
              </div>
            ) : (
              <div className={s.loggedOutBox}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={s.loginBtn}
                  onClick={() => handleLoginClick('desktop')}
                  data-ga-event="ClickLogin"
                >
                  로그인
                </Button>
                <Link href="/signup" onClick={() => handleSignupClick('desktop')}>
                  <Button size="sm" className={s.trialBtn} data-ga-event="ClickSignup">
                    가입하기
                  </Button>
                </Link>
              </div>
            )}

            {/* 모바일 토글 버튼 */}
            <button 
                className={s.mobileToggle} 
                onClick={toggleMobileMenu} 
                aria-label="메뉴 토글"
                data-ga-event="ToggleMobileMenu"
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* ✅ 모바일 메뉴 드롭다운 */}
        {mobileMenuOpen && (
          <div className={s.mobileMenu}>
            <div className={s.mobileNavLinks}>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${s.mobileLink} ${isActive(link.href) ? s.mobileActive : ''}`}
                  onClick={() => handleMenuClick(link.name, link.href, true)}
                >
                  {link.name}
                  <ChevronRight size={16} className={s.mobileLinkIcon} />
                </Link>
              ))}
            </div>

            <div className={s.mobileActions}>
              {!initialized ? (
                <Loader2 size={24} className="animate-spin text-gray-400 mx-auto" />
              ) : user ? (
                <div className={s.mobileUserBox}>
                  <div className={s.mobileUserInfo}>
                    <User size={18} />
                    <span>{displayName}님 반갑습니다.</span>
                  </div>
                  <Button 
                    onClick={handleLogout} 
                    variant="outline" 
                    className={s.mobileFullBtn}
                  >
                    <LogOut size={16} className="mr-2" />
                    로그아웃
                  </Button>
                </div>
              ) : (
                <div className={s.mobileGuestBox}>
                  <Button 
                    onClick={() => handleLoginClick('mobile')}
                    variant="outline" 
                    className={s.mobileFullBtn}
                  >
                    로그인
                  </Button>
                  <Link 
                    href="/signup" 
                    onClick={() => handleSignupClick('mobile')} 
                    style={{ width: '100%' }}
                  >
                    <Button className={`${s.mobileFullBtn} ${s.trialBtn}`}>
                      무료로 시작하기
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {showLoginModal && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
    </>
  );
}
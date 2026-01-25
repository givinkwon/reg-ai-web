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
import LoginPromptModal from '@/app/chat/components/LoginPromptModal';

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

  const handleLogout = async () => {
    try {
      await logout();
      setMobileMenuOpen(false); // 로그아웃 시 메뉴 닫기
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);

  return (
    <>
      <nav className={s.nav}>
        {/* ✅ container: max-width 1200px 중앙 정렬 적용 대상 */}
        <div className={s.container}>
          {/* 로고 */}
          <Link href="/" className={s.logo} onClick={() => setMobileMenuOpen(false)}>
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
                  onClick={() => setShowLoginModal(true)}
                >
                  로그인
                </Button>
                <Link href="/signup">
                  <Button size="sm" className={s.trialBtn}>
                    가입하기
                  </Button>
                </Link>
              </div>
            )}

            {/* 모바일 토글 버튼 */}
            <button className={s.mobileToggle} onClick={toggleMobileMenu} aria-label="메뉴 토글">
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
                  onClick={() => setMobileMenuOpen(false)} // 클릭 시 메뉴 닫기
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
                    onClick={() => {
                      setShowLoginModal(true);
                      setMobileMenuOpen(false);
                    }} 
                    variant="outline" 
                    className={s.mobileFullBtn}
                  >
                    로그인
                  </Button>
                  <Link href="/signup" onClick={() => setMobileMenuOpen(false)} style={{ width: '100%' }}>
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
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, ShieldCheck, User, LogOut, Loader2 } from 'lucide-react'; // Loader2 추가

// ✅ UI 컴포넌트
import { Button } from '@/app/components/ui/button'; 
import s from './Navbar.module.css';

// ✅ Store 임포트
import { useUserStore, initUserStore } from '@/app/store/user'; // initUserStore 추가
import { useChatStore } from '@/app/store/chat';

// ✅ 로그인 모달
import LoginPromptModal from '@/app/chat/components/LoginPromptModal';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ✅ Store 상태 가져오기
  const user = useUserStore((state) => state.user);
  const initialized = useUserStore((state) => state.initialized); // 초기화 완료 여부
  const logout = useUserStore((state) => state.logout);
  
  const { showLoginModal, setShowLoginModal } = useChatStore();

  // ✅ [중요] 페이지 로드(새로고침) 시 유저 스토어 초기화
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
        <div className={s.container}>
          {/* 로고 */}
          <Link href="/" className={s.logo} onClick={() => setMobileMenuOpen(false)}>
            <ShieldCheck size={28} className={s.logoIcon} />
            <span className={s.logoText}>SafetyLink</span>
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

          {/* 우측 액션 버튼 영역 */}
          <div className={s.actions}>
            {!initialized ? (
              // ✅ 초기 로딩 중 (새로고침 시 로그인 정보를 가져오는 짧은 순간)
              <div className={s.loadingBox}>
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            ) : user ? (
              // ✅ 로그인 상태
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
              // ✅ 로그아웃 상태
              <>
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
              </>
            )}

            {/* 모바일 토글 */}
            <button className={s.mobileToggle} onClick={toggleMobileMenu}>
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* 모바일 메뉴 생략 (데스크톱과 동일한 분기 로직 적용 권장) */}
        {mobileMenuOpen && (
          <div className={s.mobileMenu}>
             {/* ...기존 모바일 링크 생략... */}
             <div className={s.mobileActions}>
                {!initialized ? null : user ? (
                   <Button onClick={handleLogout} variant="outline" className={s.mobileFullBtn}>로그아웃</Button>
                ) : (
                   <Button onClick={() => setShowLoginModal(true)} variant="outline" className={s.mobileFullBtn}>로그인</Button>
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
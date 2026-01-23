'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Menu, X, ShieldCheck, User, LogOut } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './Navbar.module.css';

// ✅ Store 임포트 (경로는 프로젝트 구조에 맞게 수정해주세요)
import { useUserStore } from '../../store/user';
import { useChatStore } from '../../store/chat';

// ✅ 로그인 모달 컴포넌트 임포트 (Navbar에서도 모달을 렌더링해야 할 경우)
// 만약 모달이 최상위 Layout이나 Page에서 렌더링되고 있다면 여기선 트리거만 하면 됩니다.
// 보통 Navbar에서 직접 렌더링하기보다 상태만 변경하는 것이 좋습니다.

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ✅ Store 상태 가져오기
  const user = useUserStore((state) => state.user);
  const logout = useUserStore((state) => state.logout); // logout 함수가 store에 있다고 가정
  const { setShowLoginModal } = useChatStore();

  // 메뉴 정의
  const NAV_LINKS = [
    { name: '문서함', href: '/docs/docs-box' },
    { name: '위험성평가', href: '/docs/risk-assessment' },
    { name: 'TBM', href: '/docs/tbm' },
    { name: '순회점검표', href: '/docs/monthly-inspection' },
  ];

  const isActive = (path: string) => pathname === path;

  // ✅ 로그아웃 핸들러
  const handleLogout = () => {
    // 만약 store에 logout 함수가 없다면 아래 로직 사용
    // localStorage.removeItem('sl_user');
    // useUserStore.setState({ user: null });
    
    if (logout) {
        logout();
    } else {
        // Fallback: 직접 상태 초기화 (store에 action이 없는 경우)
        useUserStore.setState({ user: null });
    }
    alert('로그아웃 되었습니다.');
  };

  return (
    <nav className={s.nav}>
      <div className={s.container}>
        {/* 로고 영역 */}
        <Link href="/" className={s.logo}>
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

        {/* 우측 액션 */}
        <div className={s.actions}>
          {user ? (
            // ✅ 로그인 됨: 유저 정보 표시 및 로그아웃
            <div className={s.loggedInBox}>
              <div className={s.userInfo}>
                <User size={16} />
                <span className={s.userName}>{user.name || user.email?.split('@')[0]}님</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className={s.logoutBtn} 
                onClick={handleLogout}
              >
                <LogOut size={16} className="mr-1" />
                로그아웃
              </Button>
            </div>
          ) : (
            // ✅ 로그인 안 됨: 로그인 모달 열기 및 가입 버튼
            <>
              <Button 
                variant="ghost" 
                size="sm" 
                className={s.loginBtn}
                onClick={() => setShowLoginModal(true)} // ✅ Store 상태 변경으로 모달 오픈
              >
                로그인
              </Button>
              
              {/* 가입하기는 별도 페이지로 이동하거나, 회원가입 모달을 띄울 수 있음 */}
              <Link href="/signup"> 
                <Button size="sm" className={s.trialBtn}>
                  가입하기
                </Button>
              </Link>
            </>
          )}
          
          {/* 모바일 햄버거 버튼 */}
          <button 
            className={s.mobileToggle}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* 모바일 메뉴 드롭다운 */}
      {mobileMenuOpen && (
        <div className={s.mobileMenu}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={s.mobileLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.name}
            </Link>
          ))}
          
          <div className={s.mobileActions}>
            {user ? (
              <Button onClick={handleLogout} className={s.mobileFullBtn} variant="outline">
                로그아웃
              </Button>
            ) : (
              <>
                <Button 
                    onClick={() => {
                        setShowLoginModal(true);
                        setMobileMenuOpen(false); // 모바일 메뉴 닫기
                    }} 
                    variant="outline" 
                    className={s.mobileFullBtn}
                >
                    로그인
                </Button>
                <Link href="/signup" className="w-full">
                  <Button className={s.mobileFullBtn}>가입하기</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
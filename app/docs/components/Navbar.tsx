'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/button'; // 기존 버튼 컴포넌트 활용
import s from './Navbar.module.css';

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 메뉴 정의
  const NAV_LINKS = [
    { name: '도구함', href: '/docs/tools' },
    { name: '위험성평가', href: '/docs/risk-assessment' },
    { name: 'TBM', href: '/docs/tbm' },
    { name: '순회점검', href: '/docs/monthly-inspection' },
  ];

  const isActive = (path: string) => pathname === path;

  return (
    <nav className={s.nav}>
      <div className={s.container}>
        {/* 로고 영역 */}
        <Link href="/chat" className={s.logo}>
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

        {/* 우측 액션 (로그인/설정 등) */}
        <div className={s.actions}>
          <Button variant="ghost" size="sm" className={s.loginBtn}>
            로그인
          </Button>
          <Button size="sm" className={s.trialBtn}>
            무료 체험
          </Button>
          
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
        </div>
      )}
    </nav>
  );
}
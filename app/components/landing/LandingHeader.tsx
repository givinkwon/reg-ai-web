'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import s from './LandingHeader.module.css';

export default function LandingHeader() {
  const router = useRouter();

  const goChat = () => router.push('/chat');

  const goLogin = () => {
    // ✅ 로그인 성공 후 /chat으로 보내기 위해 next 파라미터 사용
    router.push('/login?next=/chat');
  };

  return (
    <header className={s.wrap}>
      <div className={s.inner}>
        {/* Left: Logo */}
        <Link href="/" className={s.logoArea} aria-label="RegAI Home">
          <div className={s.logo}>REG AI</div>
          {/* <div className={s.logoSub}>산업안전 · 보건 실무 AI</div> */}
        </Link>

        {/* Center: Nav */}
        <nav className={s.nav}>
          {/* <a className={s.navLink} href="#features">
            기능
          </a> */}
          {/* <a className={s.navLink} href="#contact">
            도입문의
          </a> */}
        </nav>

        {/* Right: Actions */}
        <div className={s.actions}>
          {/* <button className={s.loginBtn} onClick={goLogin}>
            로그인
          </button> */}

          <button className={s.primaryBtn} onClick={goChat}>
            바로 사용하기
          </button>
        </div>
      </div>
    </header>
  );
}

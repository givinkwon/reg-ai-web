'use client';

import { useUserStore } from '../../store/user';

export default function GoogleLogoutButton() {
  const setUserInfo = useUserStore((state) => state.setUserInfo);

  const handleLogout = () => {
    // ✅ 로그아웃 처리 로직 (예: 구글 토큰 제거 + 상태 초기화)
    setUserInfo({ email: '', displayName: '' });
    localStorage.removeItem('user'); // 예시로 로컬스토리지도 초기화
  };

  return (
    <button onClick={handleLogout} style={{
      padding: '0.4rem 0.8rem',
      fontSize: '0.85rem',
      background: '#e74c3c',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    }}>
      로그아웃
    </button>
  );
}

// app/chat/page.tsx
'use client';

import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import RightPanel from './components/RightPannel';
import { useChatStore } from '../store/chat';
import { useUserStore } from '../store/user';             // ← 이미 쓰시던 유저 스토어
import Cookies from 'js-cookie';
import { useEffect, useState } from 'react';
import s from './page.module.css';

const JOBS = [
  { id: 'environment', label: '환경/안전', emoji: '🌱' },
  { id: 'infosec',     label: '정보보안/컴플라이언스', emoji: '🛡️' },
];

export default function ChatPage() {
  const { sidebarMobileOpen, setSidebarMobileOpen } = useChatStore();
  const { selectedJobType, setSelectedJobType } = useUserStore();
  const [showTypeModal, setShowTypeModal] = useState(false);

  // 쿠키 → 스토어 하이드레이션 & 미선택 시 팝업
  useEffect(() => {
    const saved = Cookies.get('selectedJobType') as string | undefined;
    if (saved) {
      setSelectedJobType(saved);
      setShowTypeModal(false);
    } else {
      setShowTypeModal(true);
    }
  }, [setSelectedJobType]);

  const choose = (id: string) => {
    Cookies.set('selectedJobType', id, { expires: 7 });
    setSelectedJobType(id);
    setShowTypeModal(false);
  };

  return (
    <div className={s.shell}>
      {/* 모바일 오버레이 */}
      {sidebarMobileOpen && (
        <>
          <div className={s.overlay} onClick={() => setSidebarMobileOpen(false)} />
          <div className={s.sideFloat}>
            <Sidebar />
          </div>
        </>
      )}

      {/* 데스크톱 사이드바 */}
      <div className={s.sideDesktop}>
        <Sidebar />
      </div>

      {/* 본문 */}
      <div className={s.main}>
        <ChatArea />
      </div>

      {/* 오른쪽 근거 패널 */}
      <div className={s.rightDesktop}>
        <RightPanel />
      </div>

      {/* 타입 선택 모달 (미선택 시) */}
      {showTypeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="분야 선택"
          className={s.typeModalOverlay}
          onClick={() => setShowTypeModal(false)}
        >
          <div className={s.typeModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={s.typeTitle}>어떤 분야의 규제 정보를 찾으세요?</h3>
            <div className={s.typeGrid}>
              {JOBS.map((j) => (
                <button key={j.id} className={s.typeCard} onClick={() => choose(j.id)}>
                  <span className={s.typeEmoji}>{j.emoji}</span>
                  <span className={s.typeLabel}>{j.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

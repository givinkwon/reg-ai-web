// app/chat/page.tsx
'use client';

import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import RightPanel from './components/RightPannel';
import { useChatStore } from '../store/chat';
import s from './page.module.css';

export default function ChatPage() {
  const { sidebarMobileOpen, setSidebarMobileOpen } = useChatStore();

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
    </div>
  );
}

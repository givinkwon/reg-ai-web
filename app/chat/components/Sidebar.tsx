'use client';

import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Home,
  Folder,
  X,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import s from './Sidebar.module.css';
import { useChatStore } from '../../store/chat';
import { useUserStore } from '../../store/user';
import { useRouter } from 'next/navigation';

export default function Sidebar() {
  const user = useUserStore((st) => st.user);

  const {
    rooms,
    activeRoomId,
    setActiveRoom,
    deleteRoom,
    createRoom,
    collapsed,
    setCollapsed,
    setMainView,
    setShowLoginModal,

    // ✅ 오버레이 열림/닫힘 (스토어에 있어야 함)
    sidebarMobileOpen,
    setSidebarMobileOpen,
  } = useChatStore();

  const router = useRouter();

  /**
   * ✅ 모바일+태블릿(컴팩트) 판별
   * - 기존: max-width: 768px (mobile)
   * - 변경: max-width: 1024px (tablet 포함)
   */
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const sync = () => setIsCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // ✅ 컴팩트(모바일/태블릿)에서는 collapsed 상태가 적용되지 않게 강제로 풀어줌
  useEffect(() => {
    if (isCompact && collapsed) setCollapsed(false);
  }, [isCompact, collapsed, setCollapsed]);

  const toggleCollapse = () => setCollapsed(!collapsed);
  const handleLogoClick = () => router.push('/');

  const closeCompactOverlay = () => {
    if (isCompact && sidebarMobileOpen) setSidebarMobileOpen(false);
  };

  const handleHomeClick = () => {
    closeCompactOverlay();

    try {
      // @ts-ignore
      useChatStore.persist?.clearStorage?.();
    } catch {}

    window.location.assign('/chat');
  };

  const handleDocsClick = () => {
    if (!user?.email) {
      alert('로그인해야 내 문서함을 볼 수 있어요.');
      setShowLoginModal(true);
      return;
    }
    setMainView('docs');
    closeCompactOverlay();
  };

  return (
    // ✅ 컴팩트(모바일/태블릿)에서는 collapsed 클래스 적용 금지
    <aside className={`${s.wrap} ${!isCompact && collapsed ? s.collapsed : ''}`}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleRow}>
          {/* 로고 */}
          {!(!isCompact && collapsed) && (
            <div className={s.brand}>
              <img
                data-ga-id="Chat:Sidebar:ClickLogo"
                onClick={handleLogoClick}
                src="/logo.png"
                className={s.fav}
                alt="REG AI"
              />
            </div>
          )}

          {/* ✅ 데스크톱(>=1025px): 접기/펼치기 버튼 */}
          {!isCompact && (
            <button
              data-ga-id={collapsed ? 'Chat:Sidebar:ExpandCollapse' : 'Chat:Sidebar:MinimizeCollapse'}
              onClick={toggleCollapse}
              className={s.collapseBtn}
              aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
            >
              {collapsed ? (
                <ChevronRight size={16} strokeWidth={2} color="#fff" style={{ width: 16, height: 16 }} />
              ) : (
                <ChevronLeft size={16} strokeWidth={2} color="#fff" style={{ width: 16, height: 16 }} />
              )}
            </button>
          )}

          {/* ✅ 컴팩트(모바일/태블릿): 닫기(X) 버튼 (overlay 닫기) */}
          {isCompact && (
            <button
              type="button"
              data-ga-id="Chat:Sidebar:Close"
              className={s.mobileCloseBtn}
              onClick={() => setSidebarMobileOpen(false)}
              aria-label="사이드바 닫기"
              title="닫기"
            >
              <X className={s.mobileCloseIcon} />
            </button>
          )}
        </div>

        {/* Nav */}
        <div className={s.nav}>
          <div
            className={s.navItem}
            role="button"
            data-ga-id="Chat:Sidebar:OpenHome"
            tabIndex={0}
            onClick={handleHomeClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHomeClick()}
          >
            <div className={s.navLeft}>
              <Home className={s.iconSm} />
              {!(!isCompact && collapsed) && <span className={s.navText}>Home</span>}
            </div>
          </div>

          <div
            className={s.navItem}
            role="button"
            data-ga-id="Chat:Sidebar:OpenDocs"
            tabIndex={0}
            onClick={handleDocsClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleDocsClick()}
          >
            <div className={s.navLeft}>
              <Folder className={s.iconSm} />
              {!(!isCompact && collapsed) && <span className={s.navText}>문서함</span>}
            </div>
          </div>
        </div>
      </div>

      <div className={s.divider} />

      {/* Chat list */}
      <div className={s.listArea}>
        {rooms.map((r) => {
          const active = r.id === activeRoomId;
          return (
            <div
              key={r.id}
              className={`${s.chatItem} ${active ? s.chatActive : ''}`}
              data-ga-id="Chat:Sidebar:OpenRoom"
              data-ga-label={r.title || '새 대화'}
              onClick={() => {
                setMainView('chat');
                setActiveRoom(r.id);
                closeCompactOverlay(); // ✅ 컴팩트에서 대화 선택하면 sidebar 닫힘
              }}
            >
              <MessageSquare className={active ? s.iconSmAccent : s.iconSmMuted} />
              <span className={s.chatText}>{r.title || '새 대화'}</span>

              {active && !(!isCompact && collapsed) && (
                <button
                  data-ga-id="Chat:Sidebar:DeleteRoom"
                  data-ga-label={r.title || '새 대화'}
                  className={s.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRoom(r.id);
                  }}
                  aria-label="대화 삭제"
                >
                  <Trash2 className={s.iconXsMuted} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* New chat */}
      <div className={s.footer}>
        <Button
          className={s.startBtn}
          onClick={() => {
            setMainView('chat');
            createRoom();
            closeCompactOverlay(); // ✅ 컴팩트에서 새 대화 만들면 sidebar 닫힘
          }}
        >
          <Plus className={s.plus} />
          <span className={s.startLabel}>Start new chat</span>
        </Button>
      </div>
    </aside>
  );
}

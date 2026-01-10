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
  X, // ✅ 추가
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

    // ✅ 모바일 오버레이 닫기용 (스토어에 있어야 함)
    sidebarMobileOpen,
    setSidebarMobileOpen,
  } = useChatStore();

  const router = useRouter();

  // ✅ 모바일 판별
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // ✅ 모바일에서는 collapsed 상태가 적용되지 않게 강제로 풀어줌(선택이지만 추천)
  useEffect(() => {
    if (isMobile && collapsed) setCollapsed(false);
  }, [isMobile, collapsed, setCollapsed]);

  const toggleCollapse = () => setCollapsed(!collapsed);

  const handleLogoClick = () => router.push('/');

  const closeMobileOverlay = () => {
    if (isMobile && sidebarMobileOpen) setSidebarMobileOpen(false);
  };

  const handleHomeClick = () => {
    closeMobileOverlay();

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
    closeMobileOverlay();
  };

  return (
    // ✅ 모바일에서는 collapsed 클래스 적용 금지
    <aside className={`${s.wrap} ${!isMobile && collapsed ? s.collapsed : ''}`}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleRow}>
          {/* 로고 */}
          {!(!isMobile && collapsed) && (
            <div className={s.brand}>
              <img
                onClick={handleLogoClick}
                src="/logo.png"
                className={s.fav}
                alt="REG AI"
              />
            </div>
          )}

          {/* ✅ 데스크톱: 접기/펼치기 버튼 */}
          {!isMobile && (
            <button
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

          {/* ✅ 모바일: 닫기(X) 버튼 (overlay 닫기) */}
          {isMobile && (
            <button
              type="button"
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
            tabIndex={0}
            onClick={handleHomeClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHomeClick()}
          >
            <div className={s.navLeft}>
              <Home className={s.iconSm} />
              {/* 모바일에서는 항상 텍스트 보여도 됨 */}
              {!(!isMobile && collapsed) && <span className={s.navText}>Home</span>}
            </div>
          </div>

          <div
            className={s.navItem}
            role="button"
            tabIndex={0}
            onClick={handleDocsClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleDocsClick()}
          >
            <div className={s.navLeft}>
              <Folder className={s.iconSm} />
              {!(!isMobile && collapsed) && <span className={s.navText}>문서함</span>}
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
              onClick={() => {
                setMainView('chat');
                setActiveRoom(r.id);
                closeMobileOverlay(); // ✅ 모바일에서 대화 선택하면 sidebar 닫힘
              }}
            >
              <MessageSquare className={active ? s.iconSmAccent : s.iconSmMuted} />
              <span className={s.chatText}>{r.title || '새 대화'}</span>

              {active && !(!isMobile && collapsed) && (
                <button
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
            closeMobileOverlay(); // ✅ 모바일에서 새 대화 만들면 sidebar 닫힘
          }}
        >
          <Plus className={s.plus} />
          <span className={s.startLabel}>Start new chat</span>
        </Button>
      </div>
    </aside>
  );
}

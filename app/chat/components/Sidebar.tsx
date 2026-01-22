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

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = {
  page: 'Chat',
  section: 'Sidebar',
  component: 'Sidebar',
} as const;

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

  const toggleCollapse = () => {
    const next = !collapsed;

    track(gaEvent(GA_CTX, next ? 'Expand' : 'Collapse'), {
      ui_id: gaUiId(GA_CTX, next ? 'Expand' : 'Collapse'),
      collapsed: !next,
      compact: isCompact,
    });

    setCollapsed(next);
  };

  const handleLogoClick = () => {
    track(gaEvent(GA_CTX, 'ClickLogo'), {
      ui_id: gaUiId(GA_CTX, 'ClickLogo'),
      compact: isCompact,
    });
    router.push('/');
  };

  const closeCompactOverlay = (reason: string) => {
    if (isCompact && sidebarMobileOpen) {
      track(gaEvent(GA_CTX, 'CloseOverlay'), {
        ui_id: gaUiId(GA_CTX, 'CloseOverlay'),
        reason,
        compact: isCompact,
      });
      setSidebarMobileOpen(false);
    }
  };

  const handleHomeClick = () => {
    track(gaEvent(GA_CTX, 'OpenHome'), {
      ui_id: gaUiId(GA_CTX, 'OpenHome'),
      compact: isCompact,
    });

    closeCompactOverlay('home');

    try {
      // @ts-ignore
      useChatStore.persist?.clearStorage?.();
      track(gaEvent(GA_CTX, 'ClearPersistStorage'), {
        ui_id: gaUiId(GA_CTX, 'ClearPersistStorage'),
      });
    } catch {
      track(gaEvent(GA_CTX, 'ClearPersistStorageFail'), {
        ui_id: gaUiId(GA_CTX, 'ClearPersistStorageFail'),
      });
    }

    window.location.assign('/chat');
  };

  const handleDocsClick = () => {
    track(gaEvent(GA_CTX, 'OpenDocs'), {
      ui_id: gaUiId(GA_CTX, 'OpenDocs'),
      compact: isCompact,
      logged_in: !!user?.email,
    });

    if (!user?.email) {
      alert('로그인해야 내 문서함을 볼 수 있어요.');

      track(gaEvent(GA_CTX, 'RequireLoginForDocs'), {
        ui_id: gaUiId(GA_CTX, 'RequireLoginForDocs'),
        compact: isCompact,
      });

      setShowLoginModal(true);
      return;
    }

    setMainView('docs');
    closeCompactOverlay('docs');
  };

  const handleOpenRoom = (roomId: string, roomTitle: string) => {
    track(gaEvent(GA_CTX, 'OpenRoom'), {
      ui_id: gaUiId(GA_CTX, 'OpenRoom'),
      room_id: roomId,
      room_title: roomTitle,
      compact: isCompact,
    });

    setMainView('chat');
    setActiveRoom(roomId);
    closeCompactOverlay('open_room');
  };

  const handleDeleteRoom = (roomId: string, roomTitle: string) => {
    track(gaEvent(GA_CTX, 'DeleteRoom'), {
      ui_id: gaUiId(GA_CTX, 'DeleteRoom'),
      room_id: roomId,
      room_title: roomTitle,
      compact: isCompact,
    });

    deleteRoom(roomId);
  };

  const handleNewChat = () => {
    track(gaEvent(GA_CTX, 'CreateRoom'), {
      ui_id: gaUiId(GA_CTX, 'CreateRoom'),
      compact: isCompact,
    });

    setMainView('chat');
    createRoom();
    closeCompactOverlay('new_chat');
  };

  const handleCompactCloseBtn = () => {
    track(gaEvent(GA_CTX, 'ClickCloseBtn'), {
      ui_id: gaUiId(GA_CTX, 'ClickCloseBtn'),
      compact: isCompact,
    });
    setSidebarMobileOpen(false);
  };

  // ✅ (선택) overlay 열림/닫힘 상태 변화 트래킹 (컴팩트에서만 의미 있음)
  useEffect(() => {
    if (!isCompact) return;
    track(gaEvent(GA_CTX, sidebarMobileOpen ? 'OverlayOpen' : 'OverlayClosed'), {
      ui_id: gaUiId(GA_CTX, sidebarMobileOpen ? 'OverlayOpen' : 'OverlayClosed'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarMobileOpen, isCompact]);

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
                data-ga-id={gaUiId(GA_CTX, 'ClickLogo')}
                data-ga-event={gaEvent(GA_CTX, 'ClickLogo')}
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
              data-ga-id={gaUiId(GA_CTX, collapsed ? 'Expand' : 'Collapse')}
              data-ga-event={gaEvent(GA_CTX, collapsed ? 'Expand' : 'Collapse')}
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
              data-ga-id={gaUiId(GA_CTX, 'ClickCloseBtn')}
              data-ga-event={gaEvent(GA_CTX, 'ClickCloseBtn')}
              className={s.mobileCloseBtn}
              onClick={handleCompactCloseBtn}
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
            data-ga-id={gaUiId(GA_CTX, 'OpenHome')}
            data-ga-event={gaEvent(GA_CTX, 'OpenHome')}
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
            data-ga-id={gaUiId(GA_CTX, 'OpenDocs')}
            data-ga-event={gaEvent(GA_CTX, 'OpenDocs')}
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
          const title = r.title || '새 대화';
          return (
            <div
              key={r.id}
              className={`${s.chatItem} ${active ? s.chatActive : ''}`}
              data-ga-id={gaUiId(GA_CTX, 'OpenRoom')}
              data-ga-event={gaEvent(GA_CTX, 'OpenRoom')}
              data-ga-label={title}
              onClick={() => handleOpenRoom(r.id, title)}
            >
              <MessageSquare className={active ? s.iconSmAccent : s.iconSmMuted} />
              <span className={s.chatText}>{title}</span>

              {active && !(!isCompact && collapsed) && (
                <button
                  data-ga-id={gaUiId(GA_CTX, 'DeleteRoom')}
                  data-ga-event={gaEvent(GA_CTX, 'DeleteRoom')}
                  data-ga-label={title}
                  className={s.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteRoom(r.id, title);
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
          data-ga-id={gaUiId(GA_CTX, 'CreateRoom')}
          data-ga-event={gaEvent(GA_CTX, 'CreateRoom')}
          onClick={handleNewChat}
        >
          <Plus className={s.plus} />
          <span className={s.startLabel}>Start new chat</span>
        </Button>
      </div>
    </aside>
  );
}

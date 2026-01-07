'use client';

import {
  Search,
  MessageSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Home,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import s from './Sidebar.module.css';
import { useChatStore } from '../../store/chat';
import { useRouter } from 'next/navigation';

export default function Sidebar() {
  const router = useRouter();

  const {
    rooms, activeRoomId, setActiveRoom, deleteRoom, createRoom,
    collapsed, setCollapsed,
  } = useChatStore();

  const toggleCollapse = () => setCollapsed(!collapsed);

  const handleHomeClick = () => {
    window.location.href = '/chat';
    // 또는 window.location.reload();
  };

  return (
    <aside className={`${s.wrap} ${collapsed ? s.collapsed : ''}`}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleRow}>
          {!collapsed && (
            <div className={s.brand}>
              <img src="/logo.png" className={s.fav} alt="REG AI" />
            </div>
          )}

          {/* ✅ 접기/펴기 버튼 */}
          <button
            onClick={toggleCollapse}
            className={s.collapseBtn}
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            {collapsed ? (
              <ChevronRight
                size={16}
                strokeWidth={2}
                color="#fff"
                style={{
                  width: 16, height: 16,
                  minWidth: 16, minHeight: 16,
                  flex: '0 0 16px',
                  display: 'block',
                }}
              />
            ) : (
              <ChevronLeft
                size={16}
                strokeWidth={2}
                color="#fff"
                style={{
                  width: 16, height: 16,
                  minWidth: 16, minHeight: 16,
                  flex: '0 0 16px',
                  display: 'block',
                }}
              />
            )}
          </button>
        </div>

        {/* Nav */}
        <div className={s.nav}>
          {/* ✅ Home 버튼 */}
          <div
            className={s.navItem}
            role="button"
            tabIndex={0}
            onClick={handleHomeClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleHomeClick();
            }}
          >
            <div className={s.navLeft}>
              <Home className={s.iconSm} />
              {!collapsed && <span className={s.navText}>Home</span>}
            </div>
          </div>

          {/* 필요하면 검색도 다시 살리기
          <div className={s.navItem}>
            <div className={s.navLeft}>
              <Search className={s.iconSm} />
              {!collapsed && <span className={s.navText}>채팅 검색</span>}
            </div>
          </div>
          */}
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
              onClick={() => setActiveRoom(r.id)}
            >
              <MessageSquare className={active ? s.iconSmAccent : s.iconSmMuted} />
              <span className={s.chatText}>{r.title || '새 대화'}</span>
              {active && !collapsed && (
                <button
                  className={s.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); deleteRoom(r.id); }}
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
        <Button className={s.startBtn} onClick={() => createRoom()}>
          <Plus className={s.plus} />
          <span className={s.startLabel}>Start new chat</span>
        </Button>
      </div>
    </aside>
  );
}
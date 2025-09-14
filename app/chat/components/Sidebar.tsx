'use client';

import {
  Search,
  MessageSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Home,           // ✅ 집 아이콘
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import s from './Sidebar.module.css';
import { useChatStore } from '../../store/chat';

export default function Sidebar() {
  const {
    rooms, activeRoomId, setActiveRoom, deleteRoom, createRoom,
    collapsed, setCollapsed,
  } = useChatStore();

  const toggleCollapse = () => setCollapsed(!collapsed);

  return (
    <aside className={`${s.wrap} ${collapsed ? s.collapsed : ''}`}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleRow}>
          {!collapsed &&
          <div className={s.brand}>
            <img src="/favicon.ico" className={s.fav} alt="REG AI" />
            <span className={s.brandText}>REG AI</span>
          </div>
          }

        {/* ✅ 접기/펴기 버튼: 파란 배경 + 흰 화살표 */}
        <button
          onClick={toggleCollapse}
          className={s.collapseBtn}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? (
            <ChevronRight
              size={16}                 // ← viewBox 기준 사이즈 지정
              strokeWidth={2}
              color="#fff"              // ← lucide는 stroke=currentColor
              style={{
                width: 16, height: 16,  // ← 레이아웃 강제
                minWidth: 16,
                minHeight: 16,
                flex: '0 0 16px',       // ← flex 수축 방지
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
        minWidth: 16,
        minHeight: 16,
        flex: '0 0 16px',
        display: 'block',
      }}
    />
  )}
</button>
        </div>

        {/* Nav */}
        <div className={s.nav}>
          <div className={s.navItem}>
            <div className={s.navLeft}>
              {/* ✅ 집 로고 아이콘으로 교체 */}
              <Home className={s.iconSm} />
              <span className={s.navText}>데일리 REG</span>
            </div>
          </div>

          <div className={s.navItem}>
            <div className={s.navLeft}>
              <Search className={s.iconSm} />
              {/* ✅ 항상 1줄로 */}
              <span className={s.navText}>채팅 검색</span>
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
              onClick={() => setActiveRoom(r.id)}
            >
              <MessageSquare className={active ? s.iconSmAccent : s.iconSmMuted} />
              <span className={s.chatText}>{r.title || '새 대화'}</span>
              {!collapsed && (
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

'use client';

import {
  Search,
  MessageSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Home,
  Folder, // ✅ 추가
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import s from './Sidebar.module.css';
import { useChatStore } from '../../store/chat';
import { useUserStore } from '../../store/user'; // ✅ 추가

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
    setMainView,          // ✅ 추가
    setShowLoginModal,    // ✅ 추가(이미 store에 있음)
  } = useChatStore();

  const toggleCollapse = () => setCollapsed(!collapsed);

  const handleHomeClick = () => {
    const st = useChatStore.getState();
    st.setMainView('chat');
    st.setActiveRoom(null);         // ✅ activeRoomId 비우기 + messages 초기화
    st.setSidebarMobileOpen(false);
  };
  
  const handleDocsClick = () => {
    // ✅ 로그인 아니면 모달
    if (!user?.email) {
      alert('로그인해야 내 문서함을 볼 수 있어요.');
      setShowLoginModal(true);
      return;
    }
    setMainView('docs');
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
        </div>

        {/* Nav */}
        <div className={s.nav}>
          {/* Home */}
          <div
            className={s.navItem}
            role="button"
            tabIndex={0}
            onClick={handleHomeClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHomeClick()}
          >
            <div className={s.navLeft}>
              <Home className={s.iconSm} />
              {!collapsed && <span className={s.navText}>Home</span>}
            </div>
          </div>

          {/* ✅ 문서함 */}
          <div
            className={s.navItem}
            role="button"
            tabIndex={0}
            onClick={handleDocsClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleDocsClick()}
          >
            <div className={s.navLeft}>
              <Folder className={s.iconSm} />
              {!collapsed && <span className={s.navText}>문서함</span>}
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
                setMainView('chat'); // ✅ 채팅방 클릭하면 채팅 화면으로 복귀
                setActiveRoom(r.id);
              }}
            >
              <MessageSquare className={active ? s.iconSmAccent : s.iconSmMuted} />
              <span className={s.chatText}>{r.title || '새 대화'}</span>
              {active && !collapsed && (
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
            setMainView('chat'); // ✅ 새 대화도 채팅 화면으로
            createRoom();
          }}
        >
          <Plus className={s.plus} />
          <span className={s.startLabel}>Start new chat</span>
        </Button>
      </div>
    </aside>
  );
}
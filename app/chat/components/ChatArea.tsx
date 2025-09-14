'use client';

import { useEffect, useRef } from 'react';
import { Settings, ChevronDown, Copy, RotateCcw, ArrowUp } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useChatController } from '../useChatController';
import { useChatStore } from '../../store/chat';
import s from './ChatArea.module.css';

export default function ChatArea() {
  const {
    messages, input, setInput,
    loading, loadingMessageIndex, LOADING_MESSAGES, statusMessage,
    sendMessage,
  } = useChatController();

  const setRightOpen = useChatStore((st) => st.setRightOpen);

  // 새 메시지 도착 시 하단으로 스크롤
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, loadingMessageIndex]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <section className={s.wrap}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.left}>
          <h1 className={s.brand}>REG AI</h1>
        </div>
        <div className={s.right}>
          <Button variant="outline" size="sm" className={s.settingsBtn}>
            <Settings className={s.iconXs} />
            settings
          </Button>
          <div className={s.account}>
            <div className={s.avatar}>
              <svg width="13" height="14" viewBox="0 0 13 14" fill="none">
                <path d="M6.19 1.08c-1.26.05-2.37.94-2.68 2.16-.09.33-.12.83-.07 1.15.1.65.38 1.21.85 1.67 1 .97 2.53 1.11 3.67.35 1.23-.82 1.65-2.43.98-3.74-.25-.5-.64-.91-1.12-1.19C7.39 1.21 6.84 1.07 6.19 1.08Z" fill="#2388FF"/>
              </svg>
            </div>
            <div className={s.nameRow}>
              <span className={s.name}>Name</span>
              <ChevronDown className={s.iconSm} />
            </div>
          </div>
          <div className={s.vertDivider} />
          <div className={s.meta}>
            <span className={s.metaStrong}>직무명</span>
            <span className={s.metaWeak}>분야</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className={s.body}>
        <div className={s.stream}>
          <div className={s.streamInner}>
            {messages.length === 0 && (
              <div className={s.welcome}>안녕하세요! 필요한 규제 정보를 알려드릴게요. 😊</div>
            )}

            {messages.map((m, i) => {
              const isUser = m.role === 'user';

              // 사용자 메시지: 우측 말풍선
              if (isUser) {
                return (
                  <div key={i} className={s.userRow}>
                    <div className={s.userBubble}>
                      <div
                        className={s.userContent}
                        dangerouslySetInnerHTML={{ __html: m.content }}
                      />
                    </div>
                  </div>
                );
              }

              // AI 메시지: 카드 + 액션바
              return (
                <div key={i} className={s.aiMsg}>
                  <div className={s.msgContent} dangerouslySetInnerHTML={{ __html: m.content }} />
                  <div className={s.actionRow}>
                    <div className={s.miniActions}>
                      <button className={s.iconBtn} title="다시 생성">
                        <RotateCcw className={s.iconAction} />
                      </button>
                      <button className={s.iconBtn} title="복사">
                        <Copy className={s.iconAction} />
                      </button>
                    </div>
                    <button className={s.evidenceBtn} onClick={() => setRightOpen(true)}>
                      근거 및 서식 확인하기
                    </button>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className={s.loadingCard}>
                <span>{statusMessage || LOADING_MESSAGES[loadingMessageIndex]}</span>
                <span className={s.dots}><span>•</span><span>•</span><span>•</span></span>
              </div>
            )}

            <div ref={endRef} />
            <div className={s.bottomSpacer} />
          </div>
        </div>

        {/* Input */}
        <div className={s.inputRow}>
          <input
            className={s.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="질문을 입력하세요"
          />
          <button onClick={sendMessage} className={s.sendBtn} aria-label="전송">
            <ArrowUp className={s.iconMdAccent} />
          </button>
        </div>
      </div>
    </section>
  );
}

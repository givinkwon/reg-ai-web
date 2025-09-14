'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings, ChevronDown, Copy, RotateCcw, ArrowUp } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useChatController } from '../useChatController';
import { useChatStore } from '../../store/chat';
import s from './ChatArea.module.css';

export default function ChatArea() {
  const {
    messages, input, setInput,
    loading, loadingMessageIndex, LOADING_MESSAGES, statusMessage,
    sendMessage, regenerate,
  } = useChatController();

  const setRightOpen = useChatStore((st) => st.setRightOpen);
  const setMessages  = useChatStore((st) => st.setMessages);

  // 복사 토스트
  const [copied, setCopied] = useState(false);

  // 각 assistant 본문 엘리먼트 참조 (index -> element)
  const contentRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // 하단 스크롤
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

  // HTML -> 텍스트 (백업용)
  const htmlToText = (html: string) => {
    try {
      const clean = html.replace(/<br\s*\/?>/gi, '\n');
      const doc = new DOMParser().parseFromString(clean, 'text/html');
      return (doc.body.textContent || '').replace(/\u00A0/g, ' ').trim();
    } catch {
      return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+>/g, '').trim();
    }
  };

  // 클립보드 복사 (navigator + textarea fallback)
  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // 무시
    }
  };

  // 복사: ref 우선, 실패 시 htmlToText 백업
  const handleCopy = async (idx: number, fallbackHtml: string) => {
    const el = contentRefs.current[idx];
    const text = el?.innerText?.trim() || htmlToText(fallbackHtml);
    if (text) await copyToClipboard(text);
  };

  // 다시 생성: 해당 assistant 카드 제거 후, 위쪽의 최근 user 질문으로 재요청
  const handleRegenerate = (idx: number) => {
    const upperUser = [...messages].slice(0, idx).reverse().find((m) => m.role === 'user');
    const fallbackUser = [...messages].reverse().find((m) => m.role === 'user');
    const q = htmlToText(upperUser?.content || fallbackUser?.content || '');
    if (!q) return;
    setMessages(messages.filter((_, i) => i !== idx));
    regenerate(q);
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

              // assistant
              return (
                <div key={i} className={s.aiMsg}>
                  <div
                    ref={(el) => { contentRefs.current[i] = el; }}
                    className={s.msgContent}
                    dangerouslySetInnerHTML={{ __html: m.content }}
                  />
                  <div className={s.actionRow}>
                    <div className={s.miniActions}>
                      <button className={s.iconBtn} title="다시 생성" onClick={() => handleRegenerate(i)}>
                        <RotateCcw className={s.iconAction} />
                      </button>
                      <button className={s.iconBtn} title="복사" onClick={() => handleCopy(i, m.content)}>
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

        {/* 복사 토스트 (인라인 스타일로 확실히 고정 표시) */}
        {copied && (
          <div
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 76,
              transform: 'translateX(-50%)',
              background: 'rgba(33,41,66,.92)',
              color: '#fff',
              fontSize: 13,
              padding: '8px 12px',
              borderRadius: 10,
              boxShadow: '0 6px 20px rgba(0,0,0,.18)',
              zIndex: 9999,
            }}
          >
            복사되었습니다
          </div>
        )}
      </div>
    </section>
  );
}

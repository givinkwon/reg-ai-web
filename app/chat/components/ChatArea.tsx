'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings, Copy, RotateCcw, ArrowUp } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useChatController } from '../useChatController';
import { useChatStore } from '../../store/chat';
import { useUserStore } from '../../store/user';
import Cookies from 'js-cookie';
import s from './ChatArea.module.css';

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  environment: { label: '환경/안전', emoji: '🌱' },
  infosec: { label: '정보보안', emoji: '🛡️' },
};

export default function ChatArea() {
  const {
    messages, input, setInput,
    loading, loadingMessageIndex, LOADING_MESSAGES, statusMessage,
    sendMessage, regenerate,
  } = useChatController();

  const { selectedJobType, setSelectedJobType } = useUserStore();
  const [showTypeModal, setShowTypeModal] = useState(false);

  const setMessages = useChatStore((st) => st.setMessages);
  const openRightFromHtml = useChatStore((st) => st.openRightFromHtml);

  // 공유 링크 초기 로딩 1회 보장
  const bootOnce = useRef(false);

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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const chooseType = (id: string) => {
    Cookies.set('selectedJobType', id, { expires: 7 });
    setSelectedJobType(id);
    setShowTypeModal(false);
  };

  const cur = TYPE_META[selectedJobType ?? ''] ?? { label: '분야 선택', emoji: '💼' };

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
      // ignore
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

  // "2) 근거" 이전까지만 보여주기 (2), 2. , ② 모두 허용)
  const cutHtmlBeforeEvidence = (html: string) => {
    if (!html) return html;
    const working = html.replace(/<(br|BR)\s*\/?>/g, '\n');
    const headerRe = /^\s*(?:2\)|2\.|②)\s*근거\s*$/m;
    const m = working.match(headerRe);
    let cutIdx = m?.index ?? -1;
    if (cutIdx < 0) {
      const altIconIdx = working.indexOf('🔗');
      if (altIconIdx >= 0) cutIdx = altIconIdx;
    }
    if (cutIdx <= 0) return html;
    const before = working.slice(0, cutIdx);
    return before.replace(/\n/g, '<br />');
  };

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

  // 공유 링크(id|job_id)로 들어온 경우, FastAPI /public/answer 직접 호출 → 로컬 채팅 주입
  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR/빌드 단계 보호
    if (bootOnce.current) return;

    const sp = new URLSearchParams(window.location.search);
    const sharedId = sp.get('id') || sp.get('job_id');
    if (!sharedId) return;

    bootOnce.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/public-answer?id=${encodeURIComponent(sharedId)}`, { cache: 'no-store' });

        if (!res.ok) {
          setMessages([
            { role: 'assistant', content: '공유된 답변을 불러오지 못했습니다. 링크가 만료되었거나 잘못된 ID일 수 있어요.' }
          ]);
          return;
        }

        const data = await res.json() as {
          job_id: string;
          category?: 'environment' | 'infosec' | string;
          question?: string;
          answer_html?: string;
          created_at?: string;
        };

        const question = (data.question || '').trim();
        const answerHtml = (data.answer_html || '').trim();

        // 카테고리 동기화
        if (data.category && (data.category === 'environment' || data.category === 'infosec')) {
          Cookies.set('selectedJobType', data.category, { expires: 7 });
          setSelectedJobType(data.category);
        }

        const initialMsgs: { role: 'user' | 'assistant'; content: string }[] = [];
        if (question) initialMsgs.push({ role: 'user', content: question });
        else initialMsgs.push({ role: 'user', content: '(공유 링크로 불러온 질문)' });

        if (answerHtml) initialMsgs.push({ role: 'assistant', content: answerHtml });
        else initialMsgs.push({ role: 'assistant', content: '답변 본문이 비어 있습니다.' });

        setMessages(initialMsgs);
      } catch (e) {
        console.error('[ChatArea] public/answer fetch error:', e);
        setMessages([
          { role: 'assistant', content: '공유된 답변을 불러오는 중 오류가 발생했습니다.' }
        ]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className={s.wrap}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.right}>
          <Button variant="outline" size="sm" className={s.settingsBtn}>
            <Settings className={s.iconXs} />
            계정
          </Button>
          {/* <div className={s.account}>
            <div className={s.nameRow}>
              <span className={s.name}>비회원</span>
            </div>
          </div>
          <div className={s.vertDivider} />
          <div className={s.meta}>
            <span className={s.metaStrong}>회사명</span>
            <span className={s.metaWeak}>RegAI</span>
          </div>
          <div className={s.meta}>
            <span className={s.metaStrong}>직무명</span>
            <span className={s.metaWeak}>Product Owner</span>
          </div> */}
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
              const safeHtml = m.role === 'assistant'
                ? cutHtmlBeforeEvidence(m.content)
                : m.content;

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
                    dangerouslySetInnerHTML={{ __html: safeHtml }}
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
                    <button
                      className={s.evidenceBtn}
                      onClick={() => openRightFromHtml(m.content)}
                    >
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
          <div className={s.inputWrap}>
            {/* 분야 선택 칩 */}
            <button
              type="button"
              className={s.typeChip}
              onClick={() => setShowTypeModal(true)}
              aria-label="분야 선택"
              title="분야 선택"
            >
              <span className={s.typeEmoji}>{cur.emoji}</span>
              <span className={s.typeText}>{cur.label}</span>
            </button>

            <input
              className={`${s.input} ${s.inputHasChip} chat-input`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="질문을 입력하세요"
            />
          </div>

          <button onClick={sendMessage} className={s.sendBtn} aria-label="전송">
            <ArrowUp className={s.iconMdAccent} />
          </button>
        </div>

        {/* 타입 선택 모달 */}
        {showTypeModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="분야 선택"
            className={s.typeModalOverlay}
          >
            <div className={s.typeModal} onClick={(e) => e.stopPropagation()}>
              <h3 className={s.typeTitle}>분야를 선택하세요</h3>
              <div className={s.typeGrid}>
                <button className={s.typeCard} onClick={() => chooseType('environment')}>
                  <span className={s.typeEmoji}>🌱</span>
                  <span className={s.typeLabel}>환경/안전</span>
                </button>
                <button className={s.typeCard} onClick={() => chooseType('infosec')}>
                  <span className={s.typeEmoji}>🛡️</span>
                  <span className={s.typeLabel}>정보보안</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 복사 토스트 */}
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


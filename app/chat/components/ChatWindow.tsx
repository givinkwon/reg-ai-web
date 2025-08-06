'use client';

import { useState, useEffect } from 'react';
import { useChatStore, ChatMessage } from '../../store/chat';
import { useUserStore } from '../../store/user';
import styles from './ChatWindow.module.css';
import { pushToDataLayer } from '@/app/lib/analytics';

export default function ChatWindow() {
  const messages = useChatStore((state) => state.messages);
  const addMessage = useChatStore((state) => state.addMessage);
  const { selectedJobType, userInfo } = useUserStore();
  const [input, setInput] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendSlackMessage = (text: string) => {
    const payload = {
      text: text.slice(0, 3500),
    };
    fetch('/api/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((e) => console.warn('slack send failed', e));
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    pushToDataLayer('chat_send_click', {
      message: trimmed,
      length: trimmed.length,
      category: selectedJobType,
    });

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    addMessage(userMsg);
    setInput('');
    setLoading(true);

    sendSlackMessage(
      `*[User]*\n• category: ${selectedJobType}\n• message:\n${trimmed}`
    );

    try {
      const res = await fetch('/api/start-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userInfo.email || 'anonymous',
          category: selectedJobType,
          message: trimmed,
        }),
      });

      const { job_id } = await res.json();
      setJobId(job_id);
    } catch (err) {
      console.error('❌ API 호출 오류:', err);
      addMessage({
        role: 'assistant',
        content: '⚠️ 요청 중 에러가 발생했습니다.',
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-task?jobId=${jobId}`);
        const data = await res.json();

        if (data.status === 'done') {
          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: cleanText(data.gpt_response || '⚠️ 답변이 없습니다.'),
          };
          addMessage(assistantMsg);
          setLoading(false);
          setJobId(null);
          clearInterval(interval);
        } else if (data.status === 'error') {
          addMessage({
            role: 'assistant',
            content: '⚠️ 서버 처리 중 오류가 발생했습니다.',
          });
          setLoading(false);
          setJobId(null);
          clearInterval(interval);
        }
      } catch (err) {
        console.error('❌ 상태 확인 실패:', err);
        addMessage({
          role: 'assistant',
          content: '⚠️ 상태 확인 중 오류가 발생했습니다.',
        });
        setLoading(false);
        setJobId(null);
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  const cleanText = (text: string) =>
    text
      .replace(/---+/g, '')
      .replace(/["“”]/g, '')
      .replace(/\*\*/g, '')
      .replace(/\n/g, '<br />');

  // ✅ 조건부 메시지: 로그인 여부, 직무 선택 여부 확인
  if (!userInfo.email) return <div className={styles.notice}>⚠️ 로그인 후 이용해주세요.</div>;
  if (!selectedJobType) return <div className={styles.notice}>⚠️ 직무를 먼저 선택해주세요.</div>;

  return (
    <div className={styles.chatWindow}>
      <div className={styles.messages}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={msg.role === 'user' ? styles.user : styles.assistant}
            dangerouslySetInnerHTML={{ __html: msg.content }}
          />
        ))}
        {loading && (
          <div className={styles.assistant}>🌀 답변을 생성 중입니다...</div>
        )}
      </div>

      <div className={styles.inputArea}>
        <input
          className={styles.inputField}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="질문을 입력하세요"
        />
        <button className={styles.sendButton} onClick={sendMessage}>
          전송
        </button>
      </div>
    </div>
  );
}

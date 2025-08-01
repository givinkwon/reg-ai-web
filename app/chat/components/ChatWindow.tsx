'use client';

import { useState } from 'react';
import { useChatStore, ChatMessage } from '../../store/chat';
import { useUserStore } from '../../store/user';
import styles from './ChatWindow.module.css';

export default function ChatWindow() {
  const messages = useChatStore((state) => state.messages);
  const addMessage = useChatStore((state) => state.addMessage);
  const { selectedJobType } = useUserStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
    };

    addMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'anonymous',
          category: selectedJobType,
          message: trimmed,
        }),
      });

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.answer || '⚠️ 답변이 없습니다.',
      };

      addMessage(assistantMsg);
    } catch (e) {
      console.error('❌ Send message error:', e);
      addMessage({
        role: 'assistant',
        content: '⚠️ 에러가 발생했습니다.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!selectedJobType) return <div>직무를 먼저 선택해주세요.</div>;

  return (
    <div className={styles.chatWindow}>
      <div className={styles.messages}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={msg.role === 'user' ? styles.user : styles.assistant}
            dangerouslySetInnerHTML={{
              __html: msg.content.replace(/\n/g, '<br />'), // '\n' 줄바꿈도 반영
            }}
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

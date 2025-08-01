'use client'

import { useRecoilState } from 'recoil';
import { chatMessagesState } from '../atoms/chatState';
import { selectedTypeState } from '../atoms/selectedTypeState';
import { useState } from 'react';
import styles from './ChatWindow.module.css';

export default function ChatWindow() {
  const [messages, setMessages] = useRecoilState(chatMessagesState);
  const [selectedType] = useRecoilState(selectedTypeState);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!selectedType) return null;

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { role: 'user' as const, content: input };
    setMessages([...messages, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedType,
          question: input,
        }),
      });

      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ 에러가 발생했습니다.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.chatWindow}>
      <div className={styles.messages}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={msg.role === 'user' ? styles.userMsg : styles.assistantMsg}
          >
            {msg.content}
          </div>
        ))}
        {loading && <div className={styles.assistantMsg}>🌀 답변을 생성 중입니다...</div>}
      </div>

      <div className={styles.inputRow}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="질문을 입력하세요"
        />
        <button onClick={sendMessage}>전송</button>
      </div>
    </div>
  );
}

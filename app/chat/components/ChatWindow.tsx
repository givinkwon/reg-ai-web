'use client'

import { useRecoilState, useRecoilValue } from 'recoil'
import { chatMessagesState, currentUserState } from '../..//atoms/chat'
import styles from './ChatWindow.module.css'
import { useState } from 'react'

export default function ChatWindow() {
  const [messages, setMessages] = useRecoilState(chatMessagesState)
  const userInfo = useRecoilValue(currentUserState)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const sendMessage = async () => {
    if (!input.trim()) return

    const userMsg = { type: 'user', content: input }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userInfo.email,
          role: userInfo.role,
          message: input,
        }),
      })

      const data = await res.json()
      const botMsg = { type: 'assistant', content: data.answer }
      setMessages((prev) => [...prev, botMsg])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { type: 'assistant', content: '❌ 서버 응답 실패' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.chatWindow}>
      <div className={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} className={styles[msg.type]}>
            {msg.content}
          </div>
        ))}
        {loading && <div className={styles.assistant}>⏳ 답변 생성 중...</div>}
      </div>
      <div className={styles.inputArea}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="질문을 입력하세요..."
        />
        <button onClick={sendMessage}>전송</button>
      </div>
    </div>
  )
}

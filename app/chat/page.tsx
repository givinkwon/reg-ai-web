'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { useUserStore } from '../store/user';
import ChatWindow from './components/ChatWindow';
import Header from './components/Header'; // ✅ Header 컴포넌트 import
import styles from './ChatPage.module.css';

export default function ChatPage() {
  const router = useRouter();
  const setJobType = useUserStore((state) => state.setSelectedJobType);

  useEffect(() => {
    const savedType = Cookies.get('selectedJobType');
    if (!savedType) {
      router.replace('/');
    } else {
      setJobType(savedType);
    }
  }, [setJobType, router]);

  return (
    <div className={styles.chatContainer}>
      <Header /> {/* ✅ BackButton 대신 Header 삽입 */}
      <ChatWindow />
    </div>
  );
}

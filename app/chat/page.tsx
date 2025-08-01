'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { useUserStore } from '../store/user';
import ChatWindow from './components/ChatWindow';
import BackButton from './components/BackButton'; // ✅ 추가

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
    <div style={{ padding: '1rem' }}>
      <BackButton /> {/* ✅ 여기에 삽입 */}
      <ChatWindow />
    </div>
  );
}

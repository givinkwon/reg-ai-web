'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { useSetRecoilState } from 'recoil';
import { selectedJobTypeState } from '../atoms/user';
import ChatWindow from './components/ChatWindow';

export default function ChatPage() {
  const router = useRouter();
  const setJobType = useSetRecoilState(selectedJobTypeState);

  useEffect(() => {
    const savedType = Cookies.get('selectedJobType');
    if (!savedType) {
      router.replace('/');
    } else {
      setJobType(savedType);
    }
  }, []);

  return <ChatWindow />;
}

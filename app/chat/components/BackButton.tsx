'use client';

import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { useSetRecoilState } from 'recoil';
import { selectedJobTypeState } from '../../atoms/user';
import { chatLogState } from '../../atoms/chat';
import styles from './BackButton.module.css';

export default function BackButton() {
  const router = useRouter();
  const setJobType = useSetRecoilState(selectedJobTypeState);
  const setChatLog = useSetRecoilState(chatLogState);

  const goBack = () => {
    Cookies.remove('selectedJobType');
    setJobType('');
    setChatLog([]);
    router.push('/');
  };

  return (
    <button className={styles.backButton} onClick={goBack}>
      ← 직무 선택 변경
    </button>
  );
}

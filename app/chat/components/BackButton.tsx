'use client';

import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { useUserStore } from '../../store/user';
import styles from './BackButton.module.css';

export default function BackButton() {
  const router = useRouter();
  const setJobType = useUserStore((state) => state.setSelectedJobType);

  const goBack = () => {
    Cookies.remove('selectedJobType');
    setJobType('');
    router.push('/');
  };

  return (
    <button className={styles.backButton} onClick={goBack}>
      ← 직무 선택 변경
    </button>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { useUserStore } from '../../store/user';
import styles from './BackButton.module.css';
import { pushToDataLayer } from '@/app/lib/analytics';

export default function BackButton() {
  const router = useRouter();
  const setJobType = useUserStore((state) => state.setSelectedJobType);

  const goBack = () => {
    pushToDataLayer('back_click', {
      from_page: 'chat',
      action: 'change_jobtype',
      prev_job_type: Cookies.get('selectedJobType') || '(none)',
    });

    Cookies.remove('selectedJobType');
    setJobType('');
    router.push('/');
  };

  return (
    <button className={styles.backButton} onClick={goBack}>
      ← 전문분야 선택 변경
    </button>
  );
}

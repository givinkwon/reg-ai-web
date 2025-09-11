'use client';

import styles from './TypeSelector.module.css';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { useChatStore } from '../store/chat'; // Zustand store import
import { pushToDataLayer } from '../lib/analytics';

const jobTypes = [
  {
    id: 'environment',
    emoji: '🌱',
    label: '환경/안전',
    description: '대기환경, 산업안전, 화학물질 담당자',
  },
  // {
  //   id: 'finance',
  //   emoji: '🏦',
  //   label: '금융 규제/컴플라이언스',
  //   description: '금융감독원, 자산운용사 등 금융 규제 담당',
  // },
  // {
  //   id: 'hr',
  //   emoji: '👔',
  //   label: '인사/노무',
  //   description: '근로기준법, 채용/해고, 직장 내 괴롭힘 등',
  // },
  {
    id: 'infosec',
    emoji: '🛡️',
    label: '정보보안/컴플라이언스',
    description: 'ISMS, 개인정보보호, 전자금융감독 등',
  },
  // {
  //   id: 'bio',
  //   emoji: '🧬',
  //   label: '바이오/제약 인허가',
  //   description: '의약품/의료기기 관련 허가 담당자',
  // },
  // {
  //   id: 'construction',
  //   emoji: '🏗️',
  //   label: '건설 인허가',
  //   description: '건설산업기본법, 기술진흥법 등 담당자',
  // },
  // {
  //   id: 'procurement',
  //   emoji: '📦',
  //   label: '구매/공공입찰',
  //   description: '공공계약, 조달청 등 입찰 담당자',
  // },
];

export default function TypeSelector() {
  const router = useRouter();
  const { messages, setMessages } = useChatStore(); // Zustand 사용

  useEffect(() => {
    const savedType = Cookies.get('selectedJobType');
    if (savedType) {
      router.push('/chat');
    }
  }, []);

  const handleSelect = (typeId: string) => {
    Cookies.set('selectedJobType', typeId, { expires: 7 });

    pushToDataLayer('jobtype_select', { job_type: typeId });

    router.push('/chat');
  };

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>
        👋 어떤 분야의 규제 정보를 찾고 계신가요?
      </h1>
      <div className={styles.grid}>
        {jobTypes.map((type) => (
          <button
            key={type.id}
            className={styles.card}
            onClick={() => handleSelect(type.id)}
          >
            <div className={styles.emoji}>{type.emoji}</div>
            <div>
              <div className={styles.label}>{type.label}</div>
              <div className={styles.description}>{type.description}</div>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}

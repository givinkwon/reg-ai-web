// app/docs/page.tsx
'use client';

import React, { useEffect } from 'react'; 
import Link from 'next/link';
import { FolderOpen, AlertTriangle, Users, CalendarCheck, ArrowRight } from 'lucide-react';
import s from './page.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';
import Footer from './components/landing/Footer';

// ✅ GA Context 정의
const GA_CTX = { page: 'SafetyDocs', section: 'Dashboard', area: 'MenuGrid' } as const;

const MENU_ITEMS = [
  {
    id: 'tools',
    title: '안전보건 문서함',
    desc: '작성한 문서를 관리하고 다운로드하세요.',
    icon: <FolderOpen size={32} />,
    href: '/docs/docs-box',
    isPrimary: true,
  },
  {
    id: 'risk',
    title: '위험성평가',
    desc: '유해·위험요인 파악부터 감소대책 수립까지, 작업별 AI 추천에 따라 자동화하세요!',
    icon: <AlertTriangle size={32} />,
    href: '/docs/risk-assessment',
  },
  {
    id: 'tbm',
    title: 'TBM (작업전점검)',
    desc: '공정 입력만으로 오늘의 TBM을 한 번에 완성하세요.',
    icon: <Users size={32} />,
    href: '/docs/tbm',
  },
  {
    id: 'monthly',
    title: '월 순회점검표',
    desc: '한 번에 내 사업장 맞춤 순회 점검표를 생성하고, 점검 관리를 이행하세요!',
    icon: <CalendarCheck size={32} />,
    href: '/docs/monthly-inspection',
  },
];

export default function DashboardPage() {
  // ✅ GA: Page View Tracking (페이지 진입 시 1회 실행)
  useEffect(() => {
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      menu_count: MENU_ITEMS.length,
    });
  }, []);

  // ✅ GA: Menu Click Handler
  const handleClickMenu = (item: typeof MENU_ITEMS[0]) => {
    track(gaEvent(GA_CTX, 'ClickMenu'), {
      ui_id: gaUiId(GA_CTX, 'ClickMenu'),
      menu_id: item.id,
      menu_title: item.title,
      target_url: item.href,
    });
  };

  return (
    <div className={s.dashboardContainer}>
      {/* 히어로 섹션 */}
      <section className={s.heroSection}>
        <h1 className={s.heroTitle}>스마트 안전관리 REG AI</h1>
        <p className={s.heroSubtitle}>
          복잡한 과정 없이 필요한 기능을 선택하여 바로 시작하세요.
        </p>
      </section>

      {/* 카드 그리드 */}
      <section className={s.gridContainer}>
        <div className={s.cardGrid}>
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              // 🚀 핵심 수정 부분: group 클래스를 추가하여 Tailwind의 group-hover 작동
              className={`group ${s.linkWrapper || ''}`}
              onClick={() => handleClickMenu(item)} 
            >
              <div
                className={`${s.card} ${item.isPrimary ? s.cardPrimary : ''}`}
                data-ga-event={gaEvent(GA_CTX, 'ClickMenu')}
                data-ga-id={gaUiId(GA_CTX, 'ClickMenu')}
                data-ga-label={item.title}
                data-ga-text={item.title}
              >
                <div className={s.cardIconBox}>{item.icon}</div>
                <h3 className={s.cardTitle}>{item.title}</h3>
                <p className={s.cardDesc}>{item.desc}</p>
                {/* 🚀 다크모드에서도 잘 보이도록 text-blue-500 추가 */}
                <div className="mt-4 text-sm font-semibold flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 text-blue-600 dark:text-blue-400">
                  바로가기 <ArrowRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
      
      <Footer />
    </div>
  );
}
'use client';

import Link from 'next/link';
import { FolderOpen, AlertTriangle, Users, CalendarCheck, ArrowRight } from 'lucide-react';
import s from './page.module.css'; // 이전 단계의 CSS 사용 (white theme)

const MENU_ITEMS = [
  {
    id: 'tools',
    title: '안전보건 도구함',
    desc: '저장된 문서를 관리하고 다운로드하세요.',
    icon: <FolderOpen size={32} />,
    href: '/docs/tools',
    isPrimary: true,
  },
  {
    id: 'risk',
    title: '위험성평가',
    desc: '유해·위험요인 파악 및 감소대책 수립',
    icon: <AlertTriangle size={32} />,
    href: '/docs/risk',
  },
  {
    id: 'tbm',
    title: 'TBM (작업전점검)',
    desc: '작업 전 10분 안전미팅 기록',
    icon: <Users size={32} />,
    href: '/docs/tbm',
  },
  {
    id: 'monthly',
    title: '월 순회점검표',
    desc: '현장 정기 안전 점검 리포트',
    icon: <CalendarCheck size={32} />,
    href: '/docs/monthly',
  },
];

export default function DashboardPage() {
  return (
    <div className={s.dashboardContainer}>
      {/* 히어로 섹션 */}
      <section className={s.heroSection}>
        <h1 className={s.heroTitle}>안전관리 스마트 플랫폼</h1>
        <p className={s.heroSubtitle}>
          복잡한 과정 없이, 필요한 기능을 선택하여 바로 시작하세요.
        </p>
      </section>

      {/* 카드 그리드 */}
      <section className={s.gridContainer}>
        <div className={s.cardGrid}>
          {MENU_ITEMS.map((item) => (
            <Link key={item.id} href={item.href} className={s.linkWrapper}>
              <div className={`${s.card} ${item.isPrimary ? s.cardPrimary : ''}`}>
                <div className={s.cardIconBox}>{item.icon}</div>
                <h3 className={s.cardTitle}>{item.title}</h3>
                <p className={s.cardDesc}>{item.desc}</p>
                <div className="mt-4 text-sm font-semibold flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  바로가기 <ArrowRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
      
      {/* 하단 설명 섹션 (생략 가능 또는 유지) */}
    </div>
  );
}
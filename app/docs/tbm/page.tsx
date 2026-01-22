'use client';

import { useState } from 'react';
import { Users, ClipboardList, History, CheckCircle2, FileSignature, Mic } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

// 🚧 TBM 작성 위저드 (나중에 실제 로직으로 교체될 컴포넌트)
function TBMWizardPlaceholder({ onClose }: { onClose: () => void }) {
  return (
    <div className={s.wizardContainer}>
      <div className={s.wizardHeader}>
        <h2 className={s.wizardTitle}>TBM 일지 작성</h2>
        <Button variant="outline" onClick={onClose}>나가기</Button>
      </div>
      
      <div className={s.wizardContent}>
        <div className={s.placeholderBox}>
          <ClipboardList size={48} className="text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-600">TBM 작성 기능이 준비 중입니다.</p>
          <p className="text-sm text-gray-400 mt-2">
            작업 내용 공유, 위험요인 전파, 참석자 서명 기능을<br/>
            이곳에서 단계별로 진행하게 됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TBMPage() {
  const [isWriting, setIsWriting] = useState(false);

  // 작성 모드일 때
  if (isWriting) {
    return <TBMWizardPlaceholder onClose={() => setIsWriting(false)} />;
  }

  // 랜딩 페이지 모드
  return (
    <div className={s.container}>
      {/* 1. 상단 액션 섹션 (보라색 그라데이션) */}
      <section className={s.actionSection}>
        <div className={s.actionBox}>
          <div className={s.iconWrapper}>
            <Users size={40} color="white" strokeWidth={1.5} />
          </div>
          <h1 className={s.title}>TBM (작업전 안전점검)</h1>
          <p className={s.desc}>
            작업 시작 전 10분! 근로자와 함께 위험요인을 공유하고 기록하세요.<br />
            음성 인식 회의록 작성부터 모바일 서명까지 한 번에 해결됩니다.
          </p>
          
          <div className={s.btnGroup}>
            <Button className={s.whiteBtn} onClick={() => setIsWriting(true)}>
              <ClipboardList size={20} className="mr-2" />
              오늘의 TBM 시작하기
            </Button>
            <Button className={s.glassBtn}>
              <History size={20} className="mr-2" />
              지난 일지 조회
            </Button>
          </div>
        </div>
      </section>

      {/* 2. 정보 섹션 (3단계 설명) */}
      <section className={s.infoSection}>
        <h2 className={s.sectionTitle}>스마트한 TBM 진행 절차</h2>
        <div className={s.grid}>
          <div className={s.card}>
            <div className={s.stepBadge}>1</div>
            <h3 className={s.cardTitle}>작업 및 위험 공유</h3>
            <p className={s.cardDesc}>
              금일 작업 내용과 위험성평가 결과를 불러와 근로자들에게 쉽고 빠르게 전파합니다.
            </p>
          </div>
          <div className={s.card}>
            <div className={s.stepBadge}>2</div>
            <h3 className={s.cardTitle}>건강상태 & 보호구 확인</h3>
            <p className={s.cardDesc}>
              작업자의 건강 상태를 체크하고, 필수 보호구(안전모, 안전대 등) 착용 사진을 남깁니다.
            </p>
          </div>
          <div className={s.card}>
            <div className={s.stepBadge}>3</div>
            <h3 className={s.cardTitle}>간편 전자 서명</h3>
            <p className={s.cardDesc}>
              종이 서명판 없이, 근로자들은 본인의 스마트폰이나 태블릿으로 즉시 서명할 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      {/* 3. 추가 기능 소개 (특장점) */}
      <section className={s.featureSection}>
        <div className={s.featureGrid}>
          <div className={s.featureItem}>
            <div className={s.featureIcon}><Mic size={24} /></div>
            <div className={s.featureText}>
              <h4>음성 인식 회의록</h4>
              <p>회의 내용을 말하면 AI가 자동으로 텍스트로 변환하여 기록합니다.</p>
            </div>
          </div>
          <div className={s.featureItem}>
            <div className={s.featureIcon}><FileSignature size={24} /></div>
            <div className={s.featureText}>
              <h4>QR 코드 서명</h4>
              <p>QR 코드를 스캔하여 수십 명의 근로자가 동시에 출석 체크를 할 수 있습니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FAQ 영역 */}
      <section className={s.faqSection}>
        <div className={s.faqContainer}>
          <h3 className={s.sectionTitle}>자주 묻는 질문</h3>
          <div className={s.faqItem}>
            <div className={s.faqQ}>Q. 매일 작성해야 하나요?</div>
            <div className={s.faqA}>
              네, 중대재해처벌법 및 안전보건규칙에 따라 작업 전 안전점검 회의(TBM) 기록은 필수입니다.
            </div>
          </div>
          <div className={s.faqItem}>
            <div className={s.faqQ}>Q. 사진 첨부는 몇 장까지 되나요?</div>
            <div className={s.faqA}>
              제한 없이 현장 상황과 교육 사진을 첨부할 수 있으며, 자동으로 리포트에 포함됩니다.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
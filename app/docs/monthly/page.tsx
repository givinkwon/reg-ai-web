'use client';

import { useState } from 'react';
import { CalendarCheck, Camera, FileCheck, ClipboardCheck, PenTool, Download } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

// 🚧 월간 점검표 작성 위저드 (나중에 실제 기능으로 교체)
function MonthlyWizardPlaceholder({ onClose }: { onClose: () => void }) {
  return (
    <div className={s.wizardContainer}>
      <div className={s.wizardHeader}>
        <h2 className={s.wizardTitle}>월 정기 합동안전점검표 작성</h2>
        <Button variant="outline" onClick={onClose}>나가기</Button>
      </div>
      
      <div className={s.wizardContent}>
        <div className={s.placeholderBox}>
          <ClipboardCheck size={48} className="text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-600">점검표 작성 기능이 준비 중입니다.</p>
          <p className="text-sm text-gray-400 mt-2">
            표준 점검 항목 체크, 부적합 사항 사진 촬영, <br/>
            시정 조치 입력 및 합동안전점검 서명 기능이 이곳에 구현됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MonthlyPage() {
  const [isWriting, setIsWriting] = useState(false);

  // 작성 모드일 때
  if (isWriting) {
    return <MonthlyWizardPlaceholder onClose={() => setIsWriting(false)} />;
  }

  // 랜딩 페이지 모드
  return (
    <div className={s.container}>
      {/* 1. 상단 액션 섹션 */}
      <section className={s.actionSection}>
        <div className={s.actionBox}>
          <div className={s.iconWrapper}>
            <CalendarCheck size={40} color="white" strokeWidth={1.5} />
          </div>
          <h1 className={s.title}>월 순회점검표</h1>
          <p className={s.desc}>
            매월 실시하는 노사 합동점검을 체계적으로 기록하세요.<br />
            현장에서 스마트폰으로 사진을 찍어 지적사항을 남기고 즉시 리포트를 생성합니다.
          </p>
          
          <div className={s.btnGroup}>
            <Button className={s.whiteBtn} onClick={() => setIsWriting(true)}>
              <Camera size={20} className="mr-2" />
              점검 시작하기
            </Button>
            <Button className={s.glassBtn}>
              <FileCheck size={20} className="mr-2" />
              점검 리포트 확인
            </Button>
          </div>
        </div>
      </section>

      {/* 2. 정보 섹션 (3단계) */}
      <section className={s.infoSection}>
        <h2 className={s.sectionTitle}>현장 점검, 이렇게 쉬워집니다</h2>
        <div className={s.grid}>
          <div className={s.card}>
            <div className={s.stepBadge}>1</div>
            <h3 className={s.cardTitle}>체크리스트 점검</h3>
            <p className={s.cardDesc}>
              추락, 화재, 장비 등 표준화된 안전 점검 항목을 모바일로 빠르게 체크(O/X)합니다.
            </p>
          </div>
          <div className={s.card}>
            <div className={s.stepBadge}>2</div>
            <h3 className={s.cardTitle}>부적합 사항 촬영</h3>
            <p className={s.cardDesc}>
              지적 사항이 있는 곳은 카메라 아이콘을 눌러 사진을 찍고 개선 요구사항을 바로 입력합니다.
            </p>
          </div>
          <div className={s.card}>
            <div className={s.stepBadge}>3</div>
            <h3 className={s.cardTitle}>자동 리포트 생성</h3>
            <p className={s.cardDesc}>
              점검이 끝나면 사진 대지와 지적 사항이 포함된 깔끔한 PDF 점검 리포트가 완성됩니다.
            </p>
          </div>
        </div>
      </section>

      {/* 3. 추가 기능 (특장점) */}
      <section className={s.featureSection}>
        <div className={s.featureGrid}>
          <div className={s.featureItem}>
            <div className={s.featureIcon}><PenTool size={24} /></div>
            <div className={s.featureText}>
              <h4>합동 점검자 서명</h4>
              <p>노사 양측 점검자가 태블릿 화면에 직접 전자 서명을 남길 수 있습니다.</p>
            </div>
          </div>
          <div className={s.featureItem}>
            <div className={s.featureIcon}><Download size={24} /></div>
            <div className={s.featureText}>
              <h4>엑셀/PDF 다운로드</h4>
              <p>작성된 문서는 언제든지 원본 양식의 엑셀이나 PDF 파일로 다운로드 가능합니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. FAQ 영역 */}
      <section className={s.faqSection}>
        <div className={s.faqContainer}>
          <h3 className={s.sectionTitle}>자주 묻는 질문</h3>
          <div className={s.faqItem}>
            <div className={s.faqQ}>Q. 점검표 양식을 수정할 수 있나요?</div>
            <div className={s.faqA}>
              네, 현장 상황에 맞게 점검 항목을 추가하거나 제외하는 등 커스텀이 가능합니다.
            </div>
          </div>
          <div className={s.faqItem}>
            <div className={s.faqQ}>Q. 이전에 지적된 사항을 불러올 수 있나요?</div>
            <div className={s.faqA}>
              네, 지난 점검 내역을 조회하여 조치 결과가 미흡한 항목을 다시 확인할 수 있습니다.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
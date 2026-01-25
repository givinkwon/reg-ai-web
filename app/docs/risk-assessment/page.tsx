'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { 
  AlertTriangle, Plus, 
  Clock, FileText, Sparkles, 
  MousePointerClick, Building2, Settings, Search, ShieldCheck, Download 
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

import RiskAssessmentWizard, { RiskAssessmentDraft } from './components/RiskAssessmentWizard';
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

import { useUserStore } from '../../store/user';
import { useChatStore } from '../../store/chat';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context
const GA_CTX = { page: 'SafetyDocs', section: 'RiskAssessment', area: 'Landing' } as const;

/* 유틸 함수 */
function getFilenameFromDisposition(disposition: string | null) {
  if (!disposition) return null;
  const utf8 = disposition.match(/filename\*=UTF-8''(.+)$/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1];
  return null;
}

export default function RiskPage() {
  const [isWriting, setIsWriting] = useState(false);
  
  // Store 상태
  const user = useUserStore((st) => st.user);
  const initialized = useUserStore((st) => st.initialized);
  const refreshSignupStatus = useUserStore((st) => st.refreshSignupStatus);
  const setUser = useUserStore((st) => st.setUser);

  const { showLoginModal, setShowLoginModal } = useChatStore();

  // 회원가입 추가정보 모달 상태
  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // ✅ GA: Page View Tracking (1회만 실행 보장)
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    // 유저 정보가 로드되었거나, 로드 시도 중일 때 트래킹 (로그인 여부 포함)
    viewTracked.current = true;

    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      is_logged_in: !!user?.email,
    });
  }, [user?.email]);

  // 1. 유저 상태 확인
  useEffect(() => {
    if (!initialized) return;

    if (!user?.email) {
      setForceExtraOpen(false);
      setAccountEmail(null);
      return;
    }
    if (user.isSignupComplete === false) {
      setAccountEmail(user.email);
      setForceExtraOpen(true);
      return;
    }
    if (user.isSignupComplete === true) {
      setForceExtraOpen(false);
      setAccountEmail(null);
      return;
    }
    (async () => {
      await refreshSignupStatus();
      const latest = useUserStore.getState().user;
      if (latest?.email && latest.isSignupComplete === false) {
        setAccountEmail(latest.email);
        setForceExtraOpen(true);
      } else {
        setForceExtraOpen(false);
        setAccountEmail(null);
      }
    })();
  }, [initialized, user?.email, user?.isSignupComplete, refreshSignupStatus]);

  // 2. 엑셀 다운로드 핸들러
  const handleSubmit = useCallback(async (draft: RiskAssessmentDraft, opts?: { signal?: AbortSignal; userEmail?: string }) => {
    if (!opts?.userEmail) throw new Error('이메일 정보가 누락되었습니다.');

    // ✅ GA: 제출 시작 트래킹 (작업 개수 포함)
    track(gaEvent(GA_CTX, 'SubmitRiskAssessment'), {
        ui_id: gaUiId(GA_CTX, 'SubmitRiskAssessment'),
        task_count: draft.tasks.length,
    });

    const flattenedItems = draft.tasks.flatMap(task => 
      (task.processes || []).flatMap(process => 
        (process.hazards || []).map(hazard => ({
          process_name: String(task.title || '').trim(),
          sub_process: String(process.title || '').trim(),
          risk_situation_result: String(hazard.title || '').trim(),
          judgement: hazard.judgement || '중',
          current_control_text: (hazard.current_control_text || '').trim(),
          mitigation_text: (hazard.mitigation_text || '').trim()
        }))
      )
    );

    const payload = {
      email: opts.userEmail,
      dateISO: draft.meta.dateISO,
      items: flattenedItems 
    };

    const response = await fetch('/api/risk-assessment?endpoint=export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: opts?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      try {
        const json = JSON.parse(errorText);
        throw new Error(json.detail?.[0]?.msg || json.message || '엑셀 생성 실패');
      } catch {
        throw new Error('서버 데이터 처리 중 오류가 발생했습니다.');
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = response.headers.get('content-disposition');
    const filename = getFilenameFromDisposition(cd) || `위험성평가_${draft.meta.dateISO}.xlsx`;

    a.download = filename;
    
    document.body.appendChild(a); 
    
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, []);

  // ✅ GA: 시작 버튼 핸들러
  const handleStartClick = () => {
    track(gaEvent(GA_CTX, 'ClickStart'), {
      ui_id: gaUiId(GA_CTX, 'ClickStart'),
      is_logged_in: !!user?.email,
    });
    setIsWriting(true);
  };

  return (
    <div className={s.container}>
      {!isWriting && (
        <>
          {/* === 1. Hero Section === */}
          <section className={s.actionSection}>
            <div className={s.actionBox}>
              <div className={s.iconWrapper}>
                <AlertTriangle size={40} color="white" strokeWidth={1.5} />
              </div>
              <h1 className={s.title}>위험성평가 (Risk Assessment)</h1>
              <p className={s.desc}>
                산업안전보건법에 따라 유해·위험요인을 파악하고 감소대책을 수립하세요.<br />
                AI가 공정별 위험요인을 추천하고, 엑셀 보고서를 자동으로 생성해드립니다.
              </p>
              
              <div className={s.btnGroup}>
                <Button className={s.whiteBtn} onClick={handleStartClick}> {/* ✅ 핸들러 연결 */}
                  <Plus size={20} className="mr-2" />
                  새 평가 작성하기
                </Button>
              </div>
            </div>
          </section>

          {/* === 2. Features === */}
          <section className={s.featureSection}>
            <div className={s.featureGrid}>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Clock size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>위험성 평가 3분 작성</h3>
                <p className={s.featureDesc}>
                  단, 3분이면 사업장 맞춤 위험성 평가가 완료됩니다. 작업과 공정을 선택하면 유해위험요인과 개선대책까지 자동 매칭됩니다!
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <FileText size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>맞춤 양식 자동 생성</h3>
                <p className={s.featureDesc}>
                  사업장 맞춤 표지와 위험성 발굴 리스트, 유해위험요인 별 상세 리포트, 이행관리까지 자동으로 생성됩니다.
                </p>
              </div>
              <div className={s.featureCard}>
                <div className={s.featureIconBox}>
                  <Sparkles size={40} strokeWidth={1.5} color="#2388FF"/>
                </div>
                <h3 className={s.featureTitle}>AI 항목 추천</h3>
                <p className={s.featureDesc}>
                  내 사업장의 업종 및 공정을 입력하면 유해위험요인과 법령근거, 개선 대책을 자동으로 추천합니다.
                </p>
              </div>
            </div>
          </section>

          {/* === 3. Preview Section === */}
          <section className={s.previewSection}>
            <h2 className={s.sectionHeader}>무엇이 만들어 지나요?</h2>
            
            {/* 1. 표지 */}
            <div className={s.previewRow}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/표지.png" 
                  alt="위험성 평가 보고서 표지" 
                  width={300} 
                  height={420} 
                  className={s.previewImgVertical}
                  priority
                />
                <div className={s.caption}>1. 표지</div>
              </div>
              <div className={s.previewContent}>
                <h3>맞춤 표지 자동 생성</h3>
                <p>사업장과 평가자, 평가 공정 작업까지<br/>자동으로 기입됩니다.</p>
              </div>
            </div>

            {/* 2. 리스트 */}
            <div className={`${s.previewRow} ${s.reverse}`}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/리스트.png" 
                  alt="위험성 평가 리스트" 
                  width={800} 
                  height={500} 
                  className={s.previewImg}
                />
                <div className={s.caption}>2. 위험성 평가 리스트</div>
              </div>
              <div className={s.previewContent}>
                <h3>전체 위험성 평가 리스트 제공</h3>
                <p>위험성 평가를 진행한 모든 공정에 대해<br/>현재 조치와 개선 대책까지<br/>한 눈에 확인할 수 있습니다.</p>
              </div>
            </div>

            {/* 3. 상세 보고서 */}
            <div className={s.previewRow}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/상세.png" 
                  alt="위험요인 별 상세 보고서" 
                  width={300} 
                  height={420}
                  className={s.previewImgVertical} 
                />
                <div className={s.caption}>3. 위험요인 별 상세 보고서</div>
              </div>
              <div className={s.previewContent}>
                <h3>각 위험 요인에 대한<br/>상세 분석 및 근거</h3>
                <p>위험성 결정 내용과 감소 대책 수립 과정을<br/>상세하게 기록한 보고서가 생성됩니다.</p>
              </div>
            </div>

             {/* 4. 이행 관리 */}
             <div className={`${s.previewRow} ${s.reverse}`}>
              <div className={s.previewImageWrapper}>
                <Image 
                  src="/docs/이행관리.png" 
                  alt="이행 관리" 
                  width={800} 
                  height={500}
                  className={s.previewImg} 
                />
                <div className={s.caption}>4. 이행 관리</div>
              </div>
              <div className={s.previewContent}>
                <h3>개선 대책 이행 여부<br/>지속적인 모니터링</h3>
                <p>수립된 대책이 실제로 이행되었는지<br/>점검하고 관리할 수 있는 양식을 제공합니다.</p>
              </div>
            </div>
          </section>

          {/* === 4. Guide Grid === */}
          <section className={s.guideSection}>
            <h2 className={s.sectionHeader}>사용 방법</h2>
            <div className={s.guideGrid}>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><MousePointerClick size={32} /></div>
                <h4>1. 새 평가 작성하기 클릭</h4>
                <p>위험성 평가의 시작은 복잡하지 않습니다. '새 평가 작성' 버튼을 눌러 우리 사업장에 딱 맞는 평가를 시작해 보세요.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Building2 size={32} /></div>
                <h4>2. 업종 별 작업 파악</h4>
                <p>사업장의 업종을 선택하세요. 건설, 제조, 서비스 등 각 산업군에 특화된 표준 작업 리스트를 불러옵니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Settings size={32} /></div>
                <h4>3. 세부 공정 파악</h4>
                <p>실제 현장에서 이루어지는 세부 공정을 선택합니다. 공정별 특성에 맞춰 더 정밀한 위험 요인 분석이 가능해집니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Search size={32} /></div>
                <h4>4. 유해 위험 요인 파악</h4>
                <p>5만 가지의 실제 현장 데이터베이스를 기반으로, 선택한 공정에 잠재된 유해 위험 요인을 자동으로 매칭합니다.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><ShieldCheck size={32} /></div>
                <h4>5. 개선 대책 수립</h4>
                <p>파악된 위험 요인에 대한 법적 기준과 표준 안전 대책을 즉시 제안합니다. 상황에 맞게 수정하여 적용하기만 하세요.</p>
              </div>
              <div className={s.guideItem}>
                <div className={s.guideIcon}><Download size={32} /></div>
                <h4>6. 문서 다운로드</h4>
                <p>모든 과정이 완료되었습니다. 공단 제출용 또는 사내 보관용 보고서 양식으로 깔끔하게 다운로드하세요.</p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* 모달 컴포넌트들 */}
      <RiskAssessmentWizard
        open={isWriting}
        onClose={() => {
            // ✅ GA: 모달 닫힘 트래킹
            track(gaEvent(GA_CTX, 'CloseWizard'), {
                ui_id: gaUiId(GA_CTX, 'CloseWizard'),
            });
            setIsWriting(false);
        }}
        onSubmit={handleSubmit}
        onRequireLogin={() => setShowLoginModal(true)}
      />

      {showLoginModal && !forceExtraOpen && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
      
      {forceExtraOpen && accountEmail && (
        <SignupExtraInfoModal
          email={accountEmail}
          onComplete={() => {
             const cur = useUserStore.getState().user;
             if (cur) setUser({ ...cur, isSignupComplete: true });
             setForceExtraOpen(false);
             setAccountEmail(null);
          }}
        />
      )}
    </div>
  );
}
'use client';

import { useState, useCallback } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import s from './page.module.css';

import RiskAssessmentWizard, { RiskAssessmentDraft } from './components/RiskAssessmentWizard';
import LoginPromptModal from '../components/LoginPromptModal';
import SignupExtraInfoModal from '../components/SignupExtraInfoModal';

import { useUserStore } from '../../store/user';
import { useChatStore } from '../../store/chat';

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
  const user = useUserStore((st) => st.user);
  const { showLoginModal, setShowLoginModal } = useChatStore();

  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // ✅ [수정] 서버 스펙에 맞춘 데이터 변환 및 제출 로직
  const handleSubmit = useCallback(async (draft: RiskAssessmentDraft, opts?: { signal?: AbortSignal; userEmail?: string }) => {
    
    if (!opts?.userEmail) throw new Error('이메일 정보가 누락되었습니다.');

    // 🚀 서버의 RiskExcelItem 리스트 구조로 평탄화(Flatten)
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

    // 🚀 서버가 정의한 ExportRiskExcelRequest 형식 구성
    const payload = {
      email: opts.userEmail,
      dateISO: draft.meta.dateISO,
      items: flattenedItems // ✅ tasks가 아니라 items 키를 사용합니다.
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

  return (
    <div className={s.container}>
      {!isWriting && (
        <section className={s.actionSection}>
          <div className={s.actionBox}>
            <div className={s.iconWrapper}><AlertTriangle size={40} color="white" /></div>
            <h1 className={s.title}>위험성평가 (Risk Assessment)</h1>
            <p className={s.desc}>작업 공정의 유해·위험요인을 파악하고 감소대책을 수립하세요.</p>
            <Button className={s.whiteBtn} onClick={() => setIsWriting(true)}>
              <Plus size={20} className="mr-2" /> 새 평가 작성하기
            </Button>
          </div>
        </section>
      )}

      <RiskAssessmentWizard
        open={isWriting}
        onClose={() => setIsWriting(false)}
        onSubmit={handleSubmit}
        onRequireLogin={() => setShowLoginModal(true)}
      />

      {showLoginModal && !forceExtraOpen && (
        <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
}
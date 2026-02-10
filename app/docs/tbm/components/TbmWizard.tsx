'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, FileText, Sparkles, Check, ArrowLeft, RefreshCw } from 'lucide-react';
import s from './TbmWizard.module.css';

import CenteredAlertModal from './ui/AlertModal';
import { useUserStore } from '@/app/store/user';

// ✅ Navbar 추가
import Navbar from '@/app/docs/components/Navbar';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ 딕셔너리 Import
import { TASK_DICTIONARY } from './taskDictionary';

const GA_CTX = { page: 'Docs', section: 'TBM', area: 'Wizard' } as const;

export type TbmAttendee = { name: string; contact?: string; };

export type TbmCreatePayload = {
  detailTasks: string[];
  attendees: TbmAttendee[];
  minorCategory?: string;
  workDescription?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  minorCategory?: string | null;
  companyName?: string | null;
  onRequireLogin?: () => void;
};

const norm = (v?: string | null) => (v ?? '').trim();

// 폼 데이터 캐싱 설정 (버전 v3 유지)
const FORM_CACHE_PREFIX = 'regai:tbm:createForm:v3';
const FORM_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일

type TbmFormCache = {
  v: 3;
  ts: number;
  workDescription: string;
  detailTasks: string[];
  attendees: TbmAttendee[];
};

function safeReadFormCache(key: string): TbmFormCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 3) return null;
    if (Date.now() - parsed.ts > FORM_CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function safeWriteFormCache(key: string, payload: TbmFormCache) {
  try { localStorage.setItem(key, JSON.stringify(payload)); } catch {}
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ac.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('요청 시간이 초과되었습니다.');
    throw err;
  } finally { clearTimeout(t); }
}

export default function TbmWizard({
  open,
  onClose,
  minorCategory: minorFromProps,
  companyName: companyNameProp = null,
  onRequireLogin,
}: Props) {
  const user = useUserStore((st) => st.user);
  
  // --- State: Wizard Phase ---
  const [phase, setPhase] = useState<'input' | 'submitting' | 'complete'>('input');

  // --- State: Data ---
  const [workDescription, setWorkDescription] = useState<string>('');
  const [detailTasks, setDetailTasks] = useState<string[]>([]);
  const [attendees, setAttendees] = useState<TbmAttendee[]>([{ name: '', contact: '' }]);
  const [accountCompanyName, setAccountCompanyName] = useState<string | null>(norm(companyNameProp) || null);

  // --- State: Alerts ---
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ title: string; lines: string[]; confirmText: string; showClose: boolean }>({ 
    title: '', lines: [], confirmText: '확인', showClose: false 
  });
  const alertOnConfirmRef = useRef<(() => void) | null>(null);

  const scopeKey = useMemo(() => `${FORM_CACHE_PREFIX}:guest:${norm(minorFromProps) || 'ALL'}`, [minorFromProps]);

  // --- Effect: GA View ---
  useEffect(() => {
    if (open && phase === 'input') {
      track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View') });
    }
  }, [open, phase]);

  // --- Effect: AI 감지 로직 ---
  useEffect(() => {
    if (!workDescription.trim()) {
      setDetailTasks([]);
      return;
    }
    const handler = setTimeout(() => {
      const input = workDescription.replace(/\s+/g, ' ');
      const matched = TASK_DICTIONARY.filter(taskName => input.includes(taskName));
      setDetailTasks(matched);
    }, 300);
    return () => clearTimeout(handler);
  }, [workDescription]);

  // --- Effect: 캐시 로드/저장 ---
  useEffect(() => {
    if (!open) return;
    const cached = safeReadFormCache(scopeKey);
    if (cached && phase === 'input') {
      setWorkDescription(cached.workDescription || '');
      setAttendees(cached.attendees.length ? cached.attendees : [{ name: '', contact: '' }]);
    }
  }, [open, scopeKey]);

  useEffect(() => {
    if (!open || phase !== 'input') return;
    safeWriteFormCache(scopeKey, {
      v: 3,
      ts: Date.now(),
      workDescription,
      detailTasks,
      attendees,
    });
  }, [workDescription, detailTasks, attendees, open, phase, scopeKey]);

  // --- Effect: 회사명 로드 ---
  useEffect(() => {
    if (!open || !user?.email || accountCompanyName) return;
    const storeCompany = (user as any)?.secondary_info?.company;
    if (storeCompany) {
      setAccountCompanyName(storeCompany);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/accounts/find-by-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        if (res.ok) {
          const data = await res.json();
          const comp = data?.user?.secondary_info?.company || data?.secondary_info?.company;
          if (comp) setAccountCompanyName(comp);
        }
      } catch {}
    })();
  }, [open, user, accountCompanyName]);

  const openAlert = (cfg: typeof alertConfig, onConfirm?: () => void) => {
    setAlertConfig(cfg);
    alertOnConfirmRef.current = onConfirm || null;
    setAlertOpen(true);
  };

  const closeAlert = () => {
    setAlertOpen(false);
    alertOnConfirmRef.current = null;
  };

  const handleSubmit = async () => {
    if (phase === 'submitting') return;

    if (!user?.email) {
      openAlert({
        title: '로그인이 필요합니다',
        lines: ['TBM 활동일지를 생성하려면 로그인이 필요합니다.'],
        confirmText: '로그인하기',
        showClose: true,
      }, () => onRequireLogin?.());
      return;
    }

    const cleanedTasks = detailTasks.map(norm).filter(Boolean);
    const cleanedAttendees = attendees.map(a => ({ name: norm(a.name), contact: norm(a.contact) })).filter(a => a.name);

    track(gaEvent(GA_CTX, 'ClickSubmit'), {
      ui_id: gaUiId(GA_CTX, 'ClickSubmit'),
      task_count: cleanedTasks.length,
      is_logged_in: !!user.email,
    });

    const body = {
      email: user.email,
      companyName: accountCompanyName || '',
      dateISO: new Date().toISOString().split('T')[0],
      minorCategory: minorFromProps || null,
      workDescription: workDescription,
      detailTasks: cleanedTasks,
      attendees: cleanedAttendees,
    };

    setPhase('submitting'); 

    try {
      const res = await fetchWithTimeout(
        '/api/risk-assessment?endpoint=tbm-export-excel',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        90000 
      );

      if (!res.ok) throw new Error(`API Error: ${res.status}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TBM활동일지_${body.dateISO}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setPhase('complete');

    } catch (e: any) {
      console.warn('TBM Generation Failed', e);
      openAlert({
        title: '생성 실패',
        lines: ['일지 생성 중 오류가 발생했습니다.', '잠시 후 다시 시도해주세요.'],
        confirmText: '확인',
        showClose: false, 
      });
      setPhase('input'); 
    }
  };

  const canSubmit = (detailTasks.length > 0 || workDescription.trim().length > 0) && phase !== 'submitting';

  if (!open) return null;

  // ----------------------------------------------------
  // ✅ Phase 3: Complete View
  // ----------------------------------------------------
  if (phase === 'complete') {
    return (
      <div className={s.wrap}>
        {/* ✅ Navbar 추가 */}
        <div style={{ position: 'relative', zIndex: 100 }}>
          <Navbar />
        </div>
        <div className={s.completeView}>
          <div className={s.completeIcon}>
            <Check size={42} strokeWidth={3} />
          </div>
          <h2 className={s.completeTitle}>TBM 일지 생성 완료!</h2>
          <p className={s.completeDesc}>
            파일 다운로드가 시작되었습니다.<br/>
            생성된 문서는 <span className={s.highlight}>문서함</span>과 <span className={s.highlight}>이메일</span>에서도<br/>
            확인하실 수 있습니다.
          </p>
          <div style={{ display: 'flex', gap: '1rem', width: '100%', maxWidth: '400px', justifyContent: 'center' }}>
            <button 
              className={s.submitBtn} 
              style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', color: '#475569' }}
              onClick={() => { setPhase('input'); }}
            >
              <RefreshCw size={18} /> 추가 작성하기
            </button>
            <button 
              className={s.submitBtn} 
              onClick={onClose}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // ✅ Phase 1 & 2: Input & Submitting
  // ----------------------------------------------------
  return (
    <div className={s.wrap}>
      
      {/* ✅ Navbar 추가: 최상단 고정 */}
      <div style={{ position: 'relative', zIndex: 100 }}>
        <Navbar />
      </div>

      {phase === 'submitting' && (
        <div className={s.loadingOverlay}>
          <div className={s.loadingPopup}>
             <RefreshCw size={40} className={s.spinner} />
             <h3 className={s.loadingTitle}>AI가 TBM 일지를 작성 중입니다</h3>
             <p className={s.loadingDesc}>
               작업 내용을 분석하고 위험성평가 DB를 조회하여<br/>
               최적의 안전 대책을 수립하고 있습니다.
             </p>
          </div>
        </div>
      )}

      {/* ✅ Header: centerWrap 적용 */}
      <div className={s.header}>
        <div className={s.centerWrap}>
          <div className={s.headerLeft}>
            <button className={s.closeBtn} onClick={onClose} disabled={phase === 'submitting'}>
              <ArrowLeft size={20} /> 나가기
            </button>
            <h2 className={s.title}>AI TBM 작성</h2>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className={s.content}>
        {/* s.container가 이미 max-width와 중앙 정렬을 가지고 있을 수 있지만, centerWrap 패턴에 맞추려면 아래처럼 감싸거나 s.container를 수정해야 합니다. */}
        {/* 여기서는 s.content 자체에 패딩과 정렬이 있으므로 그대로 둡니다. */}
        <div className={s.container}>
          
          <div className={s.card}>
            <label className={s.label}>오늘 어떤 작업을 하시나요?</label>
            <textarea
              className={s.textarea}
              placeholder="예) 3층 배관 용접 작업 진행, 불티 비산 방지포 설치 예정"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              disabled={phase === 'submitting'}
            />
            
            {detailTasks.length > 0 && (
              <div className={s.aiSection}>
                <div className={s.aiHeader}>
                  <Sparkles size={16} />
                  <span>AI가 감지한 표준 작업</span>
                </div>
                <div className={s.tagGroup}>
                  {detailTasks.map((task, idx) => (
                    <span key={idx} className={s.tag}>{task}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={s.card}>
            <div className={s.attendeeHeader}>
              <span className={s.label} style={{marginBottom:0}}>참석자 명단 (선택)</span>
              <button 
                className={s.addBtn} 
                onClick={() => setAttendees(p => [...p, { name: '', contact: '' }])}
                disabled={phase === 'submitting'}
              >
                <Plus size={16} /> 명단 추가
              </button>
            </div>

            <div className={s.table}>
              {attendees.map((a, i) => (
                <div key={i} className={s.trow}>
                  <input
                    className={s.inputCell}
                    placeholder="이름"
                    value={a.name}
                    onChange={e => {
                      const n = [...attendees]; n[i].name = e.target.value; setAttendees(n);
                    }}
                    disabled={phase === 'submitting'}
                  />
                  <input
                    className={s.inputCell}
                    placeholder="연락처 (선택)"
                    value={a.contact}
                    onChange={e => {
                      const n = [...attendees]; n[i].contact = e.target.value; setAttendees(n);
                    }}
                    disabled={phase === 'submitting'}
                  />
                  <button
                    className={s.removeBtn}
                    onClick={() => setAttendees(p => p.filter((_, idx) => idx !== i))}
                    disabled={phase === 'submitting'}
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ✅ Footer: centerWrap 적용 */}
      <div className={s.footer}>
        <div className={s.centerWrap}>
          <button 
            className={s.submitBtn} 
            onClick={handleSubmit} 
            disabled={!canSubmit}
          >
            <FileText size={20} />
            {phase === 'submitting' ? '문서 생성 중...' : 'TBM 일지 생성하기'}
          </button>
        </div>
      </div>

      <CenteredAlertModal
        open={alertOpen}
        title={alertConfig.title}
        lines={alertConfig.lines}
        confirmText={alertConfig.confirmText}
        showClose={alertConfig.showClose}
        onConfirm={() => {
          const fn = alertOnConfirmRef.current;
          closeAlert();
          fn?.();
        }}
        onClose={closeAlert}
      />
    </div>
  );
}
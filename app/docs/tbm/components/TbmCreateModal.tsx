'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, FileText } from 'lucide-react';
import s from './TbmCreateModal.module.css';

import TbmDetailTaskTagInput from './TbmDetailTaskTagInput';
import CenteredAlertModal from './ui/AlertModal';
import { useUserStore } from '@/app/store/user';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context 정의
const GA_CTX = { page: 'Docs', section: 'TBM', area: 'CreateModal' } as const;

export type TbmAttendee = {
  name: string;
  contact?: string;
};

export type TbmCreatePayload = {
  detailTasks: string[];
  attendees: TbmAttendee[];
  workTags?: string[];
  jobTitle?: string;
  minorCategory?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit?: (payload: TbmCreatePayload) => void | Promise<void>;
  minorCategory?: string | null;
  defaultValue?: Partial<TbmCreatePayload>;
  userEmail?: string | null;
  companyName?: string | null;
  onRequireLogin?: () => void;
};

const norm = (v?: string | null) => (v ?? '').trim();

// 폼 데이터 캐싱 설정
const FORM_CACHE_PREFIX = 'regai:tbm:createForm:v2';
const FORM_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180;

type TbmFormCache = {
  v: 2;
  ts: number;
  user: 'guest';
  minorScope: string;
  detailTasks: string[];
  attendees: TbmAttendee[];
};

function formCacheKey(minorScope: string) {
  const m = norm(minorScope) || 'ALL';
  return `${FORM_CACHE_PREFIX}:guest:${encodeURIComponent(m)}`;
}

function safeReadFormCache(key: string): TbmFormCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TbmFormCache;
    if (parsed?.v !== 2) return null;
    if (Date.now() - parsed.ts > FORM_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteFormCache(key: string, payload: TbmFormCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {}
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(input, { ...init, signal: ac.signal });
    return res;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다.');
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

export default function TbmCreateModal({
  open,
  onClose,
  onSubmit,
  minorCategory: minorFromProps,
  defaultValue,
  userEmail: userEmailProp = null,
  companyName: companyNameProp = null,
  onRequireLogin,
}: Props) {
  const user = useUserStore((st) => st.user);
  
  const [minorCategory, setMinorCategory] = useState<string | null>(minorFromProps ?? null);
  const [detailTasks, setDetailTasks] = useState<string[]>([]);
  const [attendees, setAttendees] = useState<TbmAttendee[]>([{ name: '', contact: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [accountCompanyName, setAccountCompanyName] = useState<string | null>(norm(companyNameProp) || null);
  const [accountLoading, setAccountLoading] = useState(false);

  // 알림 모달
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', lines: [] as string[], confirmText: '확인', showClose: false });
  const alertOnConfirmRef = useRef<(() => void) | null>(null);

  const scopeKey = useMemo(() => formCacheKey(norm(minorCategory) || 'ALL'), [minorCategory]);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      return;
    }
    const cached = safeReadFormCache(scopeKey);
    if (cached) {
      setDetailTasks(cached.detailTasks);
      setAttendees(cached.attendees.length ? cached.attendees : [{ name: '', contact: '' }]);
    }
  }, [open, scopeKey]);

  useEffect(() => {
    if (!open) return;
    if (detailTasks.length === 0 && attendees.length === 0) return;
    safeWriteFormCache(scopeKey, {
      v: 2,
      ts: Date.now(),
      user: 'guest',
      minorScope: norm(minorCategory) || 'ALL',
      detailTasks,
      attendees,
    });
  }, [detailTasks, attendees, scopeKey, open, minorCategory]);

  // 회사명 로드
  useEffect(() => {
    if (!open || !user?.email || accountCompanyName) return;
    
    const storeCompany = (user as any)?.secondary_info?.company;
    if (storeCompany) {
      setAccountCompanyName(storeCompany);
      return;
    }

    (async () => {
      setAccountLoading(true);
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
      } catch { } finally {
        setAccountLoading(false);
      }
     })();
  }, [open, user, user?.email, accountCompanyName]);

  const openAlert = (cfg: typeof alertConfig, onConfirm?: () => void) => {
    setAlertConfig(cfg);
    alertOnConfirmRef.current = onConfirm || null;
    setAlertOpen(true);
  };

  const closeAlert = () => {
    setAlertOpen(false);
    alertOnConfirmRef.current = null;
  };

  const runBackgroundDownload = async (body: any) => {
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
      
      console.log('TBM 다운로드 완료');
    } catch (e: any) {
      console.warn('백그라운드 다운로드 실패 (이메일 발송 여부 확인 필요)', e);
    }
  };

  const handleSubmit = () => {
    if (submitting) return;

    if (!user?.email) {
      openAlert({
        title: '로그인이 필요합니다',
        lines: ['TBM 활동일지를 생성하려면 로그인이 필요합니다.'],
        confirmText: '로그인하기',
        showClose: true,
      }, () => {
        onRequireLogin?.();
      });
      return;
    }

    const cleanedTasks = detailTasks.map(norm).filter(Boolean);
    const cleanedAttendees = attendees.map(a => ({ name: norm(a.name), contact: norm(a.contact) })).filter(a => a.name);

    // ✅ GA: 제출 시작 트래킹 (작업 개수, 참석자 수 포함)
    track(gaEvent(GA_CTX, 'ClickSubmit'), {
        ui_id: gaUiId(GA_CTX, 'ClickSubmit'),
        task_count: cleanedTasks.length,
        attendee_count: cleanedAttendees.length,
        is_logged_in: !!user.email,
    });

    const body = {
      email: user.email,
      companyName: accountCompanyName || '',
      dateISO: new Date().toISOString().split('T')[0],
      minorCategory: minorCategory || null,
      detailTasks: cleanedTasks,
      attendees: cleanedAttendees,
    };

    setSubmitting(true);

    openAlert({
      title: 'TBM 생성 요청 완료',
      lines: [
        '일지 생성이 시작되었습니다.',
        '완료 시 자동으로 다운로드되며,',
        '시간이 걸릴 경우 이메일/문서함에서 확인 가능합니다.'
      ],
      confirmText: '확인',
      showClose: false,
    }, () => {
      onClose();
    });

    runBackgroundDownload(body);
  };

  const canSubmit = detailTasks.length > 0 && attendees.some(a => a.name) && !submitting;

  if (!open) return null;

  return (
    <>
      <div className={s.overlay} role="dialog" aria-modal="true">
        <div className={s.modal}>
          <div className={s.topBar}>
            <span className={s.pill}>TBM 활동일지</span>
            {/* ✅ GA: 닫기 버튼 추적 */}
            <button 
                className={s.iconBtn} 
                onClick={() => {
                    track(gaEvent(GA_CTX, 'Close'), { ui_id: gaUiId(GA_CTX, 'Close') });
                    onClose();
                }} 
                disabled={submitting}
                data-ga-event="Close"
                data-ga-id={gaUiId(GA_CTX, 'Close')}
            >
              <X size={20} />
            </button>
          </div>

          <div className={s.card}>
            <div className={s.header}>
              <h3 className={s.title}>TBM 작성</h3>
              <p className={s.desc}>오늘 진행할 작업과 참석자를 입력해주세요.</p>
            </div>

            <label className={s.label}>금일 작업 (태그 입력)</label>
            <TbmDetailTaskTagInput
              value={detailTasks}
              onChange={setDetailTasks}
              minorCategory={minorCategory}
            />

            <div className={s.sectionRow}>
              <span className={s.sectionTitle}>참석자 명단</span>
              {/* ✅ GA: 참석자 추가 버튼 추적 */}
              <button 
                className={s.addBtn} 
                onClick={() => {
                    track(gaEvent(GA_CTX, 'AddAttendee'), { ui_id: gaUiId(GA_CTX, 'AddAttendee') });
                    setAttendees(p => [...p, { name: '', contact: '' }]);
                }}
                data-ga-event="AddAttendee"
                data-ga-id={gaUiId(GA_CTX, 'AddAttendee')}
              >
                <Plus size={16} /> 추가
              </button>
            </div>

            <div className={s.table}>
              <div className={s.thead}>
                <div>이름</div>
                <div>연락처</div>
                <div></div>
              </div>
              {attendees.map((a, i) => (
                <div key={i} className={s.trow}>
                  <input
                    className={s.inputSm}
                    placeholder="이름"
                    value={a.name}
                    onChange={e => {
                      const newAtt = [...attendees];
                      newAtt[i].name = e.target.value;
                      setAttendees(newAtt);
                    }}
                  />
                  <input
                    className={s.inputSm}
                    placeholder="연락처 (선택)"
                    value={a.contact}
                    onChange={e => {
                      const newAtt = [...attendees];
                      newAtt[i].contact = e.target.value;
                      setAttendees(newAtt);
                    }}
                  />
                  {/* ✅ GA: 참석자 삭제 버튼 추적 */}
                  <button
                    className={s.removeBtn}
                    onClick={() => {
                        track(gaEvent(GA_CTX, 'RemoveAttendee'), { ui_id: gaUiId(GA_CTX, 'RemoveAttendee') });
                        setAttendees(p => p.filter((_, idx) => idx !== i));
                    }}
                    data-ga-event="RemoveAttendee"
                    data-ga-id={gaUiId(GA_CTX, 'RemoveAttendee')}
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>

            {/* ✅ GA: 제출 버튼 (핸들러 내부에서 track 호출) */}
            <button 
                className={s.primaryBtn} 
                onClick={handleSubmit} 
                disabled={!canSubmit}
                data-ga-event="ClickSubmit"
                data-ga-id={gaUiId(GA_CTX, 'ClickSubmit')}
            >
              <FileText size={18} />
              {submitting ? '생성 요청 중...' : 'TBM 일지 생성하기'}
            </button>
            
            {accountLoading && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8, textAlign: 'center' }}>회사 정보를 불러오는 중...</div>}
          </div>
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
          if (fn) {
            setTimeout(() => {
              fn();
            }, 100); 
          }
        }}
        onClose={closeAlert}
      />
    </>
  );
}
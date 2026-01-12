'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, FileText } from 'lucide-react';
import { flushSync } from 'react-dom';
import s from './TbmCreateModal.module.css';

import TbmDetailTaskTagInput from './TbmDetailTaskTagInput';
import ProgressDownloadModal from './ui/ProgressDownloadModal';
import { useUserStore } from '@/app/store/user';

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

  onSubmit?: (payload: TbmCreatePayload) => void;

  minorCategory?: string | null;
  defaultValue?: Partial<TbmCreatePayload>;

  userEmail?: string | null;
  companyName?: string | null;
  onRequireLogin?: () => void;
};

const norm = (v?: string | null) => (v ?? '').trim();

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
    if (!parsed?.ts) return null;
    if (!Array.isArray(parsed?.detailTasks) || !Array.isArray(parsed?.attendees)) return null;
    if (Date.now() - parsed.ts > FORM_CACHE_TTL_MS) return null;

    const hasAny =
      parsed.detailTasks.some((t) => norm(t)) || parsed.attendees.some((a) => norm(a?.name));
    if (!hasAny) return null;

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

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
  const [minorCategory, setMinorCategory] = useState<string | null>(minorFromProps ?? null);

  const [detailTasks, setDetailTasks] = useState<string[]>(
    (defaultValue?.detailTasks ?? defaultValue?.workTags ?? []).map(norm).filter(Boolean),
  );

  const [attendees, setAttendees] = useState<TbmAttendee[]>(
    defaultValue?.attendees?.length
      ? (defaultValue.attendees as TbmAttendee[])
      : [{ name: '', contact: '' }],
  );

  const [submitting, setSubmitting] = useState(false);

  const [accountCompanyName, setAccountCompanyName] = useState<string | null>(
    norm(companyNameProp) ? norm(companyNameProp) : null,
  );
  const [accountLoading, setAccountLoading] = useState(false);

  // ✅ ProgressDownloadModal 상태
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressError, setProgressError] = useState<string | null>(null);

  const progressTimerRef = useRef<number | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  const stopProgressTimer = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const startFakeProgress = () => {
    stopProgressTimer();
    progressTimerRef.current = window.setInterval(() => {
      setProgressPercent((prev) => {
        if (prev >= 92) return prev; // ✅ 성공 시에만 100 찍기
        const bump = prev < 25 ? 3 : prev < 50 ? 2 : 1;
        return Math.min(92, prev + bump);
      });
    }, 350);
  };

  const scopeMinor = useMemo(() => norm(minorCategory) || 'ALL', [minorCategory]);
  const scopeKey = useMemo(() => formCacheKey(scopeMinor), [scopeMinor]);

  const minorForApi = useMemo(() => {
    const m = norm(minorCategory);
    if (!m) return null;
    if (m.toUpperCase() === 'ALL') return null;
    return m;
  }, [minorCategory]);

  const user = useUserStore((st) => st.user);
  const effectiveEmail = norm(user?.email) || norm(userEmailProp) || '';

  const pickCompanyFromResponse = (data: any): string | null => {
    const c =
      data?.user?.secondary_info?.company ??
      data?.secondary_info?.company ??
      data?.secondaryInfo?.company ??
      data?.company ??
      null;
    return norm(c) ? norm(c) : null;
  };

  const fetchCompanyByEmail = async (email: string, signal?: AbortSignal): Promise<string | null> => {
    try {
      const res = await fetch('/api/accounts/find-by-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal,
      });
      if (!res.ok) return null;

      const data = await res.json().catch(() => null);
      return pickCompanyFromResponse(data);
    } catch {
      return null;
    }
  };

  // ✅ 모달 열릴 때 회사명 미리 로드
  useEffect(() => {
    if (!open) return;
    if (!effectiveEmail) return;
    if (accountCompanyName) return;

    const ac = new AbortController();
    (async () => {
      setAccountLoading(true);
      const c = await fetchCompanyByEmail(effectiveEmail, ac.signal);
      if (!ac.signal.aborted) setAccountCompanyName(c);
      if (!ac.signal.aborted) setAccountLoading(false);
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectiveEmail]);

  useEffect(() => {
    if (!open) return;

    const dvTasks = (defaultValue?.detailTasks ?? defaultValue?.workTags ?? [])
      .map(norm)
      .filter(Boolean);

    const dvAtt =
      (defaultValue?.attendees as TbmAttendee[] | undefined)?.map((a) => ({
        name: norm(a?.name),
        contact: norm(a?.contact ?? ''),
      })) ?? [];

    const hasDefaultTasks = dvTasks.length > 0;
    const hasDefaultAtt = dvAtt.some((a) => a.name);

    if (hasDefaultTasks || hasDefaultAtt) {
      setDetailTasks(dvTasks);
      setAttendees(dvAtt.length ? dvAtt : [{ name: '', contact: '' }]);
      return;
    }

    const cached = safeReadFormCache(scopeKey);
    if (cached) {
      setDetailTasks((cached.detailTasks ?? []).map(norm).filter(Boolean));
      const ca =
        (cached.attendees ?? [])
          .map((a) => ({ name: norm(a?.name), contact: norm(a?.contact ?? '') }))
          .filter((a) => a.name) ?? [];
      setAttendees(ca.length ? ca : [{ name: '', contact: '' }]);
    } else {
      setDetailTasks([]);
      setAttendees([{ name: '', contact: '' }]);
    }
  }, [open, defaultValue, scopeKey]);

  useEffect(() => {
    if (!open) return;
    const mp = norm(minorFromProps);
    if (mp) setMinorCategory(mp);
  }, [open, minorFromProps]);

  // ✅ submitting 동안도 스크롤 잠금
  useEffect(() => {
    if (!open && !submitting) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, submitting]);

  useEffect(() => {
    if (!open) return;

    const tasksToSave = Array.from(new Set(detailTasks.map(norm).filter(Boolean)));
    const attToSave =
      attendees
        .map((a) => ({ name: norm(a?.name), contact: norm(a?.contact ?? '') }))
        .filter((a) => a.name) ?? [];

    if (tasksToSave.length === 0 && attToSave.length === 0) return;

    safeWriteFormCache(scopeKey, {
      v: 2,
      ts: Date.now(),
      user: 'guest',
      minorScope: scopeMinor,
      detailTasks: tasksToSave,
      attendees: attToSave,
    });
  }, [open, detailTasks, attendees, scopeKey, scopeMinor]);

  const updateAttendee = (idx: number, patch: Partial<TbmAttendee>) => {
    setAttendees((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const addAttendee = () => setAttendees((prev) => [...prev, { name: '', contact: '' }]);
  const removeAttendee = (idx: number) => setAttendees((prev) => prev.filter((_, i) => i !== idx));
  const onChangeTasks = (next: string[]) => setDetailTasks(next);

  const canSubmit =
    detailTasks.map(norm).filter(Boolean).length > 0 &&
    attendees.some((a) => norm(a.name).length > 0) &&
    !submitting;

  const downloadBlob = async (res: Response) => {
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const match = cd.match(/filename\*\=UTF-8''(.+)$/);
    const filename = match
      ? decodeURIComponent(match[1])
      : `TBM활동일지_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const closeProgress = () => {
    stopProgressTimer();
    exportAbortRef.current?.abort();
    exportAbortRef.current = null;
    setProgressOpen(false);
    setProgressError(null);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (!user?.email) {
      alert('TBM 활동일지를 생성하려면 로그인이 필요합니다.');
      onRequireLogin?.();
      return;
    }

    const cleanedTasks = Array.from(new Set(detailTasks.map(norm).filter(Boolean)));
    const cleanedAttendees = attendees
      .map((a) => ({ name: norm(a.name), contact: norm(a.contact ?? '') }))
      .filter((a) => a.name.length > 0);

    const payloadForParent: TbmCreatePayload = {
      detailTasks: cleanedTasks,
      workTags: cleanedTasks,
      attendees: cleanedAttendees,
      jobTitle: cleanedTasks.join(', '),
      minorCategory: norm(minorCategory) || 'ALL',
    };

    let success = false;

    try {
      // ✅ 1) Progress 모달을 "무조건 먼저" 띄우기 (렌더 커밋 강제)
      flushSync(() => {
        setSubmitting(true);
        setProgressError(null);
        setProgressPercent(1);
        setProgressOpen(true);
      });

      await nextFrame();
      startFakeProgress();

      onSubmit?.(payloadForParent);

      // ✅ 2) 퍼센트 점프(체감 개선)
      setProgressPercent((p) => Math.max(p, 18));

      let company =
        accountCompanyName ??
        (norm((user as any)?.secondary_info?.company) ? norm((user as any)?.secondary_info?.company) : null) ??
        (norm(companyNameProp) ? norm(companyNameProp) : null);

      if (!company) {
        setProgressPercent((p) => Math.max(p, 35));
        const fetched = await fetchCompanyByEmail(user.email);
        if (fetched) {
          company = fetched;
          setAccountCompanyName(fetched);
        }
      }

      setProgressPercent((p) => Math.max(p, 55));

      const body = {
        email: user.email,
        companyName: company ?? null,
        dateISO: new Date().toISOString().slice(0, 10),
        minorCategory: minorForApi,
        detailTasks: cleanedTasks,
        attendees: cleanedAttendees,
      };

      // ✅ 3) 취소 가능 (AbortController)
      const ac = new AbortController();
      exportAbortRef.current = ac;

      const res = await fetch('/api/risk-assessment?endpoint=tbm-export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user.email,
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        stopProgressTimer();
        exportAbortRef.current = null;

        setProgressError(`TBM 엑셀 생성 실패 (${res.status})`);
        // ✅ 에러시에는 모달을 유지(팝업 위 팝업) + 뒤는 submitting 풀어서 다시 수정 가능
        setSubmitting(false);

        alert(`TBM 엑셀 생성 실패 (${res.status}) ${txt.slice(0, 200)}`);
        return;
      }

      setProgressPercent((p) => Math.max(p, 85));

      await downloadBlob(res);

      stopProgressTimer();
      setProgressPercent(100);

      success = true;
    } catch (e: any) {
      stopProgressTimer();
      exportAbortRef.current = null;

      if (e?.name === 'AbortError') {
        setProgressError('요청이 취소되었습니다.');
        setSubmitting(false);
        return;
      }

      setProgressError('생성 중 오류가 발생했습니다.');
      setSubmitting(false);
      throw e;
    } finally {
      stopProgressTimer();
      exportAbortRef.current = null;

      if (success) {
        setProgressOpen(false);
        setSubmitting(false);
        onClose();
      }
    }
  };

  return (
    <>
      {open && (
        <div
          className={s.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="TBM 활동일지"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (submitting) return;
            onClose();
          }}
        >
          <div className={s.modal}>
            <div className={s.topBar}>
              <span className={s.pill}>TBM 활동일지</span>
              <button
                type="button"
                className={s.iconBtn}
                onClick={() => {
                  if (submitting) return;
                  onClose();
                }}
                aria-label="닫기"
                disabled={submitting}
              >
                <X size={18} />
              </button>
            </div>

            <div className={s.card}>
              <div className={s.header}>
                <h3 className={s.title}>TBM 활동일지</h3>
                <p className={s.desc}>
                  금일 작업(세부작업 태그)을 입력하면 REG AI가 작업에 따라 알맞은 TBM 활동일지를 생성합니다.
                </p>
              </div>

              <label className={s.label}>금일 작업(세부작업 태그)</label>
              <TbmDetailTaskTagInput value={detailTasks} onChange={onChangeTasks} minorCategory={minorForApi} />

              <div className={s.sectionRow}>
                <span className={s.sectionTitle}>참석자 명단</span>
                <button type="button" className={s.addBtn} onClick={addAttendee} disabled={submitting}>
                  <Plus size={16} />
                  새로운 작업자 추가
                </button>
              </div>

              <div className={s.table}>
                <div className={s.thead}>
                  <div>이름</div>
                  <div>전화번호</div>
                  <div />
                </div>

                {attendees.map((a, idx) => (
                  <div key={idx} className={s.trow}>
                    <input
                      className={s.inputSm}
                      value={a.name}
                      onChange={(e) => updateAttendee(idx, { name: e.target.value })}
                      placeholder="이름"
                      disabled={submitting}
                    />
                    <input
                      className={s.inputSm}
                      value={a.contact ?? ''}
                      onChange={(e) => updateAttendee(idx, { contact: e.target.value })}
                      placeholder="010-1234-5678"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      className={s.removeBtn}
                      onClick={() => removeAttendee(idx)}
                      aria-label="삭제"
                      disabled={submitting || attendees.length <= 1}
                      title={attendees.length <= 1 ? '최소 1명은 필요합니다' : '삭제'}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className={s.primaryBtn} disabled={!canSubmit} onClick={handleSubmit}>
                <FileText size={18} />
                {submitting ? '생성 중…' : 'TBM 활동일지 생성하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 팝업 위 팝업: Portal로 body 최상단에 뜸 */}
      <ProgressDownloadModal
        open={progressOpen}
        percent={progressPercent}
        title="TBM 활동일지를 생성하고 있어요"
        errorText={progressError}
        onCancel={() => {
          closeProgress();
        }}
      />
    </>
  );
}

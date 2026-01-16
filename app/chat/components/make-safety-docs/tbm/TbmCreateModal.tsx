'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, FileText } from 'lucide-react';
import s from './TbmCreateModal.module.css';

import TbmDetailTaskTagInput from './TbmDetailTaskTagInput';
import CenteredAlertModal from './ui/AlertModal';
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

  onSubmit?: (payload: TbmCreatePayload) => void | Promise<void>;

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

/** ✅ fetch 타임아웃(모바일에서 다운로드/응답 대기 스톨 방지) */
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    // 외부 signal이 있으면 함께 abort 되도록 연결
    const ext = init.signal;
    if (ext) {
      if (ext.aborted) ac.abort();
      else ext.addEventListener('abort', () => ac.abort(), { once: true });
    }

    return await fetch(input, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/** ✅ 모바일/태블릿(터치)에서는 blob 다운로드를 생략하기 위한 감지 */
function detectCoarsePointer() {
  try {
    const mq = window.matchMedia?.('(pointer: coarse)');
    const coarse = !!mq?.matches;
    const touch = (navigator as any)?.maxTouchPoints > 0;
    return coarse || touch;
  } catch {
    return false;
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
  const [minorCategory, setMinorCategory] = useState<string | null>(minorFromProps ?? null);

  const [detailTasks, setDetailTasks] = useState<string[]>(
    (defaultValue?.detailTasks ?? defaultValue?.workTags ?? []).map(norm).filter(Boolean),
  );

  const [attendees, setAttendees] = useState<TbmAttendee[]>(
    defaultValue?.attendees?.length
      ? (defaultValue.attendees as TbmAttendee[])
      : [{ name: '', contact: '' }],
  );

  // ✅ 제출 중복 방지용
  const [submitting, setSubmitting] = useState(false);

  // ✅ 모바일/태블릿 터치 환경 감지: blob 다운로드 생략에 사용
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia?.('(pointer: coarse)');
    const sync = () => setIsCoarsePointer(detectCoarsePointer());
    sync();
    mq?.addEventListener?.('change', sync);
    return () => mq?.removeEventListener?.('change', sync);
  }, [open]);

  // ✅ 모달 재오픈 시 submitting이 남아있는 상태를 방지(모바일에서 특히 중요)
  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
  }, [open]);

  const [accountCompanyName, setAccountCompanyName] = useState<string | null>(
    norm(companyNameProp) ? norm(companyNameProp) : null,
  );
  const [accountLoading, setAccountLoading] = useState(false);

  // ✅ AlertModal 상태
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('안내');
  const [alertLines, setAlertLines] = useState<string[]>([]);
  const [alertConfirmText, setAlertConfirmText] = useState('확인');
  const [alertShowClose, setAlertShowClose] = useState(false);
  const alertOnConfirmRef = useRef<null | (() => void)>(null);
  const alertOnCloseRef = useRef<null | (() => void)>(null);

  const openAlert = (opts: {
    title?: string;
    lines: string[];
    confirmText?: string;
    showClose?: boolean;
    onConfirm?: () => void;
    onClose?: () => void;
  }) => {
    setAlertTitle(opts.title ?? '안내');
    setAlertLines(opts.lines);
    setAlertConfirmText(opts.confirmText ?? '확인');
    setAlertShowClose(!!opts.showClose);
    alertOnConfirmRef.current = opts.onConfirm ?? null;
    alertOnCloseRef.current = opts.onClose ?? null;
    setAlertOpen(true);
  };

  const closeAlert = () => {
    setAlertOpen(false);
    alertOnConfirmRef.current = null;
    alertOnCloseRef.current = null;
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
      const res = await fetchWithTimeout(
        '/api/accounts/find-by-email',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
          signal,
        },
        12_000,
      );
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

  // ✅ 스크롤 잠금(모달 또는 Alert가 떠 있으면 잠금)
  useEffect(() => {
    if (!open && !submitting && !alertOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, submitting, alertOpen]);

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
    return filename;
  };

  /** ✅ 닫기는 submitting이어도 막지 않음(모바일 스톨 시 탈출 경로) */
  const requestClose = () => {
    onClose();
    // 다음 오픈 때 버튼/입력이 막히지 않게 즉시 풀어줌
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (submitting) return;

    // ✅ 로그인 체크
    if (!user?.email) {
      openAlert({
        title: '로그인이 필요합니다',
        lines: ['TBM 활동일지를 생성하려면 로그인이 필요합니다.', '로그인 후 다시 시도해주세요.'],
        confirmText: '로그인하기',
        showClose: true,
        onConfirm: () => {
          closeAlert();
          onRequireLogin?.();
        },
        onClose: () => closeAlert(),
      });
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

    // ✅ 즉시 안내(Alert)
    openAlert({
      title: 'TBM 일지 생성',
      lines: [
        '근로자들에게 서명 요청을 발송했습니다.',
        '문서 제작이 완료되면 이메일로 안내됩니다.',
        '작성된 서류는 문서함에서 확인하실 수 있습니다.',
        // ✅ 모바일에서는 자동 다운로드를 생략하므로 혼선 방지
        ...(isCoarsePointer ? ['(모바일에서는 자동 다운로드가 제한될 수 있어 문서함/이메일로 확인해주세요.)'] : []),
      ],
      confirmText: '확인',
      onConfirm: () => closeAlert(),
    });

    setSubmitting(true);
    await nextFrame();

    try {
      // ✅ 부모 훅(있으면 유지)
      await Promise.resolve(onSubmit?.(payloadForParent));

      let company =
        accountCompanyName ??
        (norm((user as any)?.secondary_info?.company) ? norm((user as any)?.secondary_info?.company) : null) ??
        (norm(companyNameProp) ? norm(companyNameProp) : null);

      if (!company) {
        const fetched = await fetchCompanyByEmail(user.email);
        if (fetched) {
          company = fetched;
          setAccountCompanyName(fetched);
        }
      }

      const body = {
        email: user.email,
        companyName: company ?? null,
        dateISO: new Date().toISOString().slice(0, 10),
        minorCategory: minorForApi,
        detailTasks: cleanedTasks,
        attendees: cleanedAttendees,
      };

      // ✅ 모바일 스톨 방지: export 요청에 타임아웃 부여
      const exportTimeout = isCoarsePointer ? 25_000 : 90_000;

      const res = await fetchWithTimeout(
        '/api/risk-assessment?endpoint=tbm-export-excel',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': user.email,
          },
          body: JSON.stringify(body),
        },
        exportTimeout,
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        openAlert({
          title: '생성 실패',
          lines: [
            `TBM 엑셀 생성에 실패했습니다. (HTTP ${res.status})`,
            txt ? txt.slice(0, 160) : '잠시 후 다시 시도해주세요.',
          ],
          confirmText: '확인',
          onConfirm: () => closeAlert(),
        });
        return;
      }

      // ✅ 핵심 수정:
      // - 모바일/태블릿(터치)에서는 blob 다운로드를 기다리지 않음(여기서 스톨 → submitting 고정이 자주 발생)
      if (!isCoarsePointer) {
        await downloadBlob(res);
      } else {
        try {
          res.body?.cancel?.(); // body 소비를 끊어서 빠르게 종료
        } catch {}
      }

      // ✅ 성공 시 모달 닫기
      requestClose();
    } catch (e: any) {
      // const msg =
      //   e?.name === 'AbortError'
      //     ? '요청 시간이 초과되었습니다. 문서함/이메일을 확인하거나 다시 시도해주세요.'
      //     : 'TBM 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

      // openAlert({
      //   title: '오류',
      //   lines: [msg],
      //   confirmText: '확인',
      //   onConfirm: () => closeAlert(),
      // });
    } finally {
      setSubmitting(false);
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
            requestClose();
          }}
        >
          <div className={s.modal}>
            <div className={s.topBar}>
              <span className={s.pill}>TBM 활동일지</span>
              <button
                type="button"
                className={s.iconBtn}
                onClick={requestClose}
                aria-label="닫기"
                disabled={false}
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
                <button
                  type="button"
                  className={s.addBtn}
                  onClick={addAttendee}
                  disabled={submitting}
                >
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
                {submitting ? '요청 중…' : 'TBM 활동일지 생성하기'}
              </button>

              {accountLoading && (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                  회사명 정보를 불러오는 중…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <CenteredAlertModal
        open={alertOpen}
        title={alertTitle}
        lines={alertLines}
        confirmText={alertConfirmText}
        onConfirm={() => {
          const fn = alertOnConfirmRef.current;
          closeAlert();
          fn?.();
        }}
        showClose={alertShowClose}
        onClose={() => {
          const fn = alertOnCloseRef.current;
          closeAlert();
          fn?.();
        }}
      />
    </>
  );
}

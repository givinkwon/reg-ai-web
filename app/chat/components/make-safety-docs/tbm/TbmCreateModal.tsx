'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, FileText } from 'lucide-react';
import s from './TbmCreateModal.module.css';

import TbmDetailTaskTagInput from './TbmDetailTaskTagInput';
import { useUserStore } from '@/app/store/user';

export type TbmAttendee = {
  name: string;
  contact?: string;
};

// ✅ (호환) workTags도 남겨두되, 실사용은 detailTasks로 명확히
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

  // ✅ 추가: 로그인/회사명
  userEmail: string | null;
  companyName?: string | null;
  onRequireLogin: () => void; // 로그인 모달 열기
};

const norm = (v?: string | null) => (v ?? '').trim();

/** =========================
 * ✅ localStorage cache (form)
 * - (기존 유지) guest 스코프
 * ========================= */
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
      parsed.detailTasks.some((t) => norm(t)) ||
      parsed.attendees.some((a) => norm(a?.name));
    if (!hasAny) return null;

    return parsed;
  } catch {
    return null;
  }
}

function safeWriteFormCache(key: string, payload: TbmFormCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export default function TbmCreateModal({
  open,
  onClose,
  onSubmit,
  minorCategory: minorFromProps,
  defaultValue,

  userEmail,
  companyName,
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

  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
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

  useEffect(() => {
    if (!open) return;
    dirtyRef.current = false;

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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  if (!open) return null;

  const updateAttendee = (idx: number, patch: Partial<TbmAttendee>) => {
    markDirty();
    setAttendees((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const addAttendee = () => {
    markDirty();
    setAttendees((prev) => [...prev, { name: '', contact: '' }]);
  };

  const removeAttendee = (idx: number) => {
    markDirty();
    setAttendees((prev) => prev.filter((_, i) => i !== idx));
  };

  const onChangeTasks = (next: string[]) => {
    markDirty();
    setDetailTasks(next);
  };

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

  const handleSubmit = async () => {
    // ✅ 0) 로그인 필수: 생성 버튼 누를 때 막고 로그인 유도
    if (!user?.email) {
      alert('TBM 활동일지를 생성하려면 로그인이 필요합니다.');
      onRequireLogin();
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

    try {
      setSubmitting(true);
      onSubmit?.(payloadForParent);

      // ✅ 서버 요구사항: payload.email 을 사용 중이므로 반드시 포함
      const body = {
        dateISO: new Date().toISOString().slice(0, 10),
        email: user.email,                 // ✅ 핵심
        companyName: companyName ?? null, // ✅ 선택
        minorCategory: minorForApi,
        detailTasks: cleanedTasks,
        attendees: cleanedAttendees,
        // newsSummary: ... (있으면 추가)
      };

      const res = await fetch('/api/risk-assessment?endpoint=tbm-export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': user.email, // ✅ 문서 저장/문서함 식별용(프록시/백엔드에서 받게)
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        alert(`TBM 엑셀 생성 실패 (${res.status}) ${txt.slice(0, 200)}`);
        return;
      }

      await downloadBlob(res);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="TBM 활동일지"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.modal}>
        <div className={s.topBar}>
          <span className={s.pill}>TBM 활동일지</span>
          <button type="button" className={s.iconBtn} onClick={onClose} aria-label="닫기">
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
          <TbmDetailTaskTagInput
            value={detailTasks}
            onChange={onChangeTasks}
            minorCategory={minorForApi}
          />

          <div className={s.sectionRow}>
            <span className={s.sectionTitle}>참석자 명단</span>
            <button type="button" className={s.addBtn} onClick={addAttendee}>
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
                />
                <input
                  className={s.inputSm}
                  value={a.contact ?? ''}
                  onChange={(e) => updateAttendee(idx, { contact: e.target.value })}
                  placeholder="010-1234-5678"
                />
                <button
                  type="button"
                  className={s.removeBtn}
                  onClick={() => removeAttendee(idx)}
                  aria-label="삭제"
                  disabled={attendees.length <= 1}
                  title={attendees.length <= 1 ? '최소 1명은 필요합니다' : '삭제'}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className={s.primaryBtn}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <FileText size={18} />
            {submitting ? '생성 중…' : 'TBM 활동일지 생성하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

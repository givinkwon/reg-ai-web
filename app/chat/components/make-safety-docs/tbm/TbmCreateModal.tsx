'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, FileText } from 'lucide-react';
import s from './TbmCreateModal.module.css';

import TbmDetailTaskTagInput from './TbmDetailTaskTagInput';

export type TbmAttendee = {
  name: string;
  contact?: string;
};

// ✅ (호환) workTags도 남겨두되, 실사용은 detailTasks로 명확히
export type TbmCreatePayload = {
  detailTasks: string[];      // ✅ 세부작업(process_name) 태그
  attendees: TbmAttendee[];

  // (호환) 기존 로직이 workTags를 기대하면 같이 제공
  workTags?: string[];

  jobTitle?: string;
  minorCategory?: string;     // 'ALL'은 스코프용으로만 사용 가능
};

type Props = {
  open: boolean;
  onClose: () => void;

  // 필요하면 로깅/상태 저장용으로 쓰고, 없어도 됨
  onSubmit?: (payload: TbmCreatePayload) => void;

  // 상위에서 소분류(업종) 넘겨줄 수 있으면 넘기기(권장)
  minorCategory?: string | null;

  defaultValue?: Partial<TbmCreatePayload>;
};

const norm = (v?: string | null) => (v ?? '').trim();

/** =========================
 * ✅ localStorage cache (form)
 * - user가 없으니 guest 스코프만 사용
 * - minor 스코프는 유지(같은 guest라도 업종별로 폼 분리)
 * ========================= */
const FORM_CACHE_PREFIX = 'regai:tbm:createForm:v2'; // ✅ v2로 bump
const FORM_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180일

type TbmFormCache = {
  v: 2;
  ts: number;
  user: 'guest';
  minorScope: string;         // 'ALL' 포함 (스코프키)
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
}: Props) {
  const [minorCategory, setMinorCategory] = useState<string | null>(minorFromProps ?? null);

  // ✅ 세부작업 태그 (process_name)
  const [detailTasks, setDetailTasks] = useState<string[]>(
    (defaultValue?.detailTasks ?? defaultValue?.workTags ?? []).map(norm).filter(Boolean),
  );

  const [attendees, setAttendees] = useState<TbmAttendee[]>(
    defaultValue?.attendees?.length ? (defaultValue.attendees as TbmAttendee[]) : [{ name: '', contact: '' }],
  );

  const [submitting, setSubmitting] = useState(false);

  // ✅ 사용자가 입력을 시작하면 캐시가 뒤늦게 와도 덮어쓰지 않기
  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  // ✅ minor 스코프키(캐시용): 'ALL' 허용
  const scopeMinor = useMemo(() => norm(minorCategory) || 'ALL', [minorCategory]);
  const scopeKey = useMemo(() => formCacheKey(scopeMinor), [scopeMinor]);

  // ✅ 실제 API로 넘길 minor: 'ALL'이면 null 처리 (중요)
  const minorForApi = useMemo(() => {
    const m = norm(minorCategory);
    if (!m) return null;
    if (m.toUpperCase() === 'ALL') return null;
    return m;
  }, [minorCategory]);

  // open 시 default/캐시 복원
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

    // ✅ 1) defaultValue가 있으면 default 우선
    if (hasDefaultTasks || hasDefaultAtt) {
      setDetailTasks(dvTasks);
      setAttendees(dvAtt.length ? dvAtt : [{ name: '', contact: '' }]);
      return;
    }

    // ✅ 2) 캐시 복원 (scopeMinor 기준)
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

  // minorFromProps가 바뀌면 반영
  useEffect(() => {
    if (!open) return;
    const mp = norm(minorFromProps);
    if (mp) setMinorCategory(mp);
  }, [open, minorFromProps]);

  // 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ✅ 입력값 변경 시 캐시에 저장 (open일 때만)
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
    const cleanedTasks = Array.from(new Set(detailTasks.map(norm).filter(Boolean)));

    const cleanedAttendees = attendees
      .map((a) => ({ name: norm(a.name), contact: norm(a.contact ?? '') }))
      .filter((a) => a.name.length > 0);

    // ✅ 호환 payload (원하면 부모에서 저장/로그 등에 사용)
    const payload: TbmCreatePayload = {
      detailTasks: cleanedTasks,
      workTags: cleanedTasks, // ✅ 호환
      attendees: cleanedAttendees,
      jobTitle: cleanedTasks.join(', '),
      minorCategory: norm(minorCategory) || 'ALL',
    };

    try {
      setSubmitting(true);

      // (선택) 부모 콜백
      onSubmit?.(payload);

      // ✅ 서버로는 'ALL'을 보내지 말고, minorForApi만 보내는 걸 권장
      const body = {
        dateISO: new Date().toISOString().slice(0, 10),
        minorCategory: minorForApi,          // ✅ ALL이면 null
        detailTasks: cleanedTasks,           // ✅ workTags 대신 명확히
        attendees: cleanedAttendees,
      };

      // ✅ 여기 endpoint는 서버에서 맞춰주면 됨
      const res = await fetch('/api/risk-assessment?endpoint=tbm-export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            // ✅ ALL이면 null로 내려가므로 /detail-tasks에 minor=ALL 안 붙음
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

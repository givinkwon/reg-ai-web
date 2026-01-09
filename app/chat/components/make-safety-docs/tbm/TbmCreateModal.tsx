'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, FileText } from 'lucide-react';
import s from './TbmCreateModal.module.css';

import { useUserStore } from '@/app/store/user';
import TbmDetailTaskTagInput from './TbmDetailTaskTagInput';

export type TbmAttendee = {
  name: string;
  contact?: string;
};

export type TbmCreatePayload = {
  workTags: string[];
  attendees: TbmAttendee[];

  jobTitle?: string;
  minorCategory?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: TbmCreatePayload) => void;

  minorCategory?: string | null;
  defaultValue?: Partial<TbmCreatePayload>;
};

const norm = (v?: string | null) => (v ?? '').trim();

/** =========================
 * ✅ localStorage cache (form)
 * ========================= */
const FORM_CACHE_PREFIX = 'regai:tbm:createForm:v1';
const FORM_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180일

type TbmFormCache = {
  v: 1;
  ts: number;
  user: string;     // email or 'guest'
  minor: string;    // 'ALL' 포함 (여기는 “스코프키”일 뿐, API minor랑 다름)
  workTags: string[];
  attendees: TbmAttendee[];
};

function formCacheKey(userEmail: string | null | undefined, minor: string | null | undefined) {
  const u = norm(userEmail) || 'guest';
  const m = norm(minor) || 'ALL';
  return `${FORM_CACHE_PREFIX}:${encodeURIComponent(u)}:${encodeURIComponent(m)}`;
}

function safeReadFormCache(key: string): TbmFormCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TbmFormCache;

    if (parsed?.v !== 1) return null;
    if (!parsed?.ts) return null;
    if (!Array.isArray(parsed?.workTags) || !Array.isArray(parsed?.attendees)) return null;
    if (Date.now() - parsed.ts > FORM_CACHE_TTL_MS) return null;

    // 깨진 캐시 방지: 둘 다 비면 무의미
    const hasAny =
      parsed.workTags.some((t) => norm(t)) ||
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
  const user = useUserStore((st) => st.user);

  const [minorCategory, setMinorCategory] = useState<string | null>(minorFromProps ?? null);

  const [workTags, setWorkTags] = useState<string[]>(defaultValue?.workTags ?? []);
  const [attendees, setAttendees] = useState<TbmAttendee[]>(
    defaultValue?.attendees?.length ? (defaultValue.attendees as TbmAttendee[]) : [{ name: '', contact: '' }],
  );

  // ✅ 사용자가 입력을 시작하면 캐시가 뒤늦게 와도 덮어쓰지 않기
  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  const scopeUser = useMemo(() => norm(user?.email) || 'guest', [user?.email]);
  const scopeMinor = useMemo(() => norm(minorCategory) || 'ALL', [minorCategory]);
  const scopeKey = useMemo(() => formCacheKey(user?.email ?? null, scopeMinor), [user?.email, scopeMinor]);

  // open 시 default 반영(기존 동작 유지)
  useEffect(() => {
    if (!open) return;

    dirtyRef.current = false;

    const hasDefaultTags = (defaultValue?.workTags ?? []).some((t) => norm(t));
    const hasDefaultAtt = (defaultValue?.attendees ?? []).some((a: any) => norm(a?.name));

    // ✅ 1) defaultValue가 “실제로” 있으면 default 우선
    if (hasDefaultTags || hasDefaultAtt) {
      setWorkTags((defaultValue?.workTags ?? []).map(norm).filter(Boolean));
      const dvAtt =
        (defaultValue?.attendees as TbmAttendee[] | undefined)?.map((a) => ({
          name: norm(a?.name),
          contact: norm(a?.contact ?? ''),
        })) ?? [];
      setAttendees(dvAtt.length ? dvAtt : [{ name: '', contact: '' }]);
      return;
    }

    // ✅ 2) 아니면 캐시 복원 시도 (minor가 아직 없으면 ALL 스코프 캐시 사용)
    const key = formCacheKey(user?.email ?? null, norm(minorCategory) || 'ALL');
    const cached = safeReadFormCache(key);

    if (cached) {
      setWorkTags((cached.workTags ?? []).map(norm).filter(Boolean));
      const ca =
        (cached.attendees ?? [])
          .map((a) => ({ name: norm(a?.name), contact: norm(a?.contact ?? '') }))
          .filter((a) => a.name) ?? [];
      setAttendees(ca.length ? ca : [{ name: '', contact: '' }]);
    } else {
      // 캐시 없으면 빈값
      setWorkTags([]);
      setAttendees([{ name: '', contact: '' }]);
    }
  }, [open, defaultValue, user?.email]); // minor는 아래 minor 확보 후 별도 복원 기회 줌

  // 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ✅ minor 자동 확보 (StepTasks 방식)
  useEffect(() => {
    if (!open) return;

    const fromProps = norm(minorFromProps);
    if (fromProps) {
      setMinorCategory(fromProps);
      return;
    }

    if (minorCategory) return;
    if (!user?.email) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/accounts/find-by-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        if (!res.ok) return;

        const acc = await res.json().catch(() => null);
        const minorFound =
          acc?.secondary_info?.subcategory?.name ??
          acc?.secondary_info?.subcategory_name ??
          acc?.subcategory?.name ??
          null;

        if (!cancelled && typeof minorFound === 'string' && norm(minorFound)) {
          setMinorCategory(norm(minorFound));
        }
      } catch {
        // silent
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, user?.email, minorFromProps, minorCategory]);

  // ✅ minor가 뒤늦게 확정되면: 해당 minor 스코프 캐시가 있으면 “비어있을 때만” 복원
  useEffect(() => {
    if (!open) return;
    if (!scopeMinor) return;

    if (dirtyRef.current) return; // 사용자가 이미 수정 시작했으면 덮어쓰기 금지

    const key = formCacheKey(user?.email ?? null, scopeMinor);
    const cached = safeReadFormCache(key);
    if (!cached) return;

    const nowHasAny =
      workTags.some((t) => norm(t)) || attendees.some((a) => norm(a?.name));
    if (nowHasAny) return; // 이미 값이 있으면 덮어쓰지 않음

    setWorkTags((cached.workTags ?? []).map(norm).filter(Boolean));
    const ca =
      (cached.attendees ?? [])
        .map((a) => ({ name: norm(a?.name), contact: norm(a?.contact ?? '') }))
        .filter((a) => a.name) ?? [];
    setAttendees(ca.length ? ca : [{ name: '', contact: '' }]);
  }, [open, scopeMinor, user?.email, workTags, attendees]);

  // ✅ 입력값 변경 시 캐시에 저장 (open일 때만)
  useEffect(() => {
    if (!open) return;

    const tagsToSave = Array.from(new Set(workTags.map(norm).filter(Boolean)));
    const attToSave =
      attendees
        .map((a) => ({ name: norm(a?.name), contact: norm(a?.contact ?? '') }))
        .filter((a) => a.name) ?? [];

    // 둘 다 완전 비어있으면 저장 안 함
    if (tagsToSave.length === 0 && attToSave.length === 0) return;

    safeWriteFormCache(scopeKey, {
      v: 1,
      ts: Date.now(),
      user: scopeUser,
      minor: scopeMinor,
      workTags: tagsToSave,
      attendees: attToSave,
    });
  }, [open, workTags, attendees, scopeKey, scopeUser, scopeMinor]);

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

  const onChangeTags = (next: string[]) => {
    markDirty();
    setWorkTags(next);
  };

  const canSubmit =
    workTags.map(norm).filter(Boolean).length > 0 &&
    attendees.some((a) => norm(a.name).length > 0);

  const handleSubmit = () => {
    const cleanedTags = Array.from(new Set(workTags.map(norm).filter(Boolean)));

    const cleanedAttendees = attendees
      .map((a) => ({ name: norm(a.name), contact: norm(a.contact ?? '') }))
      .filter((a) => a.name.length > 0);

    onSubmit({
      workTags: cleanedTags,
      attendees: cleanedAttendees,
      jobTitle: cleanedTags.join(', '),
      minorCategory: norm(minorCategory) || 'ALL', // (생성용 전달값) 그대로 유지
    });
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
            value={workTags}
            onChange={onChangeTags}
            minorCategory={minorCategory}
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

          <button type="button" className={s.primaryBtn} disabled={!canSubmit} onClick={handleSubmit}>
            <FileText size={18} />
            TBM 활동일지 생성하기
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './AddDetailTaskModal.module.css';

type Props = {
  open: boolean;
  minorCategory: string | null;
  onClose: () => void;
  onAdd: (title: string) => void; // 그대로 유지 (확인 시 여러 번 호출)
};

const norm = (v?: string | null) => (v ?? '').trim();

export default function AddDetailTaskModal({ open, minorCategory, onClose, onAdd }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ✅ 선택된 항목들(멀티)
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected.map(norm)), [selected]);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const canSearch = useMemo(() => norm(q).length >= 1, [q]);

  // open될 때 초기화
  useEffect(() => {
    if (!open) return;
    setQ('');
    setItems([]);
    setError(null);
    setSelected([]);
  }, [open]);

  // 닫힐 때 진행 중 요청 abort (선택)
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
  }, [open]);

  // 검색
  useEffect(() => {
    if (!open) return;

    if (!canSearch) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);

        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const qs = new URLSearchParams();
        qs.set('endpoint', 'detail-tasks');
        qs.set('q', norm(q));
        qs.set('limit', '50');
        if (minorCategory) qs.set('minor', minorCategory);

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          method: 'GET',
          signal: ac.signal,
          cache: 'no-store',
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`검색 실패 (${res.status}) ${txt.slice(0, 120)}`);
        }

        const data = (await res.json()) as { items: string[] };
        const next = Array.from(new Set((data.items ?? []).map(norm).filter(Boolean)));
        setItems(next);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setItems([]);
        setError(e?.message ?? '검색 중 오류');
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, open, canSearch, minorCategory]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Enter로 확인 (원하면 활성화)
      if (e.key === 'Enter') {
        // 입력 포커스가 input일 때도 Enter로 확정하고 싶으면 아래 유지
        // 단, 아무것도 선택 안 했으면 무시
        if (selected.length > 0) handleConfirm();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, selected]);

  const toggleSelect = (title: string) => {
    const v = norm(title);
    if (!v) return;

    setSelected((prev) => {
      const set = new Set(prev.map(norm));
      if (set.has(v)) {
        return prev.filter((x) => norm(x) !== v);
      }
      return [...prev, v];
    });
  };

  const removeSelected = (title: string) => {
    const v = norm(title);
    setSelected((prev) => prev.filter((x) => norm(x) !== v));
  };

  const handleConfirm = () => {
    const uniq = Array.from(new Set(selected.map(norm).filter(Boolean)));
    if (uniq.length === 0) return;

    // ✅ 일괄 추가
    uniq.forEach((t) => onAdd(t));
    onClose();
  };

  if (!open) return null;

  return (
    <div className={s.overlay} onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={s.head}>
          <div>
            <div className={s.title}>세부작업 선택</div>
            <div className={s.subTitle}>키워드로 검색한 뒤 여러 개 선택하고 “확인”을 누르세요</div>
          </div>
          <button className={s.close} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className={s.searchRow}>
          <input
            className={s.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="예: 절단, 포장, 사출, 금형…"
            autoFocus
          />
        </div>

        {/* ✅ 선택된 항목 칩(있으면 보여주기) */}
        {selected.length > 0 && (
          <div className={s.selectedBar} aria-label="선택된 항목">
            {selected.map((t) => (
              <button
                key={t}
                type="button"
                className={s.selectedChip}
                onClick={() => removeSelected(t)}
                title="클릭하면 선택 해제"
              >
                <span className={s.selectedText}>{t}</span>
                <span className={s.selectedX} aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
        )}

        <div className={s.listBox}>
          {loading && <div className={s.hint}>검색 중…</div>}
          {!loading && error && <div className={s.error}>{error}</div>}

          {!loading && !error && !canSearch && <div className={s.hint}>1글자 이상 입력하면 검색됩니다.</div>}
          {!loading && !error && canSearch && items.length === 0 && <div className={s.hint}>검색 결과가 없습니다.</div>}

          {!loading && !error && items.length > 0 && (
            <div className={s.list}>
              {items.map((t) => {
                const v = norm(t);
                const isSelected = selectedSet.has(v);

                return (
                  <button
                    key={v}
                    type="button"
                    className={`${s.item} ${isSelected ? s.itemSelected : ''}`}
                    onClick={() => toggleSelect(v)}
                    aria-pressed={isSelected}
                  >
                    <span className={s.itemText}>{v}</span>
                    <span className={s.pick}>{isSelected ? '선택됨' : '선택'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={s.footer}>
          <button className={s.cancel} onClick={onClose}>
            취소
          </button>
          <button className={s.confirm} onClick={handleConfirm} disabled={selected.length === 0}>
            확인{selected.length > 0 ? ` (${selected.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import s from './StepTasks.module.css';
import AddDetailTaskModal from '../ui/AddDetailTaskModal';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';
import Button from '@/app/components/ui/button';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'RiskAssessmentTasks' } as const;

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
  minor?: string;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();

// =========================
// ✅ localStorage cache (v2) - 기존 로직 유지
// =========================
const CACHE_PREFIX = 'regai:risk:stepTasks:v2';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180일
const RETRY_COOLDOWN_MS = 1000 * 20; // 20초

type StepTasksCache = {
  v: 2;
  ts: number;
  user: string;
  minor: string;
  recommended: string[];
  tasks: RiskAssessmentDraft['tasks'];
};

function cacheKey(userEmail: string | null | undefined, minorCategory: string | null | undefined) {
  const u = norm(userEmail) || 'guest';
  const m = norm(minorCategory) || 'ALL';
  return `${CACHE_PREFIX}:${encodeURIComponent(u)}:${encodeURIComponent(m)}`;
}

function safeReadCache(key: string): StepTasksCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StepTasksCache;
    if (parsed?.v !== 2) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteCache(key: string, payload: StepTasksCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch { /* ignore */ }
}

function findLatestCacheForUser(userEmail: string | null | undefined): { key: string; cache: StepTasksCache } | null {
  try {
    const u = norm(userEmail) || 'guest';
    const prefix = `${CACHE_PREFIX}:${encodeURIComponent(u)}:`;
    let best: { key: string; cache: StepTasksCache } | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const c = safeReadCache(k);
      if (!c) continue;
      if (!best || c.ts > best.cache.ts) best = { key: k, cache: c };
    }
    return best;
  } catch { return null; }
}

export default function StepTasks({ draft, setDraft, minor }: Props) {
  const user = useUserStore((st) => st.user);

  const overrideMinor = norm(minor);
  const [minorCategory, setMinorCategory] = useState<string | null>(overrideMinor ? overrideMinor : null);

  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  // 로직 Refs
  const autoAppliedRef = useRef<string | null>(null);
  const cacheCheckedRef = useRef<string | null>(null);
  const prevMinorRef = useRef<string | null>(null);
  const prevScopeRef = useRef<string | null>(null);
  const attemptRef = useRef<Map<string, number>>(new Map());

  const userEmail = (user?.email ?? '').trim();
  const currentMinorNorm = norm(minorCategory) || 'ALL';
  const scope = `${norm(userEmail) || 'guest'}|${currentMinorNorm}`;

  // ✅ 1. 소분류 폴백 (유저 계정 조회)
  useEffect(() => {
    if (overrideMinor) return;
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
        const minorFound = acc?.secondary_info?.subcategory?.name ?? acc?.subcategory?.name ?? null;

        if (!cancelled && typeof minorFound === 'string' && norm(minorFound)) {
          setMinorCategory(norm(minorFound));
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [user?.email, minorCategory, overrideMinor]);

  // ✅ 2. 캐시 복원
  useEffect(() => {
    const uEmail = user?.email ?? null;
    const userId = norm(uEmail) || 'guest';
    let currentMinor = norm(minorCategory) || 'ALL';

    // 스코프 변경 체크
    const s = `${userId}|${currentMinor}`;
    if (cacheCheckedRef.current === s) return;
    
    // 스코프 변경시 초기화
    if (prevScopeRef.current && prevScopeRef.current !== s) {
      setRecommended([]);
      setRecoError(null);
      setRecoLoading(false);
      autoAppliedRef.current = null;
    }
    prevScopeRef.current = s;
    cacheCheckedRef.current = s;

    let key = cacheKey(uEmail, currentMinor);
    let cached = safeReadCache(key);

    // Guest 캐시 폴백 / 최신 캐시 폴백 로직
    if (!cached && uEmail) cached = safeReadCache(cacheKey(null, currentMinor));
    if (!cached && (!norm(minorCategory) || currentMinor === 'ALL')) {
      const latest = findLatestCacheForUser(uEmail) ?? findLatestCacheForUser(null);
      if (latest?.cache) {
        cached = latest.cache;
        currentMinor = norm(cached.minor) || 'ALL';
        if (!overrideMinor && !norm(minorCategory)) setMinorCategory(currentMinor);
      }
    }

    if (!cached) return;

    // 복원 실행
    const resolvedScope = `${userId}|${currentMinor}`;
    if (Array.isArray(cached.tasks) && cached.tasks.length > 0) {
      setDraft((prev) => {
        if (prev.tasks.length > 0) return prev; // 이미 업종 중이면 덮어쓰기 방지
        return { ...prev, tasks: cached.tasks };
      });
      autoAppliedRef.current = resolvedScope;
    }

    const cachedReco = cached.recommended?.length > 0 ? cached.recommended : cached.tasks.map(t => norm(t.title));
    setRecommended(Array.from(new Set(cachedReco.map(norm).filter(Boolean))));
    setRecoLoading(false);
  }, [minorCategory, user?.email, overrideMinor, setDraft]);

  // ✅ 3. API 호출 (추천 업종 목록)
  useEffect(() => {
    const currentMinor = norm(minorCategory);
    if (!currentMinor || currentMinor === 'ALL') return;

    const s = `${norm(user?.email) || 'guest'}|${currentMinor}`;
    if (safeReadCache(cacheKey(user?.email, currentMinor))) return; // 캐시 있으면 스킵

    // 쿨다운 체크
    const last = attemptRef.current.get(s);
    if (last && Date.now() - last < RETRY_COOLDOWN_MS) return;
    attemptRef.current.set(s, Date.now());

    const ac = new AbortController();
    (async () => {
      setRecoLoading(true);
      setRecoError(null);
      try {
        const qs = new URLSearchParams({ endpoint: 'detail-tasks', minor: currentMinor, limit: '50' });
        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, { cache: 'no-store', signal: ac.signal });
        if (!res.ok) throw new Error('목록 로드 실패');
        
        const data = await res.json();
        const items = (data.items ?? []).map(norm).filter(Boolean);
        setRecommended(Array.from(new Set(items)));
      } catch (e: any) {
        if (e.name !== 'AbortError') setRecoError('목록을 불러오지 못했습니다.');
      } finally {
        setRecoLoading(false);
      }
    })();
    return () => ac.abort();
  }, [minorCategory, user?.email]);

  // ✅ 4. 자동 선택 (Auto Apply)
  useEffect(() => {
    const currentMinor = norm(minorCategory) || 'ALL';
    if (recoLoading || recoError || recommended.length === 0) return;

    const s = `${norm(user?.email) || 'guest'}|${currentMinor}`;
    if (autoAppliedRef.current === s) return;

    setDraft((prev) => {
      const exist = new Set(prev.tasks.map(t => norm(t.title)));
      const merged = [...prev.tasks];
      recommended.forEach(raw => {
        const v = norm(raw);
        if (v && !exist.has(v)) {
          merged.push({ id: uid(), title: v, processes: [] });
          exist.add(v);
        }
      });
      return { ...prev, tasks: merged };
    });
    autoAppliedRef.current = s;
  }, [minorCategory, recommended, recoLoading, recoError, user?.email, setDraft]);

  // ✅ 5. 변경 사항 캐시 저장
  useEffect(() => {
    const currentMinor = norm(minorCategory) || 'ALL';
    const key = cacheKey(user?.email, currentMinor);
    const tasksToSave = draft.tasks ?? [];
    
    // 저장 조건: 데이터가 있거나, 추천 목록이 로드된 상태여야 함
    if (tasksToSave.length === 0 && recommended.length === 0) return;

    safeWriteCache(key, {
      v: 2,
      ts: Date.now(),
      user: norm(user?.email) || 'guest',
      minor: currentMinor,
      recommended: recommended.length > 0 ? recommended : tasksToSave.map(t => t.title),
      tasks: tasksToSave,
    });
  }, [minorCategory, user?.email, draft.tasks, recommended]);

  // 화면 표시용 리스트 (추천 목록이 없으면 선택된 목록이라도 보여줌)
  const displayList = useMemo(() => {
    if (recommended.length > 0) return recommended;
    return Array.from(new Set(draft.tasks.map(t => norm(t.title)).filter(Boolean)));
  }, [recommended, draft.tasks]);

  const toggleSelect = (title: string) => {
    const v = norm(title);
    if (!v) return;

    track(gaEvent(GA_CTX, 'TaskSelect'), { ui_id: gaUiId(GA_CTX, 'TaskSelect'), title: v });

    setDraft((prev) => {
      const exists = prev.tasks.some((t) => norm(t.title) === v);
      if (exists) return { ...prev, tasks: prev.tasks.filter((t) => norm(t.title) !== v) };
      return { ...prev, tasks: [...prev.tasks, { id: uid(), title: v, processes: [] }] };
    });
  };

  const addManualTask = (title: string) => {
    const v = norm(title);
    if (!v) return;
    
    setDraft((prev) => {
      if (prev.tasks.some(t => norm(t.title) === v)) return prev;
      return { ...prev, tasks: [...prev.tasks, { id: uid(), title: v, processes: [] }] };
    });
  };

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h3 className={s.title}>업종 선택</h3>
          <div className={s.desc}>
            {norm(minorCategory) ? (
              <>소분류 <b className="text-purple-600 font-semibold">{minorCategory}</b> 기준으로 업종을 자동 추천해 드렸습니다.</>
            ) : (
              '진행할 업종을 선택하세요. 관련된 공정 데이터를 자동으로 불러옵니다.'
            )}
          </div>
        </div>
        <Button 
          variant="outline" 
          className={s.addBtn}
          onClick={() => setAddOpen(true)}
        >
          <Search size={16} className="mr-2" /> 직접 검색/추가
        </Button>
      </div>

      {/* 로딩 상태 */}
      {recoLoading && (
        <div className={s.loadingState}>
          <RefreshCw className="animate-spin text-purple-500" />
          <span>추천 업종을 불러오는 중...</span>
        </div>
      )}

      {/* 에러 상태 */}
      {!recoLoading && recoError && (
        <div className={s.errorState}>{recoError}</div>
      )}

      {/* 추천 목록 그리드 */}
      {!recoLoading && !recoError && displayList.length > 0 && (
        <div className={s.grid}>
          {displayList.map((item) => {
            const title = norm(item);
            const isSelected = draft.tasks.some(t => norm(t.title) === title);
            return (
              <button
                key={title}
                className={`${s.card} ${isSelected ? s.active : ''}`}
                onClick={() => toggleSelect(title)}
              >
                <div className={s.checkCircle}>
                  {isSelected && <div className={s.checkDot} />}
                </div>
                <span className={s.cardText}>{title}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 빈 상태 */}
      {!recoLoading && !recoError && displayList.length === 0 && (
        <div className={s.loadingState}>
          <span>추천 업종이 없습니다. 직접 추가해주세요.</span>
        </div>
      )}

      {/* 하단 선택 요약 (칩) */}
      <div className={s.summary}>
        <span className={s.summaryLabel}>선택된 업종 ({draft.tasks.length})</span>
        <div className={s.chipList}>
          {draft.tasks.length === 0 ? (
            <span className={s.emptyText}>선택된 업종이 없습니다.</span>
          ) : (
            draft.tasks.map(t => (
              <span key={t.id} className={s.chip}>
                {t.title}
                <button 
                  className={s.chipRemove} 
                  onClick={(e) => { e.stopPropagation(); toggleSelect(t.title); }}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <AddDetailTaskModal 
        open={addOpen} 
        minorCategory={minorCategory}
        onClose={() => setAddOpen(false)}
        onAdd={addManualTask}
      />
    </div>
  );
}
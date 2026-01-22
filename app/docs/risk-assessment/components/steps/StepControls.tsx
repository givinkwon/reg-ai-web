'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepControls.module.css';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'RiskAssessmentControls' } as const;

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

type Judgement = '상' | '중' | '하';
const JUDGEMENTS: Judgement[] = ['상', '중', '하'];

const norm = (v?: string | null) => (v ?? '').trim();

// =========================
// ✅ Cache Logic
// =========================
const CACHE_PREFIX = 'regai:risk:stepControls:v4';
const TTL_MS = 1000 * 60 * 60 * 24 * 180;
const RETRY_COOLDOWN_MS = 1000 * 20;

type ControlCache = {
  v: 4;
  ts: number;
  fetched: boolean;
  user: string;
  process_name: string;
  sub_process: string;
  risk_situation_result: string;
  judgement: Judgement;
  current_controls_items: string[];
  current_control_text: string;
  mitigation_items: string[];
  mitigation_text: string;
};

function cacheKey(userEmail: string | null | undefined, processName: string, subProcess: string, riskSituation: string) {
  const u = norm(userEmail) || 'guest';
  return `${CACHE_PREFIX}:${encodeURIComponent(u)}:${encodeURIComponent(norm(processName))}:${encodeURIComponent(norm(subProcess))}:${encodeURIComponent(norm(riskSituation))}`;
}

function readCache(key: string): ControlCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ControlCache;
    if (!parsed?.ts || parsed.v !== 4) return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: ControlCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch { /* ignore */ }
}

// ✅ 중복 제거 및 정규화
function dedup(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return Array.from(new Set(arr.map((x) => norm(String(x ?? ''))).filter(Boolean)));
}

// ✅ API 응답 파싱 (다양한 키 대응)
function extractStringList(payload: any, preferredKeys: string[] = []): string[] {
  let v: any = payload;
  if (v && typeof v === 'object' && 'value' in v && !Array.isArray(v)) v = v.value; // Unpack proxy

  if (Array.isArray(v)) return dedup(v);

  if (v && typeof v === 'object') {
    for (const k of [...preferredKeys, 'items', 'rows', 'data', 'list']) {
      if (Array.isArray(v[k])) return dedup(v[k]);
    }
  }
  return [];
}

export default function StepControls({ draft, setDraft }: Props) {
  const user = useUserStore((st) => st.user);
  const userKey = norm(user?.email) || 'guest';

  // 로딩 상태 (rowKey -> boolean)
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  // 중복 실행 방지 Refs
  const completedRef = useRef<Set<string>>(new Set());
  const attemptRef = useRef<Map<string, number>>(new Map());
  const fetchSet = useRef<Set<string>>(new Set());

  // ✅ GA View
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      tasks_len: draft.tasks.length,
    });
  }, []);

  // 1. Flatten Rows (UI 렌더링 및 로직 처리용)
  const rows = useMemo(() => {
    const out: Array<any> = [];
    draft.tasks.forEach((t) => {
      t.processes.forEach((p) => {
        p.hazards.forEach((h: any) => {
          out.push({
            rowKey: `${t.id}:${p.id}:${h.id}`,
            taskId: t.id,
            processId: p.id,
            hazardId: h.id,
            process_name: norm(t.title),
            sub_process: norm(p.title),
            risk_situation_result: norm(h.title),
            judgement: (h.judgement as Judgement) ?? '중',
            current_controls_items: h.current_controls_items ?? [],
            current_control_text: h.current_control_text ?? '',
            mitigation_items: h.mitigation_items ?? [],
            mitigation_text: h.mitigation_text ?? '',
          });
        });
      });
    });
    return out;
  }, [draft.tasks]);

  // 2. 변경 감지 시그니처 (식별 정보만)
  const targetsSig = useMemo(() => {
    return rows.map((r) => `${r.rowKey}|${r.process_name}|${r.sub_process}|${r.risk_situation_result}`).join('||');
  }, [rows]);

  const updateHazard = (taskId: string, processId: string, hazardId: string, patch: any) => {
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          processes: t.processes.map((p) => {
            if (p.id !== processId) return p;
            return {
              ...p,
              hazards: p.hazards.map((h: any) => (h.id === hazardId ? { ...h, ...patch } : h)),
            };
          }),
        };
      }),
    }));
  };

  // =======================================================
  // ✅ [핵심 로직] 자동 채움 (Batch Fetching)
  // =======================================================
  useEffect(() => {
    let isMounted = true;

    const runAutoFill = async () => {
      const targetsToFetch: any[] = [];
      const cacheUpdates: Record<string, any> = {};

      for (const r of rows) {
        if (!r.process_name || !r.sub_process || !r.risk_situation_result) continue;

        const ck = cacheKey(user?.email, r.process_name, r.sub_process, r.risk_situation_result);
        const scopeKey = `${r.rowKey}|${ck}`;

        // 이미 데이터가 채워져 있으면 완료 처리
        const hasData = r.current_controls_items.length > 0 || r.mitigation_items.length > 0;
        if (hasData) {
          completedRef.current.add(scopeKey);
          continue;
        }

        if (completedRef.current.has(scopeKey)) continue;
        if (fetchSet.current.has(scopeKey)) continue;

        const last = attemptRef.current.get(scopeKey);
        if (last && Date.now() - last < RETRY_COOLDOWN_MS) continue;

        // 1-1. 캐시 확인
        let cached = readCache(ck);
        
        if (cached) {
          cacheUpdates[r.rowKey] = cached;
          completedRef.current.add(scopeKey);
        } else {
          // 1-2. Fetch 대상 추가
          targetsToFetch.push({ ...r, ck, scopeKey });
        }
      }

      // 2. 캐시 데이터 일괄 적용
      if (Object.keys(cacheUpdates).length > 0) {
        setDraft((prev) => ({
          ...prev,
          tasks: prev.tasks.map((t) => ({
            ...t,
            processes: t.processes.map((p) => ({
              ...p,
              hazards: p.hazards.map((h: any) => {
                const key = `${t.id}:${p.id}:${h.id}`;
                const c = cacheUpdates[key];
                if (!c) return h;
                
                return {
                  ...h,
                  judgement: c.judgement || h.judgement || '중',
                  current_controls_items: dedup([...(h.current_controls_items||[]), ...c.current_controls_items]),
                  current_control_text: h.current_control_text || c.current_control_text || c.current_controls_items[0] || '',
                  mitigation_items: dedup([...(h.mitigation_items||[]), ...c.mitigation_items]),
                  mitigation_text: h.mitigation_text || c.mitigation_text || c.mitigation_items[0] || '',
                };
              }),
            })),
          })),
        }));
      }

      if (targetsToFetch.length === 0) return;

      // 3. 로딩 켜기
      const loadingUpdate: Record<string, boolean> = {};
      targetsToFetch.forEach(({ rowKey, scopeKey }) => {
        loadingUpdate[rowKey] = true;
        fetchSet.current.add(scopeKey);
        attemptRef.current.set(scopeKey, Date.now());
      });
      if (isMounted) setLoadingMap((prev) => ({ ...prev, ...loadingUpdate }));

      // 4. 병렬 API 호출
      const fetchedResults: Record<string, any> = {};

      await Promise.all(
        targetsToFetch.map(async (target) => {
          if (!isMounted) return;
          try {
            const makeUrl = (ep: string) => {
              const qs = new URLSearchParams({
                endpoint: ep,
                process_name: target.process_name,
                sub_process: target.sub_process,
                risk_situation_result: target.risk_situation_result,
                limit: '50'
              });
              return `/api/risk-assessment?${qs.toString()}`;
            };

            const [res1, res2] = await Promise.all([
              fetch(makeUrl('control-options'), { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
              fetch(makeUrl('mitigation-options'), { cache: 'no-store' }).then(r => r.json()).catch(() => ({}))
            ]);

            const controls = extractStringList(res1, ['current_controls_items', 'controls']);
            const mitigations = extractStringList(res2, ['mitigation_items', 'mitigations']);

            if (controls.length > 0 || mitigations.length > 0) {
              const result = {
                current_controls_items: controls,
                current_control_text: controls[0] || '',
                mitigation_items: mitigations,
                mitigation_text: mitigations[0] || '',
                judgement: '중' as Judgement, // 기본값
              };

              fetchedResults[target.rowKey] = result;
              completedRef.current.add(target.scopeKey);

              // 캐시 저장
              writeCache(target.ck, {
                v: 4,
                ts: Date.now(),
                fetched: true,
                user: userKey,
                process_name: target.process_name,
                sub_process: target.sub_process,
                risk_situation_result: target.risk_situation_result,
                ...result,
              });
            }
          } catch (e) {
            console.error(e);
          } finally {
            fetchSet.current.delete(target.scopeKey);
          }
        })
      );

      // 5. 결과 일괄 반영
      if (isMounted && Object.keys(fetchedResults).length > 0) {
        setDraft((prev) => ({
          ...prev,
          tasks: prev.tasks.map((t) => ({
            ...t,
            processes: t.processes.map((p) => ({
              ...p,
              hazards: p.hazards.map((h: any) => {
                const key = `${t.id}:${p.id}:${h.id}`;
                const res = fetchedResults[key];
                if (!res) return h;
                
                return {
                  ...h,
                  current_controls_items: dedup([...(h.current_controls_items||[]), ...res.current_controls_items]),
                  current_control_text: h.current_control_text || res.current_control_text,
                  mitigation_items: dedup([...(h.mitigation_items||[]), ...res.mitigation_items]),
                  mitigation_text: h.mitigation_text || res.mitigation_text,
                  judgement: h.judgement || res.judgement,
                };
              }),
            })),
          })),
        }));
      }

      // 6. 로딩 끄기
      if (isMounted) {
        setTimeout(() => {
          setLoadingMap((prev) => {
            const next = { ...prev };
            targetsToFetch.forEach(({ rowKey }) => delete next[rowKey]);
            return next;
          });
        }, 0);
      }
    };

    runAutoFill();
    return () => { isMounted = false; };
  }, [targetsSig, user?.email]);

  // ✅ 사용자 입력값 캐시 저장 (Debounce)
  useEffect(() => {
    const tmr = setTimeout(() => {
      rows.forEach((r) => {
        if (!r.process_name || !r.sub_process || !r.risk_situation_result) return;
        
        // 데이터가 유의미하게 있을 때만 저장
        if (
          r.current_controls_items.length === 0 && !r.current_control_text &&
          r.mitigation_items.length === 0 && !r.mitigation_text
        ) return;

        const ck = cacheKey(user?.email, r.process_name, r.sub_process, r.risk_situation_result);
        writeCache(ck, {
          v: 4,
          ts: Date.now(),
          fetched: true,
          user: userKey,
          process_name: r.process_name,
          sub_process: r.sub_process,
          risk_situation_result: r.risk_situation_result,
          judgement: r.judgement,
          current_controls_items: r.current_controls_items,
          current_control_text: r.current_control_text,
          mitigation_items: r.mitigation_items,
          mitigation_text: r.mitigation_text,
        });
      });
    }, 500);
    return () => clearTimeout(tmr);
  }, [rows, user?.email]);

  if (rows.length === 0) {
    return (
      <div className={s.wrap}>
        <div className={s.empty}>아직 위험요인이 없습니다. 이전 단계에서 유해·위험요인을 추가해 주세요.</div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>
        위험요인별로 <b>위험성 판단(상/중/하)</b>을 선택하고, <b>현재안전조치</b>와 <b>개선 대책</b>을 입력/선택해 주세요.
      </div>

      {rows.map((r) => {
        const loading = !!loadingMap[r.rowKey];

        return (
          <div key={r.rowKey} className={s.card}>
            <div className={s.head}>
              <div className={s.path}>
                <span className={s.pathStrong}>{r.process_name}</span>
                <span className={s.pathSep}>›</span>
                <span className={s.pathStrong}>{r.sub_process}</span>
              </div>
              {loading && <div className={s.loadingBadge}>데이터 불러오는 중...</div>}
            </div>

            <div className={s.hazardTitle}>
              <span className={s.hazardIcon}>⚠️</span> {r.risk_situation_result}
            </div>

            {/* 1) 위험성 판단 */}
            <div className={s.section}>
              <div className={s.sectionTitle}>위험성 판단</div>
              <div className={s.judgementGroup}>
                {JUDGEMENTS.map((j) => (
                  <button
                    key={j}
                    type="button"
                    className={`${s.judgementBtn} ${r.judgement === j ? s[j === '상' ? 'high' : j === '중' ? 'mid' : 'low'] : ''}`}
                    onClick={() => updateHazard(r.taskId, r.processId, r.hazardId, { judgement: j })}
                  >
                    {j}
                  </button>
                ))}
              </div>
            </div>

            {/* 2) 현재안전조치 */}
            <div className={s.section}>
              <div className={s.sectionTitle}>현재 안전조치</div>
              {r.current_controls_items.length > 0 ? (
                <div className={s.chipRow}>
                  {r.current_controls_items.map((x: string) => (
                    <button
                      key={x}
                      type="button"
                      className={`${s.chip} ${norm(r.current_control_text) === norm(x) ? s.chipActive : ''}`}
                      onClick={() => updateHazard(r.taskId, r.processId, r.hazardId, { current_control_text: x })}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={s.hint}>추천 항목이 없습니다. 직접 입력해주세요.</div>
              )}
              <textarea
                className={s.textarea}
                placeholder="현재 적용 중인 안전조치를 입력하세요"
                value={r.current_control_text}
                onChange={(e) => updateHazard(r.taskId, r.processId, r.hazardId, { current_control_text: e.target.value })}
              />
            </div>

            {/* 3) 개선 대책 */}
            <div className={s.section}>
              <div className={s.sectionTitle}>개선 대책</div>
              {r.mitigation_items.length > 0 ? (
                <div className={s.chipRow}>
                  {r.mitigation_items.map((x: string) => (
                    <button
                      key={x}
                      type="button"
                      className={`${s.chip} ${norm(r.mitigation_text) === norm(x) ? s.chipActive : ''}`}
                      onClick={() => updateHazard(r.taskId, r.processId, r.hazardId, { mitigation_text: x })}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={s.hint}>추천 항목이 없습니다. 직접 입력해주세요.</div>
              )}
              <textarea
                className={s.textarea}
                placeholder="개선 대책을 입력하세요"
                value={r.mitigation_text}
                onChange={(e) => updateHazard(r.taskId, r.processId, r.hazardId, { mitigation_text: e.target.value })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
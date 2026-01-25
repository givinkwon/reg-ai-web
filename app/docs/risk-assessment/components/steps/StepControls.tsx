'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepControls.module.css';
import type { RiskAssessmentDraft, Judgement } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';
import { RefreshCw } from 'lucide-react';
import { useRiskWizardStore } from '@/app/store/docs'; // ✅ Zustand 스토어

// ✅ GA 추적
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'RiskAssessmentControls' } as const;

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

const JUDGEMENTS: Judgement[] = ['상', '중', '하'];
const norm = (v?: string | null) => (v ?? '').trim();

// === 유틸리티 함수 (기존과 동일) ===
const CACHE_PREFIX = 'regai:risk:stepControls:v4';
const TTL_MS = 1000 * 60 * 60 * 24 * 180;
const RETRY_COOLDOWN_MS = 1000 * 20;

function cacheKey(userEmail: string | null | undefined, processName: string, subProcess: string, riskSituation: string) {
  const u = norm(userEmail) || 'guest';
  return `${CACHE_PREFIX}:${encodeURIComponent(u)}:${encodeURIComponent(norm(processName))}:${encodeURIComponent(norm(subProcess))}:${encodeURIComponent(norm(riskSituation))}`;
}

function readCache(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || parsed.v !== 4) return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(key: string, payload: any) {
  try { localStorage.setItem(key, JSON.stringify(payload)); } catch { }
}

function dedup(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return Array.from(new Set(arr.map((x: any) => norm(String(x ?? ''))).filter(Boolean)));
}

function extractStringList(payload: any, preferredKeys: string[] = []): string[] {
  let v = (payload && typeof payload === 'object' && 'value' in payload) ? payload.value : payload;
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

  // ✅ 전역 분석 상태 제어 함수
  const setIsAnalyzing = useRiskWizardStore((state) => state.setIsAnalyzing);

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [isInitialAnalyzing, setIsInitialAnalyzing] = useState(true);

  const completedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      tasks_len: draft.tasks.length,
    });
  }, [draft.tasks.length]);

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
            judgement: (h.judgement as Judgement) ?? '하',
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

  const targetsSig = useMemo(() => rows.map((r) => r.rowKey).join('||'), [rows]);

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

  // ✅ [수정] 자동 채움 및 강제 10초 대기 로직
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const runAutoFill = async () => {
      const targetsToFetch = rows.filter(r => r.current_controls_items.length === 0 && !completedRef.current.has(r.rowKey));

      // 🚀 [STEP 1] 무조건 로딩 시작 (버튼 잠금)
      setIsAnalyzing(true);
      setIsInitialAnalyzing(true);

      // ⏱️ 10초 대기 Promise 생성
      const minWaitTimer = new Promise(resolve => setTimeout(resolve, 15000));

      if (targetsToFetch.length === 0) {
        // 이미 데이터가 다 있다면 15초만 기다렸다가 해제
        await minWaitTimer;
        setIsInitialAnalyzing(false);
        setIsAnalyzing(false);
        return;
      }

      try {
        // 🚀 [STEP 2] API 호출과 15초 타이머를 동시에 실행
        await Promise.all([
          minWaitTimer, // 15초 타이머
          ...targetsToFetch.map(async (target) => {
            if (signal.aborted) return;
            setLoadingMap(prev => ({ ...prev, [target.rowKey]: true }));

            try {
              const makeUrl = (ep: string) => `/api/risk-assessment?${new URLSearchParams({
                endpoint: ep,
                process_name: target.process_name,
                sub_process: target.sub_process,
                risk_situation_result: target.risk_situation_result,
                limit: '50'
              }).toString()}`;

              const [res1, res2] = await Promise.all([
                fetch(makeUrl('control-options'), { signal }).then(r => r.json()).catch(() => ({})),
                fetch(makeUrl('mitigation-options'), { signal }).then(r => r.json()).catch(() => ({}))
              ]);

              const controls = extractStringList(res1, ['current_controls_items']);
              const mitigations = extractStringList(res2, ['mitigation_items']);

              if (!signal.aborted && (controls.length > 0 || mitigations.length > 0)) {
                setDraft((prev: any) => ({
                  ...prev,
                  tasks: prev.tasks.map((t: any) => {
                    if (t.id !== target.taskId) return t;
                    return {
                      ...t,
                      processes: t.processes.map((p: any) => {
                        if (p.id !== target.processId) return p;
                        return {
                          ...p,
                          hazards: p.hazards.map((h: any) => h.id === target.hazardId ? {
                            ...h,
                            current_controls_items: controls,
                            current_control_text: h.current_control_text || controls[0] || '',
                            mitigation_items: mitigations,
                            mitigation_text: h.mitigation_text || mitigations[0] || '',
                            judgement: h.judgement || '하'
                          } : h)
                        };
                      })
                    };
                  })
                }));
                completedRef.current.add(target.rowKey);
              }
            } catch (e) {
              console.error(e);
            } finally {
              setLoadingMap(prev => { const next = { ...prev }; delete next[target.rowKey]; return next; });
            }
          })
        ]);
      } catch (err) {
        console.error("AutoFill Error:", err);
      } finally {
        // 🏁 [STEP 3] API가 다 끝나고 + 10초가 지났을 때만 해제
        setIsAnalyzing(false);
        setIsInitialAnalyzing(false);
      }
    };

    runAutoFill();

    return () => {
      controller.abort();
      setIsAnalyzing(false);
    };
  }, [targetsSig, userKey, setIsAnalyzing]);

  if (rows.length === 0) {
    return (
      <div className={s.wrap}>
        <div className={s.empty}>작업/공정을 먼저 추가해 주세요.</div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      {/* 분석 중 알림 바 */}
      {isInitialAnalyzing && (
        <div className={s.initialLoader}>
          <RefreshCw size={20} className={s.spin} />
          <span>AI가 최적의 위험 감소 대책을 분석하고 있습니다 (약 10초 소요)...</span>
        </div>
      )}

      <div className={s.topNote}>
        위험요인별로 <b>위험성 판단(상/중/하)</b>을 선택하고, 감소 대책을 수립해 주세요.
      </div>

      {rows.map((r) => {
        const loading = !!loadingMap[r.rowKey];
        return (
          <div key={r.rowKey} className={s.card}>
            <div className={s.head}>
              <div className={s.path}>{r.process_name} › {r.sub_process}</div>
              {loading && <div className={s.loadingBadge}>🔄 분석 중...</div>}
            </div>
            <div className={s.hazardTitle}>⚠️ {r.risk_situation_result}</div>
            
            {/* 1. 위험성 판단 */}
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

            {/* 2. 현재 안전조치 */}
            <div className={s.section}>
              <div className={s.sectionTitle}>현재 안전조치</div>
              {r.current_controls_items.length > 0 && (
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
              )}
              <textarea
                className={s.textarea}
                placeholder="현재 적용 중인 안전조치를 입력하세요"
                value={r.current_control_text}
                onChange={(e) => updateHazard(r.taskId, r.processId, r.hazardId, { current_control_text: e.target.value })}
              />
            </div>

            {/* 3. 개선 대책 */}
            <div className={s.section}>
              <div className={s.sectionTitle}>개선 대책</div>
              {r.mitigation_items.length > 0 && (
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
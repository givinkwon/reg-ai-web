'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepControls.module.css';
import type { RiskAssessmentDraft, Judgement } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useRiskWizardStore } from '@/app/store/docs';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Docs', section: 'RiskAssessment', area: 'StepControls' } as const;

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

const JUDGEMENTS: Judgement[] = ['상', '중', '하'];
const norm = (v?: string | null) => (v ?? '').trim();

// === 유틸리티 함수 ===
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

  const setIsAnalyzing = useRiskWizardStore((state) => state.setIsAnalyzing);

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  
  // ✅ 수정: 초기값을 false로 설정 (조건부 활성화)
  const [isInitialAnalyzing, setIsInitialAnalyzing] = useState(false);

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

  const handleChangeJudgement = (r: any, val: Judgement) => {
    track(gaEvent(GA_CTX, 'ChangeJudgement'), {
        ui_id: gaUiId(GA_CTX, 'ChangeJudgement'),
        hazard_title: r.risk_situation_result,
        old_value: r.judgement,
        new_value: val
    });
    updateHazard(r.taskId, r.processId, r.hazardId, { judgement: val });
  };

  const handleSelectRecommendation = (r: any, field: 'current_control_text' | 'mitigation_text', val: string) => {
    track(gaEvent(GA_CTX, 'SelectRecommendation'), {
        ui_id: gaUiId(GA_CTX, 'SelectRecommendation'),
        field,
        selected_text: val
    });
    updateHazard(r.taskId, r.processId, r.hazardId, { [field]: val });
  };

  // =================================================================
  // 🚀 [핵심] 자동 채움 로직 (뒤로가기 시 로딩 방지)
  // =================================================================
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const runAutoFill = async () => {
      // 아직 데이터가 없는 항목만 필터링
      const targetsToFetch = rows.filter(r => r.current_controls_items.length === 0 && !completedRef.current.has(r.rowKey));

      // ✅ 가져올 데이터가 없으면(=이미 다 채워져 있으면) 즉시 종료 (로딩 X)
      if (targetsToFetch.length === 0) {
        setIsAnalyzing(false);
        setIsInitialAnalyzing(false);
        return;
      }

      // ✅ 가져올 데이터가 있을 때만 로딩 시작
      setIsAnalyzing(true);
      setIsInitialAnalyzing(true);

      const minWaitTimer = new Promise(resolve => setTimeout(resolve, 10000)); 

      try {
        await Promise.all([
          minWaitTimer, 
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
        setIsAnalyzing(false);
        setIsInitialAnalyzing(false);
      }
    };

    runAutoFill();

    return () => {
      controller.abort();
      setIsAnalyzing(false);
    };
  }, [targetsSig, userKey, setIsAnalyzing]); // rows가 바뀌면(=새 항목 추가되면) 다시 실행됨

  if (rows.length === 0) {
    return (
      <div className={s.wrap}>
        <div className={s.empty}>작업/공정을 먼저 추가해 주세요.</div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      
      {/* 분석 중 팝업 (isInitialAnalyzing일 때만 뜸) */}
      {isInitialAnalyzing && (
        <div className={s.loadingOverlay}>
          <div className={s.loadingPopup}>
            <div className={s.spinnerWrapper}>
              <RefreshCw size={36} className={s.spin} />
              <div className={s.aiBadge}>
                <Sparkles size={14} fill="#fff" /> AI
              </div>
            </div>
            <div className={s.loadingTexts}>
              <h3 className={s.loadingTitle}>AI가 분석 중입니다</h3>
              <p className={s.loadingDesc}>
                최적의 위험 감소 대책을 도출하고 있습니다.<br/>
                잠시만 기다려 주세요. (약 10초 소요)
              </p>
            </div>
          </div>
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
            
            <div className={s.section}>
              <div className={s.sectionTitle}>위험성 판단</div>
              <div className={s.judgementGroup}>
                {JUDGEMENTS.map((j) => (
                  <button
                    key={j}
                    type="button"
                    className={`${s.judgementBtn} ${r.judgement === j ? s[j === '상' ? 'high' : j === '중' ? 'mid' : 'low'] : ''}`}
                    onClick={() => handleChangeJudgement(r, j)}
                    data-ga-event="ChangeJudgement"
                    data-ga-id={gaUiId(GA_CTX, 'ChangeJudgement')}
                    data-ga-label={j}
                  >
                    {j}
                  </button>
                ))}
              </div>
            </div>

            <div className={s.section}>
              <div className={s.sectionTitle}>현재 안전조치</div>
              {r.current_controls_items.length > 0 && (
                <div className={s.chipRow}>
                  {r.current_controls_items.map((x: string) => (
                    <button
                      key={x}
                      type="button"
                      className={`${s.chip} ${norm(r.current_control_text) === norm(x) ? s.chipActive : ''}`}
                      onClick={() => handleSelectRecommendation(r, 'current_control_text', x)}
                      data-ga-event="SelectRecommendation"
                      data-ga-id={gaUiId(GA_CTX, 'SelectRecommendation')}
                      data-ga-label={x}
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

            <div className={s.section}>
              <div className={s.sectionTitle}>개선 대책</div>
              {r.mitigation_items.length > 0 && (
                <div className={s.chipRow}>
                  {r.mitigation_items.map((x: string) => (
                    <button
                      key={x}
                      type="button"
                      className={`${s.chip} ${norm(r.mitigation_text) === norm(x) ? s.chipActive : ''}`}
                      onClick={() => handleSelectRecommendation(r, 'mitigation_text', x)}
                      data-ga-event="SelectRecommendation"
                      data-ga-id={gaUiId(GA_CTX, 'SelectRecommendation')}
                      data-ga-label={x}
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
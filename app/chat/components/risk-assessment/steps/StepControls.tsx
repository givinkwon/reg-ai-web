// components/risk-assessment/steps/StepControls.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepControls.module.css';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

type Judgement = '상' | '중' | '하';

const JUDGEMENTS: Judgement[] = ['상', '중', '하'];
const norm = (v?: string | null) => (v ?? '').trim();

// =========================
// ✅ Cache (hazard 단위)
// key = user + process_name + sub_process + risk_situation_result
// =========================
const CACHE_PREFIX = 'regai:risk:stepControls:v2'; // ✅ v2로 bump (기존 빈 캐시 무효화)
const TTL_MS = 1000 * 60 * 60 * 24 * 180;

type ControlCache = {
  v: 2;
  ts: number;
  fetched: boolean; // ✅ API를 한번이라도 조회했거나, 의미 있는 사용자 입력이 있는지

  user: string;
  process_name: string;
  sub_process: string;
  risk_situation_result: string;

  judgement: Judgement;
  current_controls_items: string[];
  risk_judgement_reasons: string[];

  current_control_text: string; // 현재안전조치 선택/입력값
  judgement_reason_text: string; // 판단근거 선택/입력값
};

function cacheKey(
  userEmail: string | null | undefined,
  processName: string,
  subProcess: string,
  riskSituation: string,
) {
  const u = norm(userEmail) || 'guest';
  return `${CACHE_PREFIX}:${encodeURIComponent(u)}:${encodeURIComponent(norm(processName))}:${encodeURIComponent(
    norm(subProcess),
  )}:${encodeURIComponent(norm(riskSituation))}`;
}

function isEmptyShell(c: ControlCache) {
  const controls = Array.isArray(c.current_controls_items) ? c.current_controls_items.length : 0;
  const reasons = Array.isArray(c.risk_judgement_reasons) ? c.risk_judgement_reasons.length : 0;
  const t1 = norm(c.current_control_text);
  const t2 = norm(c.judgement_reason_text);

  // ✅ fetched=false 이면서 아무것도 없으면 “빈 캐시”로 간주
  return !c.fetched && controls === 0 && reasons === 0 && !t1 && !t2;
}

function readCache(key: string): ControlCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ControlCache;

    if (!parsed?.ts) return null;
    if (parsed.v !== 2) return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;

    if (isEmptyShell(parsed)) return null; // ✅ 빈 캐시는 MISS 처리
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: ControlCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export default function StepControls({ draft, setDraft }: Props) {
  const user = useUserStore((st) => st.user);

  // rowKey별 자동 로딩 표시
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const autoFilledRef = useRef<Set<string>>(new Set());

  const rows = useMemo(() => {
    const out: Array<{
      rowKey: string;
      taskId: string;
      processId: string;
      hazardId: string;

      process_name: string; // taskTitle
      sub_process: string; // processTitle
      risk_situation_result: string; // hazardTitle

      judgement: Judgement;
      current_controls_items: string[];
      risk_judgement_reasons: string[];

      current_control_text: string;
      judgement_reason_text: string;
    }> = [];

    draft.tasks.forEach((t) => {
      t.processes.forEach((p) => {
        p.hazards.forEach((h: any) => {
          const process_name = norm(t.title);
          const sub_process = norm(p.title);
          const risk_situation_result = norm(h.title);

          const rowKey = `${t.id}:${p.id}:${h.id}`;

          out.push({
            rowKey,
            taskId: t.id,
            processId: p.id,
            hazardId: h.id,

            process_name,
            sub_process,
            risk_situation_result,

            judgement: (h.judgement as Judgement) ?? '중',
            current_controls_items: Array.isArray(h.current_controls_items)
              ? h.current_controls_items.map(norm).filter(Boolean)
              : [],
            risk_judgement_reasons: Array.isArray(h.risk_judgement_reasons)
              ? h.risk_judgement_reasons.map(norm).filter(Boolean)
              : [],

            current_control_text: norm(h.current_control_text),
            judgement_reason_text: norm(h.judgement_reason_text),
          });
        });
      });
    });

    return out;
  }, [draft]);

  const updateHazard = (
    taskId: string,
    processId: string,
    hazardId: string,
    patch: Partial<{
      judgement: Judgement;
      current_controls_items: string[];
      risk_judgement_reasons: string[];
      current_control_text: string;
      judgement_reason_text: string;
    }>,
  ) => {
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
              hazards: p.hazards.map((h: any) => {
                if (h.id !== hazardId) return h;
                return { ...h, ...patch };
              }),
            };
          }),
        };
      }),
    }));
  };

  // =========================
  // ✅ 자동 채움: 캐시 우선 → 없으면 API(control-options)
  //    - chips 불러오고, 첫번째를 텍스트에 자동 선택
  // =========================
  useEffect(() => {
    let cancelled = false;
    const controllers: AbortController[] = [];

    const run = async () => {
      for (const r of rows) {
        if (cancelled) return;

        if (!r.process_name || !r.sub_process || !r.risk_situation_result) continue;
        if (autoFilledRef.current.has(r.rowKey)) continue;

        const ck = cacheKey(user?.email, r.process_name, r.sub_process, r.risk_situation_result);

        // ✅ 1) 캐시 (빈 캐시는 readCache에서 MISS)
        const cached = readCache(ck);
        if (cached) {
          const controls = Array.from(new Set((cached.current_controls_items ?? []).map(norm))).filter(Boolean);
          const reasons = Array.from(new Set((cached.risk_judgement_reasons ?? []).map(norm))).filter(Boolean);

          const nextControlText = norm(cached.current_control_text) || (controls[0] ?? '');
          const nextReasonText = norm(cached.judgement_reason_text) || (reasons[0] ?? '');

          updateHazard(r.taskId, r.processId, r.hazardId, {
            judgement: cached.judgement ?? '중',
            current_controls_items: controls,
            risk_judgement_reasons: reasons,
            current_control_text: nextControlText,
            judgement_reason_text: nextReasonText,
          });

          autoFilledRef.current.add(r.rowKey);
          continue;
        }

        // ✅ 2) API
        setLoadingMap((prev) => ({ ...prev, [r.rowKey]: true }));

        const ac = new AbortController();
        controllers.push(ac);

        try {
          const qs = new URLSearchParams();
          qs.set('endpoint', 'control-options');
          qs.set('process_name', r.process_name);
          qs.set('sub_process', r.sub_process);
          qs.set('risk_situation_result', r.risk_situation_result);
          qs.set('limit', '80');

          const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
            cache: 'no-store',
            signal: ac.signal,
          });

          if (!res.ok) {
            autoFilledRef.current.add(r.rowKey);
            continue;
          }

          const data = (await res.json()) as {
            current_controls_items?: string[];
            risk_judgement_reasons?: string[];
          };

          const controls = Array.from(new Set((data.current_controls_items ?? []).map(norm))).filter(Boolean);
          const reasons = Array.from(new Set((data.risk_judgement_reasons ?? []).map(norm))).filter(Boolean);

          const nextControlText = r.current_control_text || (controls[0] ?? '');
          const nextReasonText = r.judgement_reason_text || (reasons[0] ?? '');

          updateHazard(r.taskId, r.processId, r.hazardId, {
            current_controls_items: controls,
            risk_judgement_reasons: reasons,
            current_control_text: nextControlText,
            judgement_reason_text: nextReasonText,
          });

          // ✅ 캐시 저장 (API 한번 조회했다는 의미로 fetched=true)
          writeCache(ck, {
            v: 2,
            ts: Date.now(),
            fetched: true,

            user: norm(user?.email) || 'guest',
            process_name: r.process_name,
            sub_process: r.sub_process,
            risk_situation_result: r.risk_situation_result,

            judgement: r.judgement ?? '중',
            current_controls_items: controls,
            risk_judgement_reasons: reasons,
            current_control_text: nextControlText,
            judgement_reason_text: nextReasonText,
          });

          autoFilledRef.current.add(r.rowKey);
        } catch (e: any) {
          if (e?.name !== 'AbortError') autoFilledRef.current.add(r.rowKey);
        } finally {
          setLoadingMap((prev) => ({ ...prev, [r.rowKey]: false }));
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [rows, user?.email]); // rows 변동 시 새 항목만 autoFilledRef로 1회 처리

  // =========================
  // ✅ 사용자가 수정한 값도 캐시에 반영
  //    - 단, “완전 빈 값”은 저장하지 않음(빈 캐시 생성 방지)
  //    - 디바운스(타이핑마다 localStorage 쓰기 방지)
  // =========================
  useEffect(() => {
    const t = setTimeout(() => {
      for (const r of rows) {
        if (!r.process_name || !r.sub_process || !r.risk_situation_result) continue;

        const hasMeaning =
          r.current_controls_items.length > 0 ||
          r.risk_judgement_reasons.length > 0 ||
          !!norm(r.current_control_text) ||
          !!norm(r.judgement_reason_text) ||
          r.judgement !== '중';

        if (!hasMeaning) continue; // ✅ 빈 캐시 저장 금지

        const ck = cacheKey(user?.email, r.process_name, r.sub_process, r.risk_situation_result);

        writeCache(ck, {
          v: 2,
          ts: Date.now(),
          fetched: true, // ✅ 사용자 입력이 있으면 의미 있으니 true

          user: norm(user?.email) || 'guest',
          process_name: r.process_name,
          sub_process: r.sub_process,
          risk_situation_result: r.risk_situation_result,

          judgement: r.judgement ?? '중',
          current_controls_items: r.current_controls_items ?? [],
          risk_judgement_reasons: r.risk_judgement_reasons ?? [],
          current_control_text: r.current_control_text ?? '',
          judgement_reason_text: r.judgement_reason_text ?? '',
        });
      }
    }, 250);

    return () => clearTimeout(t);
  }, [rows, user?.email]);

  if (rows.length === 0) {
    return (
      <div className={s.wrap}>
        <div className={s.topNote}>위험요인별로 위험성 판단(상/중/하)과 근거/현재안전조치를 작성해 주세요.</div>
        <div className={s.empty}>아직 위험요인이 없습니다. 이전 단계에서 유해·위험요인을 추가해 주세요.</div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>
        위험요인별로 <b>위험성 판단(상/중/하)</b>을 선택하고, <b>현재안전조치</b>와 <b>위험성 판단 근거</b>를 입력/선택해 주세요.
      </div>

      {rows.map((r) => {
        const loading = !!loadingMap[r.rowKey];

        return (
          <div key={r.rowKey} className={s.card}>
            <div className={s.head}>
              <div className={s.path}>
                <span className={s.pathStrong}>{r.process_name || '(작업 미입력)'}</span>
                <span className={s.pathSep}>›</span>
                <span className={s.pathStrong}>{r.sub_process || '(공정 미입력)'}</span>
              </div>
              {loading ? <div className={s.loadingBadge}>DB 조회 중…</div> : null}
            </div>

            <div className={s.hazardTitle}>• {r.risk_situation_result}</div>

            {/* 1) 위험성 판단 (상/중/하) */}
            <div className={s.section}>
              <div className={s.sectionTitle}>위험성 판단</div>
              <div className={s.seg}>
                {JUDGEMENTS.map((j) => (
                  <button
                    key={j}
                    type="button"
                    className={`${s.segBtn} ${r.judgement === j ? s.segBtnActive : ''}`}
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
                  {r.current_controls_items.map((x) => {
                    const selected = norm(r.current_control_text) === norm(x);
                    return (
                      <button
                        key={x}
                        type="button"
                        className={`${s.chip} ${selected ? s.chipActive : ''}`}
                        onClick={() => updateHazard(r.taskId, r.processId, r.hazardId, { current_control_text: x })}
                        title="클릭하면 선택됩니다"
                      >
                        {x}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={s.hint}>DB에 등록된 현재 안전조치가 없습니다. 직접 입력할 수 있어요.</div>
              )}

              <textarea
                className={s.textarea}
                placeholder="현재 적용 중인 안전조치를 입력하세요 (예: 가드 설치, 인터록, PPE 등)"
                value={r.current_control_text}
                onChange={(e) =>
                  updateHazard(r.taskId, r.processId, r.hazardId, { current_control_text: e.target.value })
                }
              />
            </div>

            {/* 3) 위험성 판단 근거 */}
            <div className={s.section}>
              <div className={s.sectionTitle}>위험성 판단 근거</div>

              {r.risk_judgement_reasons.length > 0 ? (
                <div className={s.chipRow}>
                  {r.risk_judgement_reasons.map((x) => {
                    const selected = norm(r.judgement_reason_text) === norm(x);
                    return (
                      <button
                        key={x}
                        type="button"
                        className={`${s.chip} ${selected ? s.chipActive : ''}`}
                        onClick={() => updateHazard(r.taskId, r.processId, r.hazardId, { judgement_reason_text: x })}
                        title="클릭하면 선택됩니다"
                      >
                        {x}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={s.hint}>DB에 등록된 판단 근거가 없습니다. 직접 입력할 수 있어요.</div>
              )}

              <textarea
                className={s.textarea}
                placeholder="위험성 판단 근거를 입력하세요 (예: 작업빈도/노출시간/과거사고/법규근거 등)"
                value={r.judgement_reason_text}
                onChange={(e) =>
                  updateHazard(r.taskId, r.processId, r.hazardId, { judgement_reason_text: e.target.value })
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

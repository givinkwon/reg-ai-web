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
const CACHE_PREFIX = 'regai:risk:stepControls:v4'; // ✅ v4로 bump (기존 v3 캐시 무효화)
const TTL_MS = 1000 * 60 * 60 * 24 * 180;

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
  const mitigations = Array.isArray(c.mitigation_items) ? c.mitigation_items.length : 0;
  const t1 = norm(c.current_control_text);
  const t2 = norm(c.mitigation_text);

  return !c.fetched && controls === 0 && mitigations === 0 && !t1 && !t2;
}

function readCache(key: string): ControlCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ControlCache;

    if (!parsed?.ts) return null;
    if (parsed.v !== 4) return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;

    if (isEmptyShell(parsed)) return null;
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

function dedup(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const v = norm(String(x ?? ''));
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export default function StepControls({ draft, setDraft }: Props) {
  const user = useUserStore((st) => st.user);

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  // ✅ row 처리 완료/진행 중 마킹 (무한 호출 방지)
  const doneRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef<Set<string>>(new Set());

  // ===== 렌더용 rows (UI 표시) =====
  const rows = useMemo(() => {
    const out: Array<{
      rowKey: string;
      taskId: string;
      processId: string;
      hazardId: string;

      process_name: string;
      sub_process: string;
      risk_situation_result: string;

      judgement: Judgement;

      current_controls_items: string[];
      current_control_text: string;

      mitigation_items: string[];
      mitigation_text: string;
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
            current_control_text: norm(h.current_control_text),

            mitigation_items: Array.isArray(h.mitigation_items) ? h.mitigation_items.map(norm).filter(Boolean) : [],
            mitigation_text: norm(h.mitigation_text),
          });
        });
      });
    });

    return out;
  }, [draft]);

  // ===== effect에서 사용할 “대상” (deps용 시그니처는 값(텍스트/칩) 제외) =====
  const targets = useMemo(() => {
    return rows.map((r) => ({
      rowKey: r.rowKey,
      taskId: r.taskId,
      processId: r.processId,
      hazardId: r.hazardId,
      process_name: r.process_name,
      sub_process: r.sub_process,
      risk_situation_result: r.risk_situation_result,
      // 현재 값(초기 텍스트 유지용)
      current_control_text: r.current_control_text,
      mitigation_text: r.mitigation_text,
      judgement: r.judgement,
      current_controls_items: r.current_controls_items,
      mitigation_items: r.mitigation_items,
    }));
  }, [rows]);

  // ✅ deps 시그니처: 텍스트/칩 변화는 제외하고 “식별/제목”만으로 구성 (무한 호출 방지 핵심)
  const targetsSig = useMemo(() => {
    return targets
      .map(
        (t) =>
          `${t.rowKey}|${t.process_name}|${t.sub_process}|${t.risk_situation_result}`,
      )
      .join('||');
  }, [targets]);

  const updateHazard = (
    taskId: string,
    processId: string,
    hazardId: string,
    patch: Partial<{
      judgement: Judgement;

      current_controls_items: string[];
      current_control_text: string;

      mitigation_items: string[];
      mitigation_text: string;
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
  // ✅ 자동 채움: 캐시 우선 → 없으면 API 2개 호출
  //    - control-options: 현재 안전조치
  //    - mitigation-options: 개선대책
  // =========================
  useEffect(() => {
    let cancelled = false;
    const controllers: AbortController[] = [];

    const run = async () => {
      for (const t of targets) {
        if (cancelled) return;

        if (!t.process_name || !t.sub_process || !t.risk_situation_result) continue;

        // ✅ 사용자별/row별 고유 처리 키
        const userKey = norm(user?.email) || 'guest';
        const runKey = `${userKey}::${t.rowKey}`;

        // ✅ 이미 끝났거나 진행 중이면 스킵 (무한 호출 방지)
        if (doneRef.current.has(runKey) || inflightRef.current.has(runKey)) continue;

        // ✅ “시작 즉시” in-flight 마킹 (updateHazard로 리렌더 되어도 재진입 방지)
        inflightRef.current.add(runKey);

        const ck = cacheKey(user?.email, t.process_name, t.sub_process, t.risk_situation_result);

        // 1) 캐시 먼저 적용
        const cached = readCache(ck);
        if (cached) {
          const controls = dedup(cached.current_controls_items);
          const mitigations = dedup(cached.mitigation_items);

          const nextControlText = norm(cached.current_control_text) || (controls[0] ?? '');
          const nextMitigationText = norm(cached.mitigation_text) || (mitigations[0] ?? '');

          updateHazard(t.taskId, t.processId, t.hazardId, {
            judgement: cached.judgement ?? t.judgement ?? '중',
            current_controls_items: controls,
            current_control_text: nextControlText,
            mitigation_items: mitigations,
            mitigation_text: nextMitigationText,
          });
        }

        // 캐시/현재값이 비어있으면 API 요청
        const needControls =
          (cached?.current_controls_items?.length ?? 0) === 0 && (t.current_controls_items?.length ?? 0) === 0;
        const needMitigations =
          (cached?.mitigation_items?.length ?? 0) === 0 && (t.mitigation_items?.length ?? 0) === 0;

        if (!needControls && !needMitigations) {
          doneRef.current.add(runKey);
          inflightRef.current.delete(runKey);
          continue;
        }

        setLoadingMap((prev) => ({ ...prev, [t.rowKey]: true }));

        const ac = new AbortController();
        controllers.push(ac);

        try {
          const makeUrl = (endpoint: string) => {
            const qs = new URLSearchParams();
            qs.set('endpoint', endpoint);
            qs.set('process_name', t.process_name);
            qs.set('sub_process', t.sub_process);
            qs.set('risk_situation_result', t.risk_situation_result);
            qs.set('limit', '80');
            return `/api/risk-assessment?${qs.toString()}`;
          };

          const fetchJson = async <T,>(url: string): Promise<T | null> => {
            const res = await fetch(url, { cache: 'no-store', signal: ac.signal });
            if (!res.ok) return null;
            return (await res.json()) as T;
          };

          type ControlRes = { current_controls_items?: string[] };
          type MitigationRes = { mitigation_items?: string[] };

          const [controlData, mitigationData] = await Promise.all([
            needControls ? fetchJson<ControlRes>(makeUrl('control-options')) : Promise.resolve(null),
            needMitigations ? fetchJson<MitigationRes>(makeUrl('mitigation-options')) : Promise.resolve(null),
          ]);

          // ✅ API 우선, 없으면 cached/현재값 fallback
          const controls = dedup(controlData?.current_controls_items ?? cached?.current_controls_items ?? t.current_controls_items ?? []);
          const mitigations = dedup(mitigationData?.mitigation_items ?? cached?.mitigation_items ?? t.mitigation_items ?? []);

          const nextControlText = norm(t.current_control_text) || norm(cached?.current_control_text) || (controls[0] ?? '');
          const nextMitigationText = norm(t.mitigation_text) || norm(cached?.mitigation_text) || (mitigations[0] ?? '');

          updateHazard(t.taskId, t.processId, t.hazardId, {
            current_controls_items: controls,
            current_control_text: nextControlText,
            mitigation_items: mitigations,
            mitigation_text: nextMitigationText,
          });

          // ✅ 캐시 저장
          writeCache(ck, {
            v: 4,
            ts: Date.now(),
            fetched: true,

            user: norm(user?.email) || 'guest',
            process_name: t.process_name,
            sub_process: t.sub_process,
            risk_situation_result: t.risk_situation_result,

            judgement: t.judgement ?? '중',

            current_controls_items: controls,
            current_control_text: nextControlText,

            mitigation_items: mitigations,
            mitigation_text: nextMitigationText,
          });

          doneRef.current.add(runKey);
        } catch (e: any) {
          // 실패해도 재진입 루프 방지: done 처리(원하면 retry 정책으로 바꿔도 됨)
          if (e?.name !== 'AbortError') doneRef.current.add(runKey);
        } finally {
          inflightRef.current.delete(runKey);
          setLoadingMap((prev) => ({ ...prev, [t.rowKey]: false }));
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
    // ✅ rows가 아니라 "시그니처"에만 의존 (무한 호출 방지 핵심)
  }, [targetsSig, user?.email]);

  // =========================
  // ✅ 사용자 수정값 캐시 반영 (디바운스)
  // =========================
  useEffect(() => {
    const t = setTimeout(() => {
      for (const r of rows) {
        if (!r.process_name || !r.sub_process || !r.risk_situation_result) continue;

        const hasMeaning =
          r.current_controls_items.length > 0 ||
          !!norm(r.current_control_text) ||
          r.mitigation_items.length > 0 ||
          !!norm(r.mitigation_text) ||
          r.judgement !== '중';

        if (!hasMeaning) continue;

        const ck = cacheKey(user?.email, r.process_name, r.sub_process, r.risk_situation_result);

        writeCache(ck, {
          v: 4,
          ts: Date.now(),
          fetched: true,

          user: norm(user?.email) || 'guest',
          process_name: r.process_name,
          sub_process: r.sub_process,
          risk_situation_result: r.risk_situation_result,

          judgement: r.judgement ?? '중',

          current_controls_items: r.current_controls_items ?? [],
          current_control_text: r.current_control_text ?? '',

          mitigation_items: r.mitigation_items ?? [],
          mitigation_text: r.mitigation_text ?? '',
        });
      }
    }, 250);

    return () => clearTimeout(t);
  }, [rows, user?.email]);

  if (rows.length === 0) {
    return (
      <div className={s.wrap}>
        <div className={s.topNote}>위험요인별로 위험성 판단(상/중/하)과 현재안전조치/개선대책을 작성해 주세요.</div>
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
                <span className={s.pathStrong}>{r.process_name || '(작업 미입력)'}</span>
                <span className={s.pathSep}>›</span>
                <span className={s.pathStrong}>{r.sub_process || '(공정 미입력)'}</span>
              </div>
              {loading ? <div className={s.loadingBadge}>DB 조회 중…</div> : null}
            </div>

            <div className={s.hazardTitle}>• {r.risk_situation_result}</div>

            {/* 1) 위험성 판단 */}
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

            {/* 3) 개선 대책 */}
            <div className={s.section}>
              <div className={s.sectionTitle}>개선 대책</div>

              {r.mitigation_items.length > 0 ? (
                <div className={s.chipRow}>
                  {r.mitigation_items.map((x) => {
                    const selected = norm(r.mitigation_text) === norm(x);
                    return (
                      <button
                        key={x}
                        type="button"
                        className={`${s.chip} ${selected ? s.chipActive : ''}`}
                        onClick={() => updateHazard(r.taskId, r.processId, r.hazardId, { mitigation_text: x })}
                        title="클릭하면 선택됩니다"
                      >
                        {x}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={s.hint}>DB에 등록된 개선 대책이 없습니다. 직접 입력할 수 있어요.</div>
              )}

              <textarea
                className={s.textarea}
                placeholder="개선 대책을 입력하세요 (예: 국소배기 설치, 환기 강화, MSDS 교육, 보호구 지급/착용 등)"
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

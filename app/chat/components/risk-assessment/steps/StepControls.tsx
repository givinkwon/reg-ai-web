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
const CACHE_PREFIX = 'regai:risk:stepControls:v4';
const TTL_MS = 1000 * 60 * 60 * 24 * 180;

// ✅ 재시도 쿨다운(실패/빈응답 시에도 연타 방지)
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

  // ✅ fetched=false & 모두 비어있으면 무시하고 재호출되게
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

// =========================
// ✅ 응답 정규화 유틸 (StepProcesses/StepHazards와 동일한 원인 대응)
// =========================
function toText(x: any): string {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    return x.title ?? x.name ?? x.text ?? x.value ?? x.label ?? '';
  }
  return '';
}

/**
 * payload가
 * - string[]
 * - {items:[]}
 * - {current_controls_items:[]}
 * - {mitigation_items:[]}
 * - {value: ...} (프록시가 감쌀 수 있음)
 * - {rows:[]}, {data:[]}
 * - 객체 배열([{title:"..."}, ...])
 * 등 어떤 형태로 와도 문자열 배열로 뽑아내기
 */
function extractStringList(payload: any, preferredKeys: string[] = []): string[] {
  let v: any = payload;

  // 1) 프록시가 {value: ...}로 감싼 케이스 1~2회 풀기
  for (let i = 0; i < 2; i++) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) {
      v = (v as any).value;
    } else break;
  }

  // 2) 배열이면 그대로
  if (Array.isArray(v)) {
    return Array.from(new Set(v.map(toText).map(norm).filter(Boolean)));
  }

  // 3) 객체면: 우선 preferredKeys → 그 다음 일반 키 후보들
  if (v && typeof v === 'object') {
    const obj = v as any;

    // preferredKeys 우선
    for (const k of preferredKeys) {
      if (Array.isArray(obj?.[k])) {
        return Array.from(new Set(obj[k].map(toText).map(norm).filter(Boolean)));
      }
    }

    // 일반 후보들
    const commonKeys = ['items', 'rows', 'data', 'list', 'results'];
    for (const k of commonKeys) {
      if (Array.isArray(obj?.[k])) {
        return Array.from(new Set(obj[k].map(toText).map(norm).filter(Boolean)));
      }
    }
  }

  return [];
}

export default function StepControls({ draft, setDraft }: Props) {
  const user = useUserStore((st) => st.user);
  const userKey = norm(user?.email) || 'guest';

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  /**
   * ✅ done/inflight 키에 scope(=cacheKey)까지 포함해서 관리
   */
  const doneRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef<Set<string>>(new Set());
  const attemptRef = useRef<Map<string, number>>(new Map());

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

  // ===== effect에서 사용할 “대상” =====
  const targets = useMemo(() => {
    return rows.map((r) => ({
      rowKey: r.rowKey,
      taskId: r.taskId,
      processId: r.processId,
      hazardId: r.hazardId,

      process_name: r.process_name,
      sub_process: r.sub_process,
      risk_situation_result: r.risk_situation_result,

      current_control_text: r.current_control_text,
      mitigation_text: r.mitigation_text,
      judgement: r.judgement,
      current_controls_items: r.current_controls_items,
      mitigation_items: r.mitigation_items,
    }));
  }, [rows]);

  // ✅ deps 시그니처: 텍스트/칩 변화는 제외하고 “식별/제목”만으로 구성
  const targetsSig = useMemo(() => {
    return targets
      .map((t) => `${t.rowKey}|${t.process_name}|${t.sub_process}|${t.risk_situation_result}`)
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
  //
  // ✅ FIX:
  // - API 응답 형태 정규화(extractStringList)
  // - AbortError 시 return 금지(continue)
  // =========================
  useEffect(() => {
    let cancelled = false;
    const controllers: AbortController[] = [];

    const run = async () => {
      for (const t of targets) {
        if (cancelled) return;

        if (!t.process_name || !t.sub_process || !t.risk_situation_result) continue;

        const ck = cacheKey(user?.email, t.process_name, t.sub_process, t.risk_situation_result);
        const scopeKey = `${t.rowKey}|${ck}`; // ✅ 스코프 포함 키

        // ✅ 이미 끝났거나 진행 중이면 스킵
        if (doneRef.current.has(scopeKey) || inflightRef.current.has(scopeKey)) continue;

        // ✅ 쿨다운(실패/빈응답이어도 연타 방지)
        const last = attemptRef.current.get(scopeKey);
        if (last && Date.now() - last < RETRY_COOLDOWN_MS) continue;

        // ✅ 시작 즉시 in-flight 마킹 (리렌더 재진입 방지)
        inflightRef.current.add(scopeKey);

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

        // ✅ 캐시/현재값이 비어있으면 API 요청
        const needControls =
          (cached?.current_controls_items?.length ?? 0) === 0 && (t.current_controls_items?.length ?? 0) === 0;
        const needMitigations =
          (cached?.mitigation_items?.length ?? 0) === 0 && (t.mitigation_items?.length ?? 0) === 0;

        if (!needControls && !needMitigations) {
          doneRef.current.add(scopeKey);
          inflightRef.current.delete(scopeKey);
          continue;
        }

        setLoadingMap((prev) => ({ ...prev, [t.rowKey]: true }));
        attemptRef.current.set(scopeKey, Date.now());

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

          const fetchJson = async (url: string): Promise<{ ok: boolean; data: any }> => {
            const res = await fetch(url, { cache: 'no-store', signal: ac.signal });
            if (!res.ok) return { ok: false, data: null };
            const data = await res.json();
            return { ok: true, data };
          };

          const [controlRes, mitigationRes] = await Promise.all([
            needControls ? fetchJson(makeUrl('control-options')) : Promise.resolve({ ok: true, data: null }),
            needMitigations ? fetchJson(makeUrl('mitigation-options')) : Promise.resolve({ ok: true, data: null }),
          ]);

          const controlOk = controlRes.ok;
          const mitigationOk = mitigationRes.ok;

          // ✅ 응답 형태 정규화
          // - control-options: current_controls_items / items / array / value 등 모두 대응
          // - mitigation-options: mitigation_items / items / array / value 등 모두 대응
          const controlsFromApi = needControls
            ? extractStringList(controlRes.data, ['current_controls_items', 'controls', 'control_items', 'options'])
            : [];
          const mitigationsFromApi = needMitigations
            ? extractStringList(mitigationRes.data, ['mitigation_items', 'mitigations', 'mitigation_options', 'options'])
            : [];

          const controls = dedup(
            controlsFromApi.length > 0
              ? controlsFromApi
              : cached?.current_controls_items ?? t.current_controls_items ?? [],
          );
          const mitigations = dedup(
            mitigationsFromApi.length > 0 ? mitigationsFromApi : cached?.mitigation_items ?? t.mitigation_items ?? [],
          );

          const nextControlText =
            norm(t.current_control_text) || norm(cached?.current_control_text) || (controls[0] ?? '');
          const nextMitigationText =
            norm(t.mitigation_text) || norm(cached?.mitigation_text) || (mitigations[0] ?? '');

          updateHazard(t.taskId, t.processId, t.hazardId, {
            current_controls_items: controls,
            current_control_text: nextControlText,
            mitigation_items: mitigations,
            mitigation_text: nextMitigationText,
          });

          // ✅ 캐시는 "최소 1개라도 ok"면 저장하되,
          // fetched는 (요청한 것들이) 모두 ok일 때만 true
          const fetched = (needControls ? controlOk : true) && (needMitigations ? mitigationOk : true);

          writeCache(ck, {
            v: 4,
            ts: Date.now(),
            fetched,

            user: userKey,
            process_name: t.process_name,
            sub_process: t.sub_process,
            risk_situation_result: t.risk_situation_result,

            judgement: t.judgement ?? '중',

            current_controls_items: controls,
            current_control_text: nextControlText,

            mitigation_items: mitigations,
            mitigation_text: nextMitigationText,
          });

          // ✅ 둘 다 성공(또는 필요 없는 요청은 true로 간주)했을 때만 done
          if (fetched) {
            doneRef.current.add(scopeKey);
          }
        } catch (e: any) {
          // ✅ AbortError는 전체 중단(return)하지 말고 해당 row만 스킵
          if (e?.name === 'AbortError') continue;
        } finally {
          inflightRef.current.delete(scopeKey);
          setLoadingMap((prev) => ({ ...prev, [t.rowKey]: false }));
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [targetsSig, user?.email]);

  // =========================
  // ✅ 사용자 수정값 캐시 반영 (디바운스)
  // =========================
  useEffect(() => {
    const tmr = setTimeout(() => {
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

          user: userKey,
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

    return () => clearTimeout(tmr);
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
                onChange={(e) => updateHazard(r.taskId, r.processId, r.hazardId, { current_control_text: e.target.value })}
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

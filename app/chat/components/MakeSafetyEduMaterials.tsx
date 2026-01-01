'use client';

import { ChevronDown, FileText, Download, Search, X } from 'lucide-react';
import s from './ChatArea.module.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  loadSafetyEduData,
  type SafetyEduCategory,
  type SafetyEduMaterial,
  type SafetyEduGuide,
} from './SafetyEduCatalog'; // ✅ 경로는 네 프로젝트에 맞게

export type MakeSafetyEduMaterialsProps = {
  onSelectMaterial?: (params: {
    category: SafetyEduCategory;
    material: SafetyEduMaterial;
    guide: SafetyEduGuide;
  }) => void;

  selectedMaterialId?: string | null;

  renderSelectedMaterialPane?: (
    category: SafetyEduCategory,
    material: SafetyEduMaterial,
    guide: SafetyEduGuide,
  ) => ReactNode;
};

function normalize(str: string) {
  return (str || '').toLowerCase().replace(/\s+/g, '');
}

/** ✅ catalog.yml의 exclude 규칙 타입 */
type ExcludeRule =
  | { type: 'contains'; value: string }
  | { type: 'regex'; value: string }
  | { type: 'exact'; value: string };

function isExcluded(title: string, rules: ExcludeRule[]) {
  const raw = title ?? '';
  const n = normalize(raw);

  for (const r of rules) {
    const v = r?.value ?? '';
    if (!v) continue;

    if (r.type === 'contains') {
      if (n.includes(normalize(v))) return true;
    } else if (r.type === 'exact') {
      if (n === normalize(v)) return true;
    } else if (r.type === 'regex') {
      try {
        const re = new RegExp(v, 'i');
        if (re.test(raw)) return true;
      } catch {
        // regex 문법 오류면 무시(앱 죽지 않게)
      }
    }
  }
  return false;
}

function applyExcludeToCategories(
  categories: SafetyEduCategory[],
  rules: ExcludeRule[],
): { categories: SafetyEduCategory[]; count: number } {
  const outCats = (categories ?? []).map((cat) => {
    const materials = (cat.materials ?? []).filter((m) => !isExcluded(m.title, rules));
    return { ...cat, materials };
  });

  const count = outCats.reduce((acc, c) => acc + (c.materials?.length ?? 0), 0);
  return { categories: outCats, count };
}

export default function MakeSafetyEduMaterials({
  onSelectMaterial,
  selectedMaterialId,
  renderSelectedMaterialPane,
}: MakeSafetyEduMaterialsProps) {
  const titleText = 'REG AI가 필요한 교육자료를 찾아드릴게요.';
  const subtitleText = '어떤 교육 주제를 선택할까요?';

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<SafetyEduCategory[]>([]);
  const [guides, setGuides] = useState<Record<string, SafetyEduGuide>>({});
  const [totalCount, setTotalCount] = useState<number>(0);

  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedId = selectedMaterialId ?? internalSelectedId;

  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const nq = useMemo(() => normalize(query), [query]);

  const PAGE_SIZE = 60;
  const [visibleCountByCat, setVisibleCountByCat] = useState<Record<string, number>>({});

  // ✅ fallback guide (최소 안전장치)
  const FALLBACK_GUIDE_KEY = 'misc';
  const fallbackGuide: SafetyEduGuide = useMemo(
    () =>
      guides[FALLBACK_GUIDE_KEY] ?? {
        intro: '가이드가 아직 등록되지 않은 자료입니다.',
        bulletPoints: [],
        downloadLabel: '자료 다운로드',
      },
    [guides],
  );

  // ✅ guide 해상도 함수: 언제나 SafetyEduGuide 반환
  const getGuide = (m: SafetyEduMaterial): SafetyEduGuide => {
    return guides[m.guideKey] ?? fallbackGuide;
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const data = await loadSafetyEduData({
          catalogUrl: '/edu/safety/catalog.yml',
          itemsUrl: '/edu/safety/items.json',
        });

        if (!alive) return;

        // ✅ catalog.yml의 exclude 룰을 사용 (SafetyEduCatalog.ts가 exclude를 리턴해야 함)
        const excludeRules: ExcludeRule[] = (data as any).exclude ?? [];
        const filtered = applyExcludeToCategories(data.categories, excludeRules);

        setCategories(filtered.categories);
        setGuides(data.guides);
        setTotalCount(filtered.count);

        const firstCat = filtered.categories[0]?.id ?? null;
        setOpenCategoryId(firstCat);

        const init: Record<string, number> = {};
        for (const c of filtered.categories) init[c.id] = PAGE_SIZE;
        setVisibleCountByCat(init);
      } catch (e: any) {
        if (!alive) return;
        setErrorMsg(e?.message ?? '데이터 로드 중 오류가 발생했습니다.');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ✅ 검색 결과는 guide를 미리 넣지 말고, 렌더에서 getGuide로 통일
  const searchResults = useMemo(() => {
    if (!nq) return [];
    const out: Array<{ cat: SafetyEduCategory; m: SafetyEduMaterial }> = [];
    for (const cat of categories) {
      for (const m of cat.materials) {
        if (!normalize(m.title).includes(nq)) continue;
        out.push({ cat, m });
        if (out.length >= 100) return out;
      }
    }
    return out;
  }, [categories, nq]);

  const DefaultPane = (cat: SafetyEduCategory, m: SafetyEduMaterial, guide: SafetyEduGuide) => {
    const bullets = Array.isArray(guide.bulletPoints) ? guide.bulletPoints : [];
    const label = guide.downloadLabel ?? '자료 다운로드';

    return (
      <div className={s.eduPane}>
        {/* <div className={s.eduPaneHead}>
          <div className={s.eduPaneTitle}>{m.title}</div>
          <div className={s.eduMetaRow}>
            <span className={s.eduBadge}>{cat.title}</span>
            {m.source ? <span className={s.eduMeta}>{m.source}</span> : null}
            {m.publishedAt ? <span className={s.eduMeta}>{m.publishedAt}</span> : null}
          </div>
        </div>

        <div className={s.eduIntro}>{guide.intro}</div> */}

        {/* <ul className={s.eduBullets}>
          {bullets.map((b: any, idx: any) => (
            <li key={idx}>{b}</li>
          ))}
        </ul> */}

        <div className={s.eduActions}>
          <a
            className={s.eduDownloadBtn}
            href={m.downloadUrl || '#'}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!m.downloadUrl}
            onClick={(e) => {
              if (!m.downloadUrl) e.preventDefault();
            }}
          >
            <Download size={16} />
            <span>{label}</span>
          </a>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={s.docWrap}>
        <h2 className={s.docTitle}>{titleText}</h2>
        <p className={s.docSubtitle}>{subtitleText}</p>
        <div className={s.eduLoading}>교육자료 목록을 불러오는 중…</div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className={s.docWrap}>
        <h2 className={s.docTitle}>{titleText}</h2>
        <p className={s.docSubtitle}>{subtitleText}</p>
        <div className={s.eduError}>
          <div>데이터 로드 실패</div>
          <div className={s.eduErrorMsg}>{errorMsg}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.docWrap}>
      <h2 className={s.docTitle}>{titleText}</h2>
      <p className={s.docSubtitle}>
        {subtitleText} <span className={s.eduCount}>(총 {totalCount.toLocaleString()}개)</span>
      </p>

      <div className={s.eduSearchBar}>
        <Search size={16} className={s.eduSearchIcon} />
        <input
          className={s.eduSearchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: MSDS, 밀폐공간, 크레인, 지게차…"
        />
        {query ? (
          <button className={s.eduSearchClear} onClick={() => setQuery('')} type="button">
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* ✅ 검색 모드 */}
      {nq ? (
        <div className={s.eduSearchResults}>
          {searchResults.length === 0 ? (
            <div className={s.docEmpty}>검색 결과가 없습니다.</div>
          ) : (
            searchResults.map(({ cat, m }) => {
              const isSelected = selectedId === m.id;
              const g = getGuide(m);

              return (
                <div key={m.id} className={s.docRow}>
                  <button
                    type="button"
                    className={`${s.docChip} ${isSelected ? s.docChipActive : ''}`}
                    onClick={() => {
                      setOpenCategoryId(cat.id);
                      setInternalSelectedId(m.id);
                      onSelectMaterial?.({ category: cat, material: m, guide: g });
                    }}
                  >
                    <FileText className={s.docChipIcon} />
                    <span className={s.docChipLabel}>{m.title}</span>
                    <span className={s.eduChipMeta}>{cat.title}</span>
                  </button>

                  {isSelected && (
                    <div className={s.docDropdownPane}>
                      {(renderSelectedMaterialPane ?? DefaultPane)(cat, m, g)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ✅ 브라우징 모드 */
        <div className={s.docCategoryList}>
          {categories.map((cat) => {
            const isOpen = cat.id === openCategoryId;
            const visibleCount = visibleCountByCat[cat.id] ?? PAGE_SIZE;
            const shown = cat.materials.slice(0, visibleCount);

            return (
              <div
                key={cat.id}
                className={`${s.docCategoryCard} ${isOpen ? s.docCategoryCardOpen : ''}`}
              >
                <button
                  type="button"
                  className={s.docCategoryHeader}
                  onClick={() => setOpenCategoryId(isOpen ? null : cat.id)}
                >
                  <div className={s.docCategoryText}>
                    <span className={s.docCategoryTitle}>
                      {cat.title}
                      <span className={s.eduCatCount}> ({cat.materials.length.toLocaleString()})</span>
                    </span>
                    <span className={s.docCategoryDesc}>{cat.description}</span>
                  </div>
                  <ChevronDown
                    className={`${s.docCategoryArrow} ${isOpen ? s.docCategoryArrowOpen : ''}`}
                  />
                </button>

                {isOpen && (
                  <div className={s.docList}>
                    {shown.length > 0 ? (
                      <>
                        {shown.map((m: any) => {
                          const isSelected = selectedId === m.id;
                          const g = getGuide(m);

                          return (
                            <div key={m.id} className={s.docRow}>
                              <button
                                type="button"
                                className={`${s.docChip} ${isSelected ? s.docChipActive : ''}`}
                                onClick={() => {
                                  setInternalSelectedId(m.id);
                                  onSelectMaterial?.({ category: cat, material: m, guide: g });
                                }}
                              >
                                <FileText className={s.docChipIcon} />
                                <span className={s.docChipLabel}>{m.title}</span>
                              </button>

                              {isSelected && (
                                <div className={s.docDropdownPane}>
                                  {(renderSelectedMaterialPane ?? DefaultPane)(cat, m, g)}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {cat.materials.length > visibleCount && (
                          <button
                            type="button"
                            className={s.eduMoreBtn}
                            onClick={() =>
                              setVisibleCountByCat((prev) => ({
                                ...prev,
                                [cat.id]: (prev[cat.id] ?? PAGE_SIZE) + PAGE_SIZE,
                              }))
                            }
                          >
                            더 보기 (+{PAGE_SIZE})
                          </button>
                        )}
                      </>
                    ) : (
                      <div className={s.docEmpty}>이 카테고리에 해당하는 자료가 없습니다.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
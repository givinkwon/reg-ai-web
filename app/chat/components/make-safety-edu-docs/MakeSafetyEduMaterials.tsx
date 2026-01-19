// components/safety-edu/MakeSafetyEduMaterials.tsx
'use client';

import { ChevronDown, FileText, Download, Search, X } from 'lucide-react';
import s from './MakeSafetyEduMaterials.module.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  loadSafetyEduData,
  type SafetyEduCategory,
  type SafetyEduMaterial,
  type SafetyEduGuide,
} from '../SafetyEduCatalog'; // ✅ 경로는 네 프로젝트에 맞게

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'SafetyEdu' } as const;

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
        // regex 문법 오류면 무시
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

  // ✅ search 타이핑 GA 과다 방지
  const searchStartLoggedRef = useRef(false);
  const searchDebounceRef = useRef<number | null>(null);

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

        // ✅ GA: 화면 진입/로딩 시작
        track(gaEvent(GA_CTX, 'LoadStart'), {
          ui_id: gaUiId(GA_CTX, 'LoadStart'),
        });

        const data = await loadSafetyEduData({
          catalogUrl: '/edu/safety/catalog.yml',
          itemsUrl: '/edu/safety/items.json',
        });

        if (!alive) return;

        // ✅ catalog.yml의 exclude 룰
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

        // ✅ GA: 로딩 성공
        track(gaEvent(GA_CTX, 'LoadSuccess'), {
          ui_id: gaUiId(GA_CTX, 'LoadSuccess'),
          category_count: filtered.categories.length,
          total_count: filtered.count,
        });
      } catch (e: any) {
        if (!alive) return;
        const msg = e?.message ?? '데이터 로드 중 오류가 발생했습니다.';
        setErrorMsg(msg);

        // ✅ GA: 로딩 실패
        track(gaEvent(GA_CTX, 'LoadError'), {
          ui_id: gaUiId(GA_CTX, 'LoadError'),
          message: String(msg).slice(0, 120),
        });
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ✅ 검색 결과 (최대 100개)
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

  // ✅ GA: 검색 결과 노출(디바운스)
  useEffect(() => {
    if (!nq) {
      searchStartLoggedRef.current = false;
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
      return;
    }

    if (!searchStartLoggedRef.current) {
      searchStartLoggedRef.current = true;
      track(gaEvent(GA_CTX, 'SearchStart'), {
        ui_id: gaUiId(GA_CTX, 'SearchStart'),
      });
    }

    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      track(gaEvent(GA_CTX, 'SearchResults'), {
        ui_id: gaUiId(GA_CTX, 'SearchResults'),
        query_len: query.trim().length,
        result_count: searchResults.length,
      });
    }, 250);

    return () => {
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nq, searchResults.length]);

  const DefaultPane = (cat: SafetyEduCategory, m: SafetyEduMaterial, guide: SafetyEduGuide) => {
    const label = guide.downloadLabel ?? '자료 다운로드';

    return (
      <div className={s.eduPane}>
        <div className={s.eduActions}>
          <a
            className={s.eduDownloadBtn}
            href={m.downloadUrl || '#'}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!m.downloadUrl}
            onClick={(e) => {
              if (!m.downloadUrl) {
                e.preventDefault();
                track(gaEvent(GA_CTX, 'DownloadBlocked'), {
                  ui_id: gaUiId(GA_CTX, 'DownloadBlocked'),
                  material_id: m.id,
                  category_id: cat.id,
                });
                return;
              }

              track(gaEvent(GA_CTX, 'DownloadClick'), {
                ui_id: gaUiId(GA_CTX, 'DownloadClick'),
                material_id: m.id,
                category_id: cat.id,
                guide_key: m.guideKey,
                url_type: m.downloadUrl?.endsWith('.pdf')
                  ? 'pdf'
                  : m.downloadUrl?.endsWith('.ppt') || m.downloadUrl?.endsWith('.pptx')
                    ? 'ppt'
                    : 'other',
              });
            }}
            data-ga-event={gaEvent(GA_CTX, 'DownloadClick')}
            data-ga-id={gaUiId(GA_CTX, 'DownloadClick')}
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
      <div className={s.wrap}>
        <h2 className={s.title}>{titleText}</h2>
        <p className={s.subtitle}>{subtitleText}</p>
        <div
          className={s.eduLoading}
          data-ga-event={gaEvent(GA_CTX, 'Loading')}
          data-ga-id={gaUiId(GA_CTX, 'Loading')}
        >
          교육자료 목록을 불러오는 중…
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className={s.wrap}>
        <h2 className={s.title}>{titleText}</h2>
        <p className={s.subtitle}>{subtitleText}</p>
        <div className={s.eduError}>
          <div>데이터 로드 실패</div>
          <div className={s.eduErrorMsg}>{errorMsg}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <h2 className={s.title}>{titleText}</h2>
      <p className={s.subtitle}>
        {subtitleText}{' '}
        <span className={s.eduCount}>(총 {totalCount.toLocaleString()}개)</span>
      </p>

      <div className={s.eduSearchBar}>
        <Search size={16} className={s.eduSearchIcon} />
        <input
          className={s.eduSearchInput}
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);

            // ✅ GA: 타이핑 과다 방지 — 첫 글자 진입만
            if (v.trim().length === 1) {
              track(gaEvent(GA_CTX, 'SearchTypingStart'), {
                ui_id: gaUiId(GA_CTX, 'SearchTypingStart'),
              });
            }
          }}
          onFocus={() => {
            track(gaEvent(GA_CTX, 'SearchFocus'), {
              ui_id: gaUiId(GA_CTX, 'SearchFocus'),
            });
          }}
          placeholder="예: MSDS, 밀폐공간, 크레인, 지게차…"
          data-ga-event={gaEvent(GA_CTX, 'SearchInput')}
          data-ga-id={gaUiId(GA_CTX, 'SearchInput')}
        />
        {query ? (
          <button
            className={s.eduSearchClear}
            onClick={() => {
              setQuery('');
              track(gaEvent(GA_CTX, 'SearchClear'), {
                ui_id: gaUiId(GA_CTX, 'SearchClear'),
              });
            }}
            type="button"
            data-ga-event={gaEvent(GA_CTX, 'SearchClear')}
            data-ga-id={gaUiId(GA_CTX, 'SearchClear')}
            aria-label="검색어 지우기"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* ✅ 검색 모드 */}
      {nq ? (
        <div
          className={s.eduSearchResults}
          data-ga-event={gaEvent(GA_CTX, 'SearchMode')}
          data-ga-id={gaUiId(GA_CTX, 'SearchMode')}
        >
          {searchResults.length === 0 ? (
            <div className={s.empty}>검색 결과가 없습니다.</div>
          ) : (
            searchResults.map(({ cat, m }) => {
              const isSelected = selectedId === m.id;
              const g = getGuide(m);

              return (
                <div key={m.id} className={s.row}>
                  <button
                    type="button"
                    className={`${s.chip} ${isSelected ? s.chipActive : ''}`}
                    onClick={() => {
                      setOpenCategoryId(cat.id);
                      setInternalSelectedId(m.id);

                      track(gaEvent(GA_CTX, 'MaterialSelectFromSearch'), {
                        ui_id: gaUiId(GA_CTX, 'MaterialSelectFromSearch'),
                        material_id: m.id,
                        category_id: cat.id,
                        query_len: query.trim().length,
                      });

                      onSelectMaterial?.({ category: cat, material: m, guide: g });
                    }}
                    data-ga-event={gaEvent(GA_CTX, 'MaterialSelectFromSearch')}
                    data-ga-id={gaUiId(GA_CTX, 'MaterialSelectFromSearch')}
                  >
                    <FileText className={s.chipIcon} />
                    <span className={s.chipLabel}>{m.title}</span>
                    <span className={s.eduChipMeta}>{cat.title}</span>
                  </button>

                  {isSelected && (
                    <div className={s.dropdownPane}>
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
        <div className={s.categoryList}>
          {categories.map((cat) => {
            const isOpen = cat.id === openCategoryId;
            const visibleCount = visibleCountByCat[cat.id] ?? PAGE_SIZE;
            const shown = cat.materials.slice(0, visibleCount);

            return (
              <div key={cat.id} className={`${s.card} ${isOpen ? s.cardOpen : ''}`}>
                <button
                  type="button"
                  className={s.cardHeader}
                  onClick={() => {
                    const nextOpen = isOpen ? null : cat.id;
                    setOpenCategoryId(nextOpen);

                    track(gaEvent(GA_CTX, 'CategoryToggle'), {
                      ui_id: gaUiId(GA_CTX, 'CategoryToggle'),
                      category_id: cat.id,
                      open: !!nextOpen,
                    });
                  }}
                  data-ga-event={gaEvent(GA_CTX, 'CategoryToggle')}
                  data-ga-id={gaUiId(GA_CTX, 'CategoryToggle')}
                >
                  <div className={s.cardText}>
                    <span className={s.cardTitle}>
                      {cat.title}
                      <span className={s.eduCatCount}> ({cat.materials.length.toLocaleString()})</span>
                    </span>
                    <span className={s.cardDesc}>{cat.description}</span>
                  </div>
                  <ChevronDown className={`${s.arrow} ${isOpen ? s.arrowOpen : ''}`} />
                </button>

                {isOpen && (
                  <div className={s.list}>
                    {shown.length > 0 ? (
                      <>
                        {shown.map((m) => {
                          const isSelected = selectedId === m.id;
                          const g = getGuide(m);

                          return (
                            <div key={m.id} className={s.row}>
                              <button
                                type="button"
                                className={`${s.chip} ${isSelected ? s.chipActive : ''}`}
                                onClick={() => {
                                  setInternalSelectedId(m.id);

                                  track(gaEvent(GA_CTX, 'MaterialSelect'), {
                                    ui_id: gaUiId(GA_CTX, 'MaterialSelect'),
                                    material_id: m.id,
                                    category_id: cat.id,
                                  });

                                  onSelectMaterial?.({ category: cat, material: m, guide: g });
                                }}
                                data-ga-event={gaEvent(GA_CTX, 'MaterialSelect')}
                                data-ga-id={gaUiId(GA_CTX, 'MaterialSelect')}
                              >
                                <FileText className={s.chipIcon} />
                                <span className={s.chipLabel}>{m.title}</span>
                              </button>

                              {isSelected && (
                                <div className={s.dropdownPane}>
                                  {(renderSelectedMaterialPane ?? DefaultPane)(cat, m, g)}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {cat.materials.length > visibleCount && (
                          <button
                            type="button"
                            className={s.moreBtn}
                            onClick={() => {
                              setVisibleCountByCat((prev) => ({
                                ...prev,
                                [cat.id]: (prev[cat.id] ?? PAGE_SIZE) + PAGE_SIZE,
                              }));

                              track(gaEvent(GA_CTX, 'LoadMore'), {
                                ui_id: gaUiId(GA_CTX, 'LoadMore'),
                                category_id: cat.id,
                                from: visibleCount,
                                to: Math.min(visibleCount + PAGE_SIZE, cat.materials.length),
                                total_in_cat: cat.materials.length,
                              });
                            }}
                            data-ga-event={gaEvent(GA_CTX, 'LoadMore')}
                            data-ga-id={gaUiId(GA_CTX, 'LoadMore')}
                          >
                            더 보기 (+{PAGE_SIZE})
                          </button>
                        )}
                      </>
                    ) : (
                      <div className={s.empty}>이 카테고리에 해당하는 자료가 없습니다.</div>
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

// app/chat/components/SignupExtraInfoModal.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './SignupExtraInfoModal.module.css';
import { useUserStore } from '@/app/store/user';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = {
  page: 'Chat',
  section: 'Auth',
  component: 'SignupExtraInfoModal',
} as const;

type Props = {
  email: string;
  onComplete: () => void;
};

type SubcategoryItem = {
  id: string;
  name: string;
  parent_name?: string;
};

export default function SignupExtraInfoModal({ email, onComplete }: Props) {
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [position, setPosition] = useState('');
  const [website, setWebsite] = useState('');
  const [representativeName, setRepresentativeName] = useState('');

  // ✅ 소분류 자동완성
  const [subcategoryInput, setSubcategoryInput] = useState('');
  const [subcategorySelected, setSubcategorySelected] = useState<SubcategoryItem | null>(null);
  const [subcategoryList, setSubcategoryList] = useState<SubcategoryItem[]>([]);
  const [subcategoryOpen, setSubcategoryOpen] = useState(false);
  const [subcategoryLoading, setSubcategoryLoading] = useState(false);
  const [subcategoryTouched, setSubcategoryTouched] = useState(false);

  const [loading, setLoading] = useState(false);

  const user = useUserStore((st) => st.user);
  const setUser = useUserStore((st) => st.setUser);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const canSearch = useMemo(() => subcategoryInput.trim().length >= 1, [subcategoryInput]);

  // ✅ “선택 강제” 유효성
  const isSubcategoryValid = useMemo(() => !!subcategorySelected, [subcategorySelected]);
  const showSubcategoryError = subcategoryTouched && !isSubcategoryValid;

  // ✅ open/close 추적(너무 과도하면 제거 가능)
  const prevOpenRef = useRef<boolean>(false);
  useEffect(() => {
    if (prevOpenRef.current === subcategoryOpen) return;
    prevOpenRef.current = subcategoryOpen;

    track(gaEvent(GA_CTX, subcategoryOpen ? 'SubcategoryOpen' : 'SubcategoryClose'), {
      ui_id: gaUiId(GA_CTX, subcategoryOpen ? 'SubcategoryOpen' : 'SubcategoryClose'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategoryOpen]);

  // ✅ 입력값 변경 시 DB 검색 (debounce + abort)
  useEffect(() => {
    if (!subcategoryOpen) return;

    const q = subcategoryInput.trim();
    if (!canSearch) {
      setSubcategoryList([]);
      setSubcategoryLoading(false);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const t0 = performance.now();

      try {
        setSubcategoryLoading(true);

        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        track(gaEvent(GA_CTX, 'SubcategorySearchStart'), {
          ui_id: gaUiId(GA_CTX, 'SubcategorySearchStart'),
          q_len: q.length,
        });

        const res = await fetch(
          `/api/risk-assessment?endpoint=minors&q=${encodeURIComponent(q)}`,
          { method: 'GET', signal: ac.signal },
        );

        if (!res.ok) {
          track(gaEvent(GA_CTX, 'SubcategorySearchFail'), {
            ui_id: gaUiId(GA_CTX, 'SubcategorySearchFail'),
            status: res.status,
            q_len: q.length,
          });
          setSubcategoryList([]);
          return;
        }

        const data = (await res.json()) as { items: string[] };
        const items = (data.items ?? []).slice(0, 50);

        setSubcategoryList(items.map((name) => ({ id: name, name })));

        track(gaEvent(GA_CTX, 'SubcategorySearchSuccess'), {
          ui_id: gaUiId(GA_CTX, 'SubcategorySearchSuccess'),
          count: items.length,
          q_len: q.length,
          ms: Math.round(performance.now() - t0),
        });
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          track(gaEvent(GA_CTX, 'SubcategorySearchAbort'), {
            ui_id: gaUiId(GA_CTX, 'SubcategorySearchAbort'),
            q_len: q.length,
          });
          return;
        }

        track(gaEvent(GA_CTX, 'SubcategorySearchError'), {
          ui_id: gaUiId(GA_CTX, 'SubcategorySearchError'),
          q_len: q.length,
        });
        console.error(e);
      } finally {
        setSubcategoryLoading(false);
      }
    }, 180);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [subcategoryInput, subcategoryOpen, canSearch]);

  const selectSubcategory = (it: SubcategoryItem) => {
    track(gaEvent(GA_CTX, 'SelectSubcategory'), {
      ui_id: gaUiId(GA_CTX, 'SelectSubcategory'),
      subcategory_id: it.id,
      subcategory_name: it.name,
    });

    setSubcategorySelected(it);
    setSubcategoryInput(it.name);
    setSubcategoryOpen(false);
    setSubcategoryTouched(true);
  };

  const clearSubcategory = () => {
    track(gaEvent(GA_CTX, 'ClearSubcategory'), {
      ui_id: gaUiId(GA_CTX, 'ClearSubcategory'),
      had_selected: !!subcategorySelected,
    });

    setSubcategorySelected(null);
    setSubcategoryInput('');
    setSubcategoryList([]);
    setSubcategoryOpen(false);
    setSubcategoryTouched(false);
  };

  const formValid =
    company.trim().length > 0 &&
    employeeCount.trim().length > 0 &&
    position.trim().length > 0 &&
    representativeName.trim().length > 0 &&
    isSubcategoryValid;

  // ✅ 최초 노출 트래킹
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;

    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      email_domain: email.split('@')[1] ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubcategoryTouched(true);

    if (!subcategorySelected) {
      track(gaEvent(GA_CTX, 'SubmitBlocked'), {
        ui_id: gaUiId(GA_CTX, 'SubmitBlocked'),
        reason: 'subcategory_required',
      });
      return;
    }

    if (!formValid) {
      track(gaEvent(GA_CTX, 'SubmitBlocked'), {
        ui_id: gaUiId(GA_CTX, 'SubmitBlocked'),
        reason: 'form_invalid',
      });
      return;
    }

    const t0 = performance.now();

    try {
      setLoading(true);

      track(gaEvent(GA_CTX, 'SubmitStart'), {
        ui_id: gaUiId(GA_CTX, 'SubmitStart'),
        has_phone: !!phone.trim(),
        has_website: !!website.trim(),
      });

      // 1) secondary info 저장 + mark_complete
      const res = await fetch('/api/accounts/update-secondary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          secondary_info: {
            phone,
            company,
            employee_count: employeeCount,
            position,
            website,
            representative_name: representativeName,
            subcategory: {
              id: subcategorySelected.id,
              name: subcategorySelected.name,
              parent_name: subcategorySelected.parent_name ?? null,
            },
          },
          mark_complete: true,
        }),
      });

      if (!res.ok) {
        track(gaEvent(GA_CTX, 'SubmitFail'), {
          ui_id: gaUiId(GA_CTX, 'SubmitFail'),
          step: 'update-secondary',
          status: res.status,
          ms: Math.round(performance.now() - t0),
        });

        console.error('update-secondary error', res.status);
        alert('정보 저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
        return;
      }

      track(gaEvent(GA_CTX, 'SubmitSecondarySaved'), {
        ui_id: gaUiId(GA_CTX, 'SubmitSecondarySaved'),
        ms: Math.round(performance.now() - t0),
      });

      // 2) 서버에서 계정 다시 읽어서 store 갱신 (✅ user가 이미 있어도 갱신해야 함)
      try {
        const res2 = await fetch('/api/accounts/find-by-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (res2.ok) {
          const acc = await res2.json();
          const provider = acc.google_id ? 'google' : acc.kakao_id ? 'kakao' : 'local';

          // ✅ 기존 uid 유지가 더 안전(특히 firebase uid 형식 google:xxx)
          const nextUid =
            user?.uid ??
            (acc.google_id
              ? `google:${acc.google_id}`
              : acc.kakao_id
              ? `kakao:${acc.kakao_id}`
              : acc.account_id);

          setUser({
            uid: nextUid,
            email: acc.email ?? email ?? null,
            name: acc.name ?? null,
            photoUrl: acc.picture ?? null,
            provider,
            isSignupComplete: true, // ✅ 완료로 확정
          } as const);

          track(gaEvent(GA_CTX, 'RefreshUserSuccess'), {
            ui_id: gaUiId(GA_CTX, 'RefreshUserSuccess'),
            provider,
          });
        } else {
          // fallback: 최소한 현재 user를 완료로 마킹
          if (user) {
            setUser({ ...user, isSignupComplete: true });
          }

          track(gaEvent(GA_CTX, 'RefreshUserFail'), {
            ui_id: gaUiId(GA_CTX, 'RefreshUserFail'),
            status: res2.status,
          });
        }
      } catch (e) {
        console.error('[SignupExtraInfoModal] refresh user error:', e);
        if (user) setUser({ ...user, isSignupComplete: true });

        track(gaEvent(GA_CTX, 'RefreshUserError'), {
          ui_id: gaUiId(GA_CTX, 'RefreshUserError'),
        });
      }

      track(gaEvent(GA_CTX, 'SubmitSuccess'), {
        ui_id: gaUiId(GA_CTX, 'SubmitSuccess'),
        ms: Math.round(performance.now() - t0),
      });

      onComplete();
    } catch (err) {
      console.error(err);

      track(gaEvent(GA_CTX, 'SubmitError'), {
        ui_id: gaUiId(GA_CTX, 'SubmitError'),
        ms: Math.round(performance.now() - t0),
      });

      alert('정보 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      data-ga-id={gaUiId(GA_CTX, 'Overlay')}
      data-ga-event={gaEvent(GA_CTX, 'Overlay')}
    >
      <div className={styles.card}>
        <h3 className={styles.title}>회원 정보 입력</h3>
        <p className={styles.subtitle}>거의 다 왔어요!</p>

        <form
          onSubmit={handleSubmit}
          className={styles.form}
          data-ga-id={gaUiId(GA_CTX, 'Form')}
          data-ga-event={gaEvent(GA_CTX, 'Form')}
        >
          <label className={styles.field}>
            <span>연락처</span>
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
              }}
              onBlur={() => {
                track(gaEvent(GA_CTX, 'BlurPhone'), {
                  ui_id: gaUiId(GA_CTX, 'BlurPhone'),
                  len: phone.trim().length,
                });
              }}
              placeholder="전화번호"
            />
          </label>

          <label className={styles.field}>
            <span>회사명 *</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              onBlur={() => {
                track(gaEvent(GA_CTX, 'BlurCompany'), {
                  ui_id: gaUiId(GA_CTX, 'BlurCompany'),
                  len: company.trim().length,
                });
              }}
              placeholder="회사명"
              required
            />
          </label>

          <label className={styles.field}>
            <span>상시 근로자 수 *</span>
            <input
              value={employeeCount}
              onChange={(e) => setEmployeeCount(e.target.value)}
              onBlur={() => {
                track(gaEvent(GA_CTX, 'BlurEmployeeCount'), {
                  ui_id: gaUiId(GA_CTX, 'BlurEmployeeCount'),
                  len: employeeCount.trim().length,
                });
              }}
              placeholder="상시 근로자 수"
              required
            />
          </label>

          <label className={styles.field}>
            <span>직책 *</span>
            <input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              onBlur={() => {
                track(gaEvent(GA_CTX, 'BlurPosition'), {
                  ui_id: gaUiId(GA_CTX, 'BlurPosition'),
                  len: position.trim().length,
                });
              }}
              placeholder="직책"
              required
            />
          </label>

          <label className={styles.field}>
            <span>대표자명 *</span>
            <input
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
              onBlur={() => {
                track(gaEvent(GA_CTX, 'BlurRepresentativeName'), {
                  ui_id: gaUiId(GA_CTX, 'BlurRepresentativeName'),
                  len: representativeName.trim().length,
                });
              }}
              placeholder="대표자명"
              required
            />
          </label>

          {/* ✅ 소분류(선택 강제) */}
          <label className={styles.field}>
            <span>소분류 *</span>

            <div className={styles.autoWrap}>
              <div className={styles.autoInputRow}>
                <input
                  value={subcategoryInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSubcategoryInput(v);
                    setSubcategorySelected(null);
                    setSubcategoryOpen(true);

                    track(gaEvent(GA_CTX, 'TypeSubcategory'), {
                      ui_id: gaUiId(GA_CTX, 'TypeSubcategory'),
                      q_len: v.trim().length,
                    });
                  }}
                  onFocus={() => {
                    setSubcategoryOpen(true);
                    track(gaEvent(GA_CTX, 'FocusSubcategory'), {
                      ui_id: gaUiId(GA_CTX, 'FocusSubcategory'),
                    });
                  }}
                  onBlur={() => {
                    setSubcategoryTouched(true);
                    window.setTimeout(() => setSubcategoryOpen(false), 120);

                    track(gaEvent(GA_CTX, 'BlurSubcategory'), {
                      ui_id: gaUiId(GA_CTX, 'BlurSubcategory'),
                      valid: !!subcategorySelected,
                    });
                  }}
                  placeholder="검색해서 선택하세요 (자율 입력 불가)"
                  aria-invalid={showSubcategoryError}
                  required
                />

                {subcategorySelected && (
                  <button
                    type="button"
                    className={styles.clearBtn}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearSubcategory}
                    title="선택 해제"
                    data-ga-id={gaUiId(GA_CTX, 'ClearSubcategory')}
                    data-ga-event={gaEvent(GA_CTX, 'ClearSubcategory')}
                  >
                    ✕
                  </button>
                )}
              </div>

              {showSubcategoryError && (
                <div className={styles.fieldError}>
                  소분류는 목록에서 선택해야 합니다.
                </div>
              )}

              {subcategoryOpen && (
                <div
                  className={styles.autoPanel}
                  data-ga-id={gaUiId(GA_CTX, 'SubcategoryPanel')}
                  data-ga-event={gaEvent(GA_CTX, 'SubcategoryPanel')}
                >
                  {subcategoryLoading && <div className={styles.autoHint}>검색 중…</div>}

                  {!subcategoryLoading && subcategoryList.length === 0 && canSearch && (
                    <div className={styles.autoHint}>검색 결과가 없습니다.</div>
                  )}

                  {!subcategoryLoading && !canSearch && (
                    <div className={styles.autoHint}>1글자 이상 입력하면 검색됩니다.</div>
                  )}

                  {!subcategoryLoading &&
                    subcategoryList.map((it) => (
                      <button
                        type="button"
                        key={it.id}
                        className={styles.autoItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSubcategory(it)}
                        data-ga-id={gaUiId(GA_CTX, 'SelectSubcategory')}
                        data-ga-event={gaEvent(GA_CTX, 'SelectSubcategory')}
                        data-ga-label={it.name}
                      >
                        <div className={styles.autoName}>{it.name}</div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </label>

          <label className={styles.field}>
            <span>회사 웹사이트</span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              onBlur={() => {
                track(gaEvent(GA_CTX, 'BlurWebsite'), {
                  ui_id: gaUiId(GA_CTX, 'BlurWebsite'),
                  len: website.trim().length,
                });
              }}
              placeholder="웹사이트 주소"
            />
          </label>

          <button
            type="submit"
            className={styles.submit}
            disabled={loading || !formValid}
            title={!formValid ? '필수 항목과 소분류 선택을 완료해 주세요.' : undefined}
            data-ga-id={gaUiId(GA_CTX, 'Submit')}
            data-ga-event={gaEvent(GA_CTX, 'Submit')}
          >
            {loading ? '제출 중...' : '제출하기'}
          </button>
        </form>
      </div>
    </div>
  );
}

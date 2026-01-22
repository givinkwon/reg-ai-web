// app/chat/components/SignupExtraInfoModal.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './SignupExtraInfoModal.module.css';
import { useUserStore } from '@/app/store/user';

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
  const [subcategorySelected, setSubcategorySelected] =
    useState<SubcategoryItem | null>(null);
  const [subcategoryList, setSubcategoryList] = useState<SubcategoryItem[]>([]);
  const [subcategoryOpen, setSubcategoryOpen] = useState(false);
  const [subcategoryLoading, setSubcategoryLoading] = useState(false);
  const [subcategoryTouched, setSubcategoryTouched] = useState(false);

  const [loading, setLoading] = useState(false);

  const user = useUserStore((st) => st.user);
  const setUser = useUserStore((st) => st.setUser);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const canSearch = useMemo(
    () => subcategoryInput.trim().length >= 1,
    [subcategoryInput],
  );

  // ✅ “선택 강제” 유효성
  const isSubcategoryValid = useMemo(() => {
    return !!subcategorySelected;
  }, [subcategorySelected]);

  const showSubcategoryError = subcategoryTouched && !isSubcategoryValid;

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
      try {
        setSubcategoryLoading(true);

        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const res = await fetch(
          `/api/risk-assessment?endpoint=minors&q=${encodeURIComponent(q)}`,
          { method: 'GET', signal: ac.signal },
        );

        if (!res.ok) {
          console.error('subcategory search error', res.status);
          setSubcategoryList([]);
          return;
        }

        const data = (await res.json()) as { items: string[] };

        const items = (data.items ?? []).slice(0, 50);
        setSubcategoryList(
          items.map((name) => ({
            id: name,
            name,
          })),
        );
      } catch (e: any) {
        if (e?.name !== 'AbortError') console.error(e);
      } finally {
        setSubcategoryLoading(false);
      }
    }, 180);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [subcategoryInput, subcategoryOpen, canSearch]);

  const selectSubcategory = (it: SubcategoryItem) => {
    setSubcategorySelected(it);
    setSubcategoryInput(it.name);
    setSubcategoryOpen(false);
    setSubcategoryTouched(true);
  };

  const clearSubcategory = () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubcategoryTouched(true);

    if (!subcategorySelected) return;

    try {
      setLoading(true);

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
        console.error('update-secondary error', res.status);
        alert('정보 저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
        return;
      }

      // 2) 서버에서 계정 다시 읽어서 store 갱신 (✅ user가 이미 있어도 갱신해야 함)
      try {
        const res2 = await fetch('/api/accounts/find-by-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (res2.ok) {
          const acc = await res2.json();
          const provider = acc.google_id
            ? 'google'
            : acc.kakao_id
            ? 'kakao'
            : 'local';

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
        } else {
          // fallback: 최소한 현재 user를 완료로 마킹
          if (user) {
            setUser({
              ...user,
              isSignupComplete: true,
            });
          }
        }
      } catch (e) {
        console.error('[SignupExtraInfoModal] refresh user error:', e);
        // fallback: 최소한 현재 user를 완료로 마킹
        if (user) {
          setUser({
            ...user,
            isSignupComplete: true,
          });
        }
      }

      onComplete();
    } catch (err) {
      console.error(err);
      alert('정보 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h3 className={styles.title}>회원 정보 입력</h3>
        <p className={styles.subtitle}>거의 다 왔어요!</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span>연락처</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="전화번호"
            />
          </label>

          <label className={styles.field}>
            <span>회사명 *</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="회사명"
              required
            />
          </label>

          <label className={styles.field}>
            <span>상시 근로자 수 *</span>
            <input
              value={employeeCount}
              onChange={(e) => setEmployeeCount(e.target.value)}
              placeholder="상시 근로자 수"
              required
            />
          </label>

          <label className={styles.field}>
            <span>직책 *</span>
            <input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="직책"
              required
            />
          </label>

          <label className={styles.field}>
            <span>대표자명 *</span>
            <input
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
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
                    setSubcategoryInput(e.target.value);
                    setSubcategorySelected(null);
                    setSubcategoryOpen(true);
                  }}
                  onFocus={() => setSubcategoryOpen(true)}
                  onBlur={() => {
                    setSubcategoryTouched(true);
                    window.setTimeout(() => setSubcategoryOpen(false), 120);
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
                <div className={styles.autoPanel}>
                  {subcategoryLoading && (
                    <div className={styles.autoHint}>검색 중…</div>
                  )}

                  {!subcategoryLoading &&
                    subcategoryList.length === 0 &&
                    canSearch && (
                      <div className={styles.autoHint}>
                        검색 결과가 없습니다.
                      </div>
                    )}

                  {!subcategoryLoading && !canSearch && (
                    <div className={styles.autoHint}>
                      1글자 이상 입력하면 검색됩니다.
                    </div>
                  )}

                  {!subcategoryLoading &&
                    subcategoryList.map((it) => (
                      <button
                        type="button"
                        key={it.id}
                        className={styles.autoItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSubcategory(it)}
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
              placeholder="웹사이트 주소"
            />
          </label>

          <button
            type="submit"
            className={styles.submit}
            disabled={loading || !formValid}
            title={!formValid ? '필수 항목과 소분류 선택을 완료해 주세요.' : undefined}
          >
            {loading ? '제출 중...' : '제출하기'}
          </button>
        </form>
      </div>
    </div>
  );
}

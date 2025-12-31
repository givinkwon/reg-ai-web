import YAML from 'yaml';

export type SafetyEduMaterial = {
  id: string;
  title: string;
  categoryId: string; // ✅ 카테고리 식별자
  guideKey: string; // ✅ 가이드 키
  downloadUrl?: string; // ✅ blob는 undefined 처리
  source?: string;
  publishedAt?: string;
};

export type SafetyEduCategory = {
  id: string;
  title: string;
  description: string;
  materials: SafetyEduMaterial[];
};

export type SafetyEduGuide = {
  intro: string;
  bulletPoints: string[];
  downloadLabel?: string;
};

type Rule =
  | { type: 'exact'; value: string }
  | { type: 'regex'; value: string }
  | { type: 'contains'; value: string };

type CatalogV1 = {
  schema: 'safety_training_catalog_v1';
  match_policy?: 'first_match_wins';
  fallback?: { categoryId: string; guideKey?: string };
  categories: Array<{
    id: string;
    name: string;
    description?: string;
    guideKey?: string;

    // ✅ 추가: 카테고리별 배제 규칙
    exclude?: Rule[];

    // ✅ 포함 규칙
    materials: Rule[];
  }>;
  guides?: Record<string, SafetyEduGuide>;
};

type ItemJson = Array<{
  id: string;
  title: string;
  downloadUrl?: string;
  source?: string;
  publishedAt?: string;
}>;

/**
 * ✅ 최소 수정 포인트
 * - exact/contains 매칭에서 표기 차이 줄이기 위해
 *   normalize에 NFKC + 공백 제거만 유지
 */
function normalize(s: string) {
  return (s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function safeRegExp(pattern: string) {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

/**
 * ✅ blob: URL은 저장/재사용 불가 → 프론트에선 무효 처리
 */
function sanitizeDownloadUrl(raw?: string) {
  const u = (raw ?? '').trim();
  if (!u) return undefined;
  if (u.startsWith('blob:')) return undefined;
  if (u === '#' || u.toLowerCase().startsWith('javascript')) return undefined;
  return u;
}

type CompiledRule =
  | { type: 'regex'; re: RegExp | null; raw: string }
  | { type: 'exact'; val: string; raw: string }
  | { type: 'contains'; val: string; raw: string };

function compileRules(rules?: Rule[]): CompiledRule[] {
  const src = rules ?? [];
  return src.map((r) => {
    if (r.type === 'regex') return { type: 'regex' as const, re: safeRegExp(r.value), raw: r.value };
    if (r.type === 'exact') return { type: 'exact' as const, val: normalize(r.value), raw: r.value };
    return { type: 'contains' as const, val: normalize(r.value), raw: r.value };
  });
}

function testCompiledRule(t: string, nt: string, rule: CompiledRule) {
  if (rule.type === 'regex') {
    if (!rule.re) return false;
    // raw title + normalized title 둘 다 테스트(기존 유지)
    return rule.re.test(t) || rule.re.test(nt);
  }
  if (rule.type === 'exact') {
    return nt === rule.val;
  }
  // contains
  // - normalized 기준 포함
  // - raw 기준 포함도 유지(요청 코드 스타일 존중)
  return nt.includes(rule.val) || t.includes(rule.raw);
}

export async function loadSafetyEduData(params?: {
  catalogUrl?: string;
  itemsUrl?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}) {
  const isServer = typeof window === 'undefined';
  const fetchImpl = params?.fetchImpl ?? fetch;

  const catalogUrlRaw = params?.catalogUrl ?? '/edu/safety/catalog.yml';
  const itemsUrlRaw = params?.itemsUrl ?? '/edu/safety/items.json';

  const toAbsUrl = (u: string) => {
    if (!u.startsWith('/')) return u;
    if (!isServer) return u;
    if (!params?.baseUrl) {
      throw new Error(
        `서버에서 loadSafetyEduData 호출 중인데 baseUrl이 없습니다.\n` +
          `SSR에서 쓰려면 loadSafetyEduData({ baseUrl: "https://도메인" }) 로 호출하세요.`,
      );
    }
    return `${params.baseUrl}${u}`;
  };

  const catalogUrl = toAbsUrl(catalogUrlRaw);
  const itemsUrl = toAbsUrl(itemsUrlRaw);

  const [catalogRes, itemsRes] = await Promise.all([
    fetchImpl(catalogUrl, { cache: 'no-store' }),
    fetchImpl(itemsUrl, { cache: 'no-store' }),
  ]);

  if (!catalogRes.ok) throw new Error(`catalog.yml 로드 실패: ${catalogRes.status}`);
  if (!itemsRes.ok) throw new Error(`items.json 로드 실패: ${itemsRes.status}`);

  const catalogText = await catalogRes.text();
  const catalog = YAML.parse(catalogText) as CatalogV1;

  if (
    !catalog ||
    catalog.schema !== 'safety_training_catalog_v1' ||
    !Array.isArray(catalog.categories)
  ) {
    throw new Error('catalog.yml 스키마가 기대와 다릅니다. (schema: safety_training_catalog_v1 필요)');
  }

  const itemsText = await itemsRes.text();
  let items: ItemJson;
  try {
    items = JSON.parse(itemsText) as ItemJson;
  } catch (e: any) {
    throw new Error(`items.json 파싱 실패: ${e?.message ?? e}\n(파일이 잘렸거나 JSON 문법 오류 가능)`);
  }
  if (!Array.isArray(items)) throw new Error('items.json은 배열(JSON array)이어야 합니다.');

  const fallbackCategoryId = catalog.fallback?.categoryId ?? 'misc';
  const fallbackGuideKey = catalog.fallback?.guideKey ?? 'misc';

  // ✅ guides: YAML에 없으면 최소 fallback만 (UI 안죽게)
  const guides: Record<string, SafetyEduGuide> = {
    [fallbackGuideKey]: {
      intro: '가이드가 등록되지 않은 자료입니다.',
      bulletPoints: [],
      downloadLabel: '자료 다운로드',
    },
    ...(catalog.guides ?? {}),
  };

  // ✅ categories 초기화(원래 YAML 순서 유지)
  const categories: SafetyEduCategory[] = catalog.categories.map((c) => ({
    id: c.id,
    title: c.name,
    description: c.description ?? '',
    materials: [],
  }));

  // fallback category 없으면 추가
  if (!categories.some((c) => c.id === fallbackCategoryId)) {
    categories.push({
      id: fallbackCategoryId,
      title: '공통/기타',
      description: '공통/미분류',
      materials: [],
    });
  }

  const catMap = new Map(categories.map((c) => [c.id, c] as const));

  // ✅ 매칭 룰(포함 + 배제) 컴파일
  const compiledCats = catalog.categories.map((c) => {
    const includeCompiled = compileRules(c.materials ?? []);
    const excludeCompiled = compileRules(c.exclude ?? []);

    return {
      id: c.id,
      guideKey: c.guideKey ?? c.id,
      include: includeCompiled,
      exclude: excludeCompiled,
    };
  });

  /**
   * ✅ 핵심: 카테고리별 exclude를 "먼저" 검사
   * - exclude에 걸리면 해당 카테고리는 아예 스킵
   * - 그 다음 include(materials) 매칭
   * - first_match_wins 유지
   */
  function match(title: string) {
    const t = (title ?? '').trim();
    const nt = normalize(t);

    for (const c of compiledCats) {
      // 1) exclude 먼저
      if (c.exclude.length > 0) {
        let excluded = false;
        for (const rule of c.exclude) {
          if (testCompiledRule(t, nt, rule)) {
            excluded = true;
            break;
          }
        }
        if (excluded) continue; // ✅ 이 카테고리는 매칭 금지 → 다음 카테고리로
      }

      // 2) include rules
      for (const rule of c.include) {
        if (testCompiledRule(t, nt, rule)) {
          return { categoryId: c.id, guideKey: c.guideKey };
        }
      }
    }

    return { categoryId: fallbackCategoryId, guideKey: fallbackGuideKey };
  }

  // ✅ item -> category에 꽂기
  for (const it of items) {
    const title = (it.title ?? '').trim();
    const { categoryId, guideKey } = match(title);

    const m: SafetyEduMaterial = {
      id: it.id,
      title,
      categoryId,
      guideKey,
      downloadUrl: sanitizeDownloadUrl(it.downloadUrl),
      source: it.source,
      publishedAt: it.publishedAt,
    };

    (catMap.get(categoryId) ?? catMap.get(fallbackCategoryId)!).materials.push(m);
  }

  // ✅ 정렬
  for (const c of categories) {
    c.materials.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'));
  }

  return {
    categories,
    guides,
    materialCount: items.length, // 전체 아이템 수(배제로 카테고리 이동해도 아이템 수는 동일)
  };
}
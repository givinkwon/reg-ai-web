import Image from 'next/image';
import s from './ProductBanners.module.css';

type Feature = {
  id: string;
  title: string;
  headline: string;
  desc: string;
  bullets: string[];
  imageSrc?: string;
  imageAlt?: string;
};

const FEATURES: Feature[] = [
  {
    id: 'docs',
    title: 'AI 규제정보 해석',
    headline: '근거 없이 답하지 않는 “규제 특화” 답변',
    desc: '5600개 법령, 38,000개 행정규칙, 73,000개 유권 및 법령해석, 8,000개 사고사례, KOSHA 가이드 등 실무 규제 데이터를 학습해 답변합니다.',
    bullets: [
      '답변마다 근거를 즉시 확인(법령/행정규칙/유권해석/사고사례)',
      '근거 없는 추정형 답변을 막도록 설계',
      '매일 업데이트된 규제 데이터를 반영해 최신 기준 유지',
    ],
    imageSrc: '/landing/features/feature-1.png',
    imageAlt: '필수 안전문서 자동생성 예시',
  },
  {
    id: 'monitoring',
    title: '실시간 모니터링',
    headline: '뉴스·입법예고·사고사례를 한 번에',
    desc: '매일 업데이트되는 안전·환경 관련 이슈를 모아, 현장 운영에 바로 쓰기 쉬운 형태로 정리합니다.',
    bullets: [
      '안전/환경 뉴스, 입법예고, 사고사례 자동 수집·요약',
      'TBM, 위험성평가, 안전교육에 바로 활용 가능한 포맷',
      '중요 변화만 빠르게 파악하도록 핵심만 정리',
    ],
    imageSrc: '/landing/features/feature-2.png',
    imageAlt: '법령 모니터링 예시',
  },
  {
    id: 'riskedu',
    title: '문서 생성·검토 & 위험성평가',
    headline: '내 사업장 기준으로 “작성 + 준수 검토”까지',
    desc: '수시·분기·반기 등 필요한 안전 문서를 사업장 상황에 맞게 생성하고, 규제 준수 여부를 한 번에 점검합니다.',
    bullets: [
      '필수 안전서류를 사업장 맞춤으로 자동 생성',
      '작성한 문서의 규제 준수 여부 자동 검토',
      '공정 + 유해·위험요인 2개 선택만으로 위험성평가 생성',
      '근로자 교육자료(교육안/슬라이드/퀴즈)까지 자동 생성',
    ],
    imageSrc: '/landing/features/feature-3.png',
    imageAlt: '위험성평가 및 교육자료 자동화 예시',
  },
];

export default function ProductBanners() {
  return (
    <section id="features" className={s.wrap}>
      <div className={s.inner}>
        <div className={s.head}>
          <h2 className={s.h2}>현장 안전업무를 한 번에 해결!</h2>
          <p className={s.p}>
            안전관리자가 매일 겪는 반복 업무(근거 찾기, 서식 작성, 교육자료 정리)를
            RegAI가 빠르게 도와줍니다.
          </p>
        </div>

        <div className={s.list}>
          {FEATURES.map((f, idx) => (
            <div key={f.id} className={`${s.card} ${idx % 2 === 1 ? s.reverse : ''}`}>
              <div className={s.text}>
                <div className={s.kicker}>기능 0{idx + 1}</div>

                {/* ✅ 섹션 카테고리 (title) */}
                <div className={s.title}>{f.title}</div>

                {/* ✅ headline 렌더링 추가 */}
                <div className={s.headline}>{f.headline}</div>

                {/* ✅ 기존 desc */}
                <div className={s.desc}>{f.desc}</div>

                <ul className={s.bullets}>
                  {f.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>

              <div className={s.media}>
                {f.imageSrc ? (
                  <Image
                    src={f.imageSrc}
                    alt={f.imageAlt || f.title}
                    width={920}
                    height={560}
                    className={s.img}
                  />
                ) : (
                  <div className={s.placeholder}>
                    <div className={s.placeholderTitle}>이미지 영역</div>
                    <div className={s.placeholderSub}>
                      /public/landing/features/ 에 넣고 경로만 바꾸면 됩니다.
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

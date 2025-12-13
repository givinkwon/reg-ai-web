import Image from 'next/image';
import s from './ProductBanners.module.css';

type Feature = {
  id: string;
  title: string;
  desc: string;
  bullets: string[];
  imageSrc?: string;
  imageAlt?: string;
};

const FEATURES: Feature[] = [
  {
    id: 'docs',
    title: '필수 안전문서 자동생성',
    desc: '필요한 안전문서, 직접 찾지 않아도 됩니다. 현장 입력만으로 서식/체크리스트/작성 가이드를 한 번에.',
    bullets: [
      '법정 서식·KOSHA 가이드 기반 템플릿',
      'TBM, 작업허가서, 교육결과보고서 등 빠른 생성',
      '현장용 문장/표현으로 자동 정리',
    ],
    imageSrc: '/landing/features/feature-1.png',
    imageAlt: '필수 안전문서 자동생성 예시',
  },
  {
    id: 'monitoring',
    title: '법령 AI 전문 모니터링',
    desc: '법령/입법예고가 바뀌어도 매번 확인하지 않아도 됩니다. RegAI가 자동으로 핵심만 요약해 드립니다.',
    bullets: [
      '입법예고·고시 개정 핵심 요약',
      '현장 영향도(무엇을 바꿔야 하는지)까지 안내',
      '근거/링크 연결로 감사 대응 용이',
    ],
    imageSrc: '/landing/features/feature-2.png',
    imageAlt: '법령 모니터링 예시',
  },
  {
    id: 'riskedu',
    title: '위험성평가 자동화 + 교육자료 자동생성',
    desc: '위험성평가 결과를 현장 실행으로 연결합니다. 위험요인-대책-교육자료까지 한 흐름으로.',
    bullets: [
      '공정별 위험요인/대책 정리(체크리스트 형태)',
      '교육자료(PPT/교안) 구성 자동화',
      '도급/협력업체 교육에도 바로 적용',
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
          <h2 className={s.h2}>현장 안전업무를 “문서 → 실행”으로 바꾸는 기능</h2>
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
                <div className={s.title}>{f.title}</div>
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
                    <div className={s.placeholderSub}>/public/landing/features/ 에 넣고 경로만 바꾸면 됩니다.</div>
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

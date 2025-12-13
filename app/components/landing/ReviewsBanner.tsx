import Image from 'next/image';
import s from './ReviewsBanner.module.css';

type Review = {
  company: string;
  logoSrc?: string;
  person: string;
  role: string;
  quote: string;
};

const REVIEWS: Review[] = [
  {
    company: 'S-Manufacturing',
    logoSrc: '/landing/logos/logo-2.png',
    person: '김OO',
    role: '안전보건팀 / 팀장',
    quote:
      '현장 질문이 들어오면 예전엔 법 조항 찾고 서식 뒤져보느라 시간이 많이 걸렸는데, RegAI는 “체크리스트+근거”를 같이 줘서 바로 실행으로 연결됩니다.',
  },
  {
    company: 'D-Logistics',
    logoSrc: '/landing/logos/logo-4.png',
    person: '박OO',
    role: '물류센터 / 안전관리자',
    quote:
      '지게차, 통행관리, TBM 같은 반복 업무가 빨라졌어요. 특히 교육자료(PPT) 초안이 바로 나오니까 매달 교육 준비 시간이 크게 줄었습니다.',
  },
  {
    company: 'K-Plant',
    logoSrc: '/landing/logos/logo-3.png',
    person: '이OO',
    role: '플랜트 현장 / 관리감독자',
    quote:
      '감사 대응할 때 “왜 이렇게 했는지”가 중요한데, RegAI는 근거랑 서식 연결이 깔끔해서 보고 자료 만들기가 수월합니다.',
  },
];

export default function ReviewsBanner() {
  return (
    <section className={s.wrap}>
      <div className={s.inner}>
        <div className={s.head}>
          <h2 className={s.h2}>현장에서 먼저 검증된 RegAI</h2>
          <p className={s.p}>
            안전관리자는 “답변”이 아니라 “바로 쓸 수 있는 결과물”이 필요합니다.
            실제 사용자 관점으로 UI/출력 형식을 계속 다듬고 있습니다.
          </p>
        </div>

        <div className={s.grid}>
          {REVIEWS.map((r) => (
            <div key={`${r.company}-${r.person}`} className={s.card}>
              <div className={s.top}>
                <div className={s.logoBox}>
                  {r.logoSrc ? (
                    <Image src={r.logoSrc} alt={r.company} width={120} height={40} className={s.logo} />
                  ) : (
                    <div className={s.logoPill}>{r.company}</div>
                  )}
                </div>

                <div className={s.person}>
                  <div className={s.name}>{r.person}</div>
                  <div className={s.role}>{r.role}</div>
                </div>
              </div>

              <div className={s.quote}>&ldquo;{r.quote}&rdquo;</div>

              <div className={s.companyLine}>
                <span className={s.company}>{r.company}</span>
                <span className={s.tag}>도입 후 업무시간 절감</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

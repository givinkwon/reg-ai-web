import Link from 'next/link';
import s from './ChatCtaRibbon.module.css';

export default function ChatCtaRibbon() {
  return (
    <section className={s.wrap}>
      <div className={s.inner}>
        <div className={s.text}>
          <div className={s.title}>안전문서, 바로 만들어요</div>
          <div className={s.desc}>
            TBM · 위험성평가 · 월점검표까지 필요한 정보를 채팅으로 입력하면
            자동으로 문서 초안이 생성됩니다.
          </div>
        </div>

        <div className={s.actions}>
          <Link
            href="/chat"
            className={s.cta}
            data-ga-id="Home:ChatCtaRibbon:ClickChat"
            data-ga-label="ribbon"
          >
            바로 사용하기
          </Link>

          {/* <Link
            href="/pricing"
            className={s.secondary}
            data-ga-id="landing:cta:view_pricing"
            data-ga-label="ribbon"
          >
            요금제 보기
          </Link> */}
        </div>
      </div>
    </section>
  );
}

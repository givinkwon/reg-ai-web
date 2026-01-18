import Image from 'next/image';
import s from './LogoMarquee.module.css';

type LogoItem = { name: string; src?: string };

const DEFAULT_LOGOS: LogoItem[] = [
  { name: 'H-Construction', src: '/landing/logos/logo-1.png' },
  { name: 'S-Manufacturing', src: '/landing/logos/logo-2.png' },
  { name: 'K-Plant', src: '/landing/logos/logo-3.png' },
  { name: 'D-Logistics', src: '/landing/logos/logo-4.png' },
  { name: 'N-Chem', src: '/landing/logos/logo-5.png' },
  { name: 'A-Factory', src: '/landing/logos/logo-6.png' },
];

export default function LogoMarquee() {
  return (
    <section className={s.wrap}>
      <div className={s.inner}>
        <div className={s.title}>
          이미 <strong>23개의 기업</strong>들이 RegAI와 함께하고 있습니다
        </div>

        <div className={s.marquee} aria-label="고객사 로고 흐름 배너">
          <div className={s.track}>
            {/* ✅ 동일 세트 2개: -50% 이동이 정확히 “첫 세트 길이”가 됨 */}
            <div className={s.set}>
              {DEFAULT_LOGOS.map((it) => (
                <div key={`a-${it.name}`} className={s.logoBox}>
                  {it.src ? (
                    <Image
                      src={it.src}
                      alt={it.name}
                      width={140}
                      height={44}
                      className={s.logoImg}
                    />
                  ) : (
                    <div className={s.logoPill}>{it.name}</div>
                  )}
                </div>
              ))}
            </div>

            <div className={s.set} aria-hidden="true">
              {DEFAULT_LOGOS.map((it) => (
                <div key={`b-${it.name}`} className={s.logoBox}>
                  {it.src ? (
                    <Image
                      src={it.src}
                      alt=""
                      width={140}
                      height={44}
                      className={s.logoImg}
                    />
                  ) : (
                    <div className={s.logoPill}>{it.name}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* <div className={s.sub}>* 표기된 기업명/로고는 데모 예시입니다.</div> */}
      </div>
    </section>
  );
}

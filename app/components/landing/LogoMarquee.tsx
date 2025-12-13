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
  // 마키가 끊김 없이 흐르도록 2번 반복
  const items = [...DEFAULT_LOGOS, ...DEFAULT_LOGOS];

  return (
    <section className={s.wrap}>
      <div className={s.inner}>
        <div className={s.title}>
          이미 <strong>23개의 기업</strong>들이 RegAI와 함께하고 있습니다
        </div>

        <div className={s.marquee} aria-label="고객사 로고 흐름 배너">
          <div className={s.track}>
            {items.map((it, idx) => (
              <div key={`${it.name}-${idx}`} className={s.logoBox}>
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
        </div>
      </div>
    </section>
  );
}

'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import s from './ProductBanners.module.css';

type Feature = {
  id: string;
  title: string;
  headline: string;
  desc: string;
  bullets: string[];

  imageSrc?: string;
  imageAlt?: string;

  videoMp4?: string;
  videoWebm?: string;
  videoPoster?: string;
};

const FEATURES: Feature[] = [
  {
    id: 'docs',
    title: 'AI 규제정보 해석',
    headline: '근거 없이 답하지 않는 “규제 특화” 답변',
    desc: '5510개 법령, 81,200개 행정규칙, 53,800개 유권 및 법령해석, 41,100개 사고사례, KOSHA 가이드 등 실무 규제 데이터를 학습해 답변합니다.',
    bullets: [
      '답변마다 근거를 즉시 확인(법령/행정규칙/유권해석/사고사례)',
      '근거 없는 추정형 답변을 막도록 설계',
      '매일 업데이트된 규제 데이터를 반영해 최신 기준 유지',
    ],
    videoMp4: '/landing/features/feature-1.mp4',
    videoWebm: '/landing/features/feature-1.webm',
    videoPoster: '/landing/features/feature-1.png',
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
    videoMp4: '/landing/features/feature-2.mp4',
    videoWebm: '/landing/features/feature-2.webm',
    videoPoster: '/landing/features/feature-2.png',
  },
  {
    id: 'riskedu',
    title: '문서 생성·검토 & 위험성평가',
    headline: '내 사업장 기준으로 “작성 + 준수 검토”까지',
    desc: '수시·분기·반기 등 필요한 안전 문서를 사업장 상황에 맞게 생성하고, 규제 준수 여부를 한 번에 점검합니다.',
    bullets: [
      '필수 안전서류를 사업장 맞춤으로 자동 생성',
      '작성한 문서의 규제 준수 여부 자동 검토',
      '공정 + 유해·위험요인 선택만으로 위험성평가 생성',
      '근로자 교육자료(교육안/슬라이드/퀴즈)까지 자동 생성',
    ],
    videoMp4: '/landing/features/feature-3.mp4',
    videoWebm: '/landing/features/feature-3.webm',
    videoPoster: '/landing/features/feature-3.png',
  },
];

type LazyVideoProps = {
  mp4Src: string;
  webmSrc?: string;
  poster?: string;
  className?: string;

  /** mp4와 같은 베이스 네임의 animated webp를 폴백으로 사용 (예: feature-1.mp4 -> feature-1.webp) */
  animatedWebpFallbackSrc?: string;
};

function LazyVideo({
  mp4Src,
  webmSrc,
  poster,
  className,
  animatedWebpFallbackSrc,
}: LazyVideoProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  // poster(정지) / video / anim(움직이는 webp)
  const [mode, setMode] = useState<'poster' | 'video' | 'anim'>('poster');
  const [pendingPlay, setPendingPlay] = useState(false);

  // animated webp 폴백 경로(네가 "같은 이름"으로 넣었다고 했으니 기본 계산)
  const animSrc =
    animatedWebpFallbackSrc ?? mp4Src.replace(/\.mp4$/i, '.webp');

  // ✅ “동작 줄이기”
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;

    const update = () => setReduceMotion(!!mq.matches);
    update();

    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
    };
  }, []);

  // ✅ 뷰포트 들어오면 enabled = true (한 번만)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    if (!('IntersectionObserver' in window)) {
      setEnabled(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setEnabled(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ✅ source 변경 시 video DOM 재마운트
  const videoKey = useMemo(() => `${webmSrc ?? ''}|${mp4Src}`, [webmSrc, mp4Src]);

  // enabled가 되면: reduceMotion이면 poster 유지, 아니면 video로 전환 후 재생 시도
  useEffect(() => {
    if (!enabled) return;

    if (reduceMotion) {
      setMode('poster');
      setPendingPlay(false);
    } else {
      setMode('video');
      setPendingPlay(true);
    }
  }, [enabled, reduceMotion, videoKey]);

  const tryPlay = async () => {
    const v = videoRef.current;
    if (!v) return;

    // autoplay 성공률 올리기: property도 확실히 세팅
    v.muted = true;
    // @ts-ignore
    v.defaultMuted = true;
    v.playsInline = true;

    try {
      await v.play();
      // 성공하면 video 유지
      setMode('video');
    } catch {
      // autoplay가 정책으로 막히면 → animated webp로 폴백 (자동으로 움직이게)
      if (animSrc) setMode('anim');
      else setMode('poster');
    }
  };

  // mode가 video로 렌더된 뒤에 재생 시도
  useEffect(() => {
    if (!pendingPlay) return;
    if (reduceMotion) return;
    if (mode !== 'video') return;

    setPendingPlay(false);
    void tryPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlay, mode, reduceMotion, videoKey]);

  // 클릭 시: anim/ poster 상태면 video로 전환해서 사용자 제스처로 재생 시도 가능
  const handleClick = () => {
    if (reduceMotion) return;
    setMode('video');
    setPendingPlay(true);
  };

  return (
    <div
      ref={wrapRef}
      className={s.videoWrap}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
    >
      {!enabled || mode === 'poster' ? (
        poster ? (
          <Image
            src={poster}
            alt="feature poster"
            fill
            className={s.posterImg}
            sizes="(max-width: 900px) 100vw, 920px"
          />
        ) : (
          <div className={s.posterFallback} />
        )
      ) : mode === 'anim' ? (
        // ✅ 핵심: autoplay 막히면 animated webp로 폴백(이미지라서 “자동재생 정책” 영향 적음)
        // next/image는 애니메이션이 깨질 수 있어서 <img>가 가장 안전
        <img
          src={animSrc}
          alt="feature animation"
          className={s.posterImg} // fill처럼 보이게 CSS가 position/size를 잡아줘야 함
        />
      ) : (
        <video
          key={videoKey}
          ref={videoRef}
          className={className}
          poster={poster}
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
          onError={() => setMode('anim')}
          onCanPlay={() => {
            // 타이밍 이슈 보정
            if (!reduceMotion) void tryPlay();
          }}
        >
          {webmSrc ? <source src={webmSrc} type="video/webm" /> : null}
          <source src={mp4Src} type="video/mp4" />
          브라우저가 비디오를 지원하지 않습니다.
        </video>
      )}
    </div>
  );
}

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
                <div className={s.title}>{f.title}</div>
                <div className={s.headline}>{f.headline}</div>
                <div className={s.desc}>{f.desc}</div>

                <ul className={s.bullets}>
                  {f.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>

              <div className={s.media}>
                {f.videoMp4 ? (
                  <LazyVideo
                    key={f.videoMp4}
                    mp4Src={f.videoMp4}
                    webmSrc={f.videoWebm}
                    poster={f.videoPoster}
                    // ✅ "같은 이름" animated webp를 폴백으로 쓰고 싶으면 그냥 이 줄 없어도 됨(내부에서 mp4 -> webp로 계산)
                    // animatedWebpFallbackSrc={f.videoMp4.replace(/\.mp4$/i, '.webp')}
                    className={s.video}
                  />
                ) : f.imageSrc ? (
                  <Image
                    src={f.imageSrc}
                    alt={f.imageAlt || f.title}
                    width={920}
                    height={560}
                    className={s.img}
                  />
                ) : (
                  <div className={s.placeholder}>...</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

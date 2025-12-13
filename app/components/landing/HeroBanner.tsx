'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './HeroBanner.module.css';

type ChatLine = {
  role: 'user' | 'assistant';
  text: string;
};

export default function HeroBanner() {
  const router = useRouter();

  const questions = useMemo(
    () => [
      '지게차 작업 중 후진 사고를 줄이려면 TBM에서 뭐부터 체크해야 하나요?',
      '고소작업대 사용 시 안전대 걸이(앵커) 기준이 정확히 뭐예요?',
      '안전난간 설치 기준(상부/중간 난간, 발끝막이판)을 현장용으로 정리해줘.',
      '밀폐공간 작업 들어가기 전 가스측정은 어떤 순서로 해야 해요?',
      '화기 작업허가서에 반드시 들어가야 하는 항목이 뭐예요?',
      '컨베이어 협착 사고 예방을 위해 방호장치 점검 포인트 알려줘.',
    ],
    [],
  );

  const aiSnippets = useMemo(
    () => [
      '후진 동선 분리(보행자 차단), 경고음/후방카메라 점검, 유도자 배치 여부부터 확인하세요.',
      '앵커는 추락 시 하중을 견딜 수 있는 구조물에 설치하고, 작업자 동선에 맞게 상시 걸림 유지가 핵심입니다.',
      '현장 적용 포인트는 높이·간격·끝단 처리입니다. 난간 높이/중간난간/발끝막이판을 함께 확인해야 해요.',
      '상·중·하층 순서로 산소·가연성(LEL)·유해가스 측정하고, 환기 후 재측정까지 반복합니다.',
      '작업범위/시간, 가연물 제거, 소화기 비치, 화재감시자 지정, 비상연락체계가 빠지면 안 됩니다.',
      '비상정지, 가드/커버, 인터록, 청소·정비 시 LOTO 적용 여부가 주요 체크포인트입니다.',
    ],
    [],
  );

  const [idx, setIdx] = useState(0);
  const [lines, setLines] = useState<ChatLine[]>([
    { role: 'assistant', text: 'RegAI에게 질문해보세요. 실무 기준으로 바로 정리해드려요.' },
  ]);

  // ✅ 자동 순환
  useEffect(() => {
    const t = window.setInterval(() => {
      setIdx((prev) => (prev + 1) % questions.length);
    }, 2600);
    return () => window.clearInterval(t);
  }, [questions.length]);

  // ✅ idx 변경될 때 채팅창에 “질문→답변” 넣기
  useEffect(() => {
    const q = questions[idx];
    const a = aiSnippets[idx];

    setLines((prev) => {
      const next: ChatLine[] = [
        ...prev,
        { role: 'user', text: q },
        { role: 'assistant', text: a },
      ];

      // 너무 길어지면 최근 N개만 유지
      const MAX = 7;
      if (next.length > MAX) return next.slice(next.length - MAX);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const goChat = () => router.push('/chat');

  return (
    <section className={s.wrap}>
      <div className={s.bgGlow} aria-hidden="true" />

      <div className={s.inner}>
        {/* Left */}
        <div className={s.left}>
          <div className={s.kicker}>산업안전 · 보건 실무 AI</div>

          <h1 className={s.title}>
            손 많이 가는 안전 관리
            <br />
            <span className={s.titleAccent}>RegAI로 한 번에 해결!</span>
          </h1>

          <p className={s.desc}>
            법정 기준·KOSHA 가이드·현장 관행을 한 화면에서 정리합니다.
            <br />
            문서 템플릿, 교육자료, 사고사례까지 업무 시간을 확 줄여보세요.
          </p>

          <div className={s.ctaRow}>
            <button className={s.primaryBtn} onClick={goChat}>
              바로 사용하기
            </button>
            <button className={s.ghostBtn} onClick={() => router.push('#features')}>
              기능 보기
            </button>
          </div>

          <div className={s.miniBadges}>
            <span className={s.badge}>문서 자동 생성</span>
            <span className={s.badge}>교육자료/PPT</span>
            <span className={s.badge}>사고사례 요약</span>
            <span className={s.badge}>실무지침 정리</span>
          </div>
        </div>

        {/* Right: Chat Mock */}
        <div className={s.right}>
          <div
            className={s.chatCard}
            role="button"
            tabIndex={0}
            onClick={goChat}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') goChat();
            }}
            aria-label="RegAI 채팅으로 이동"
            title="클릭하면 채팅으로 이동"
          >
            <div className={s.chatHeader}>
              <div className={s.chatDot} aria-hidden="true" />
              <div className={s.chatTitle}>RegAI Chat</div>
              <div className={s.chatHint}>클릭하면 바로 시작</div>
            </div>

            <div className={s.chatBody}>
              {lines.map((ln, i) => {
                const isUser = ln.role === 'user';
                return (
                  <div key={i} className={isUser ? s.rowUser : s.rowAi}>
                    <div className={isUser ? s.bubbleUser : s.bubbleAi}>
                      {ln.text}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={s.chatFooter}>
              <div className={s.fakeInput} aria-hidden="true">
                질문을 입력하세요…
              </div>
              <div className={s.sendBtn} aria-hidden="true">
                ↩︎
              </div>
            </div>
          </div>

          <div className={s.sideNote}>
            ※ 실제 화면에서는 파일 업로드/템플릿 다운로드까지 지원합니다.
          </div>
        </div>
      </div>
    </section>
  );
}

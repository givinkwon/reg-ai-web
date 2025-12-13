import s from './FooterBanner.module.css';

export default function FooterBanner() {
  return (
    <footer className={s.wrap} id="contact">
      <div className={s.inner}>
        <div className={s.top}>
          <div className={s.brand}>
            <div className={s.logo}>REG AI</div>
            <div className={s.tagline}>
              산업안전/보건 실무를 빠르고 정확하게.
            </div>
          </div>

          <div className={s.cta}>
            <div className={s.ctaTitle}>도입 문의</div>
            <div className={s.ctaDesc}>
              데모/요금/PoC(파일럿) 상담이 필요하시면 연락 주세요.
            </div>
            <a className={s.mail} href="mailto:contact@regai.ai">
              contact@regai.ai
            </a>
          </div>
        </div>

        <div className={s.hr} />

        <div className={s.grid}>
          <div className={s.col}>
            <div className={s.colTitle}>사업자 정보</div>
            <div className={s.line}>상호: (주)레그에이아이</div>
            <div className={s.line}>대표자: 홍길동</div>
            <div className={s.line}>사업자등록번호: 000-00-00000</div>
            <div className={s.line}>통신판매업 신고번호: 제2025-서울-0000호</div>
          </div>

          <div className={s.col}>
            <div className={s.colTitle}>고객센터</div>
            <div className={s.line}>이메일: contact@regai.ai</div>
            <div className={s.line}>운영시간: 평일 10:00 ~ 18:00</div>
            <div className={s.line}>주소: 서울특별시 ○○구 ○○로 00</div>
          </div>

          <div className={s.col}>
            <div className={s.colTitle}>바로가기</div>
            <a className={s.link} href="#features">기능</a>
            <a className={s.link} href="#contact">문의</a>
            <a className={s.link} href="/privacy">개인정보처리방침</a>
            <a className={s.link} href="/terms">이용약관</a>
          </div>
        </div>

        <div className={s.bottom}>
          © {new Date().getFullYear()} RegAI. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

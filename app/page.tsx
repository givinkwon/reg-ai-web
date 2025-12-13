import s from './page.module.css';

import HeroBanner from './components/landing/HeroBanner';
import LogoMarquee from './components/landing/LogoMarquee';
import ProductBanners from './components/landing/ProductBanners';
import ReviewsBanner from './components/landing/ReviewsBanner';
import FooterBanner from './components/landing/FooterBanner';

export default function Page() {
  return (
    <main className={s.page}>
      <HeroBanner />
      <LogoMarquee />
      <ProductBanners />
      <ReviewsBanner />
      <FooterBanner />
    </main>
  );
}

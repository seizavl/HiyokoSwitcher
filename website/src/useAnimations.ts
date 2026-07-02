import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// GSAP によるページ全体の演出。
// - ヒーロー: 見出しの行マスク出現 → サブコピー → ボタン → モックアップ
// - スクロール: セクション見出し・機能カード・プレビュー行のフェードイン
// - モックアップとプレビュー画像はスクロールに合わせて軽く視差移動
// prefers-reduced-motion では何も動かさない（matchMedia でガード）。
export function useAnimations() {
  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // ---- ヒーロー入場 ----
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      tl.from('.hero-title .line', {
        yPercent: 115,
        duration: 1.1,
        stagger: 0.14,
      })
        .from('.hero-subtitle', { y: 24, autoAlpha: 0, duration: 0.9 }, '-=0.6')
        .from(
          '.hero-actions > *',
          { y: 18, autoAlpha: 0, duration: 0.7, stagger: 0.08 },
          '-=0.6'
        )
        .from('.hero-meta', { autoAlpha: 0, duration: 0.6 }, '-=0.45')
        .from(
          '.hero-mockup',
          { y: 70, autoAlpha: 0, scale: 0.975, duration: 1.2 },
          '-=0.55'
        );

      // ヒーローモックアップの視差
      gsap.to('.hero-mockup', {
        yPercent: -6,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero-mockup',
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });

      // ---- セクション見出し ----
      gsap.utils.toArray<HTMLElement>('.section-head').forEach((el) => {
        gsap.from(el, {
          y: 36,
          autoAlpha: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%' },
        });
      });

      // ---- 機能カード（画面に入った分だけまとめて時差表示）----
      ScrollTrigger.batch('.feature-card', {
        start: 'top 88%',
        onEnter: (els) =>
          gsap.fromTo(
            els,
            { y: 32, autoAlpha: 0 },
            {
              y: 0,
              autoAlpha: 1,
              duration: 0.8,
              stagger: 0.1,
              ease: 'power3.out',
              overwrite: true,
            }
          ),
      });
      // batch は onEnter まで from 状態にならないため初期状態を明示する
      gsap.set('.feature-card', { y: 32, autoAlpha: 0 });

      // ---- プレビュー行 ----
      gsap.utils.toArray<HTMLElement>('.showcase-row').forEach((row) => {
        const text = row.querySelector('.showcase-text');
        const media = row.querySelector('.showcase-media');
        const fromX = row.classList.contains('reverse') ? 40 : -40;
        gsap.from(text, {
          x: fromX,
          autoAlpha: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: row, start: 'top 78%' },
        });
        gsap.from(media, {
          y: 48,
          autoAlpha: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: row, start: 'top 78%' },
        });
        gsap.to(media, {
          yPercent: -5,
          ease: 'none',
          scrollTrigger: {
            trigger: row,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
      });

      // ---- CTA ----
      gsap.from('.cta-panel', {
        y: 44,
        autoAlpha: 0,
        scale: 0.98,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.cta-panel', start: 'top 82%' },
      });
    });

    return () => mm.revert();
  }, []);
}

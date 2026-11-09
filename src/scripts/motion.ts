import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Motion is progressive enhancement: the unmodified HTML is the static story. */
export function initMotion(): () => void {
  const media = gsap.matchMedia();
  const story = document.querySelector<HTMLElement>('.story-visual');
  const mode = document.querySelector<HTMLElement>('.story-mode');
  const markers = gsap.utils.toArray<HTMLElement>('.story-progress span');
  const chapters = ['01 — LOCATE', '02 — RELATE', '03 — SHARE'];
  let active = -1;
  const showChapter = (index: number) => {
    if (active === index) return;
    active = index;
    if (mode) mode.textContent = chapters[index];
    if (story) story.dataset.activeStep = String(index);
    markers.forEach((marker, i) => {
      marker.style.backgroundColor = i === index ? '#f08c75' : '#46525f';
    });
  };

  media.add('(prefers-reduced-motion: no-preference)', () => {
    const desktop = window.matchMedia('(min-width: 801px)').matches;
    if (window.scrollY < 100 && !window.location.hash) {
      const entrance = gsap.timeline({ defaults: { ease: 'power3.out' } });
      entrance
        .from('.hero h1 > span', { y: 20, duration: 0.9, stagger: 0.09 }, 0)
        .from(
          '.hero-copy > p, .hero-note',
          { y: 14, opacity: 0.7, duration: 0.8, stagger: 0.08 },
          0.2,
        )
        // CTA hover owns transform in CSS; GSAP changes only its opacity.
        .from('.hero-copy > .button', { opacity: 0.7, duration: 0.8, clearProps: 'opacity' }, 0.28)
        .from(
          '.hero-art .field-shell',
          { scaleY: 0.78, y: 35, transformOrigin: '50% 80%', opacity: 0.25, duration: 1.5 },
          0.05,
        )
        .from(
          '.hero-art .field-source',
          { y: 18, opacity: 0.15, duration: 0.9, stagger: 0.15 },
          0.4,
        )
        .from(
          '.hero-art .field-heading, .hero-art .field-caption',
          { opacity: 0.25, duration: 0.7, stagger: 0.15 },
          0.75,
        );
      if (desktop) {
        document.querySelectorAll<SVGPathElement>('.field-hero .contour').forEach((path, index) => {
          const length = path.getTotalLength();
          entrance.fromTo(
            path,
            { strokeDasharray: length, strokeDashoffset: length },
            {
              strokeDashoffset: 0,
              duration: 1.5,
              ease: 'power2.inOut',
              clearProps: 'strokeDasharray,strokeDashoffset',
            },
            0.1 + index * 0.009,
          );
        });
      }
    }
    gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((element) => {
      gsap.from(element, {
        y: 18,
        duration: 0.85,
        ease: 'power3.out',
        scrollTrigger: { trigger: element, start: 'top 93%', once: true },
      });
    });
    return () => {
      /* matchMedia reverts the timelines and their inline styles. */
    };
  });

  media.add('(min-width: 801px) and (prefers-reduced-motion: no-preference)', () => {
    gsap.to('.field-hero', {
      y: -24,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 },
    });
    const shell = '.field-story .field-shell';
    const air = '.field-story .source-air';
    const voice = '.field-story .source-voice';
    const signal = '.field-story .source-signal';
    const connection = document.querySelector('.field-story .field-connections path');
    const timeline = gsap.timeline({
      defaults: { ease: 'sine.inOut' },
      scrollTrigger: {
        trigger: '.story-steps',
        start: 'top 40%',
        end: 'bottom 70%',
        scrub: 0.65,
        invalidateOnRefresh: true,
        onUpdate: (self) => showChapter(Math.min(2, Math.floor(self.progress * 3))),
      },
    });
    timeline
      .to(
        shell,
        { scaleX: 0.93, scaleY: 0.82, y: 35, transformOrigin: '50% 75%', duration: 1.2 },
        0,
      )
      .to(air, { x: -48, y: 8, duration: 1.2 }, 0)
      .to(voice, { x: -62, y: 28, duration: 1.2 }, 0)
      .to(signal, { x: 48, y: 32, duration: 1.2 }, 0)
      .to(
        connection,
        { attr: { d: 'M360 423L157 310M360 423l117-135M360 423L408 156' }, duration: 1.2 },
        0,
      )
      .to(
        '.field-story .field-orbit',
        { rotation: -12, transformOrigin: '50% 50%', strokeDashoffset: 70, duration: 1.2 },
        0,
      )
      .to(shell, { scaleX: 1.03, scaleY: 1.06, y: -8, duration: 1.2 }, 1.3)
      .to(air, { x: 20, y: -10, duration: 1.2 }, 1.3)
      .to(voice, { x: -28, y: -18, duration: 1.2 }, 1.3)
      .to(signal, { x: 0, y: 70, duration: 1.2 }, 1.3)
      .to(
        connection,
        { attr: { d: 'M360 423L225 292M360 423l151-181M360 423L360 194' }, duration: 1.2 },
        1.3,
      )
      .to('.field-story .field-orbit', { rotation: 5, strokeDashoffset: 130, duration: 1.2 }, 1.3);
    showChapter(0);
    return () => {
      active = -1;
      showChapter(0);
    };
  });

  // A content change can alter native sticky bounds; refresh only while mounted.
  let disposed = false;
  void document.fonts.ready.then(() => {
    if (!disposed) ScrollTrigger.refresh();
  });
  return () => {
    disposed = true;
    media.revert();
    active = -1;
    showChapter(0);
  };
}

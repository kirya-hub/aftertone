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
    // Comparison compositions own their Hero motion; keep the Neon sequence local.
    if (document.querySelector('.hero-neon')) {
      if (window.scrollY < 100 && !window.location.hash) {
        // Reveal the physical form before settling the foreground typography.
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from('.resonance-depth', { scale: 1.08, rotation: -5, opacity: 0.45, duration: 1.6 }, 0)
          .from('.hero h1 > span', { y: 20, opacity: 0.6, duration: 0.95, stagger: 0.09 }, 0.12)
          .from(
            '.neon-description, .neon-note',
            { y: 12, opacity: 0.4, duration: 0.8, stagger: 0.08 },
            0.35,
          )
          .from('.neon-button', { opacity: 0.5, duration: 0.8, clearProps: 'opacity' }, 0.4)
          .from(
            '.neon-session, .resonance-label',
            { y: 14, opacity: 0, duration: 0.9, stagger: 0.1 },
            0.65,
          );
      }
      // As the listener moves through the page, the sound sculpture moves on a
      // slower depth plane. Transform-only; never hides content, no continuous loop.
      gsap.to('.resonance-scene', {
        yPercent: 10,
        rotation: 4,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 },
      });
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

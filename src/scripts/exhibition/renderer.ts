import { activateFallback } from './fallback';
import * as T from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createStudy, environment, type Study } from './scenes';
import { clampAngle, presets, togglePath } from './state';
gsap.registerPlugin(ScrollTrigger);
export function mountRenderer(root: HTMLElement): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const abort = new AbortController(),
    options = { signal: abort.signal };
  let renderer: T.WebGLRenderer;
  try {
    if (!canvas.getContext('webgl2')) {
      root.dataset.runtime = 'fallback';
      return activateFallback(root);
    }
    renderer = new T.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    root.dataset.runtime = 'fallback';
    return activateFallback(root);
  }
  const gl = renderer.getContext(),
    debug = gl.getExtension('WEBGL_debug_renderer_info');
  const backend = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
  const resolutionScale = /llvmpipe|swiftshader|software/i.test(backend) ? 0.65 : 1;
  root.dataset.backend = backend;
  root.dataset.resolutionScale = String(resolutionScale);
  renderer.setClearColor(0, 0);
  renderer.autoClear = false;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.transmissionResolutionScale = 0.5;
  let fallbackCleanup = () => {};
  let env = environment(renderer),
    frame = 0,
    lost = false,
    disposed = false,
    angle = 0,
    elevation = 0.18,
    selected = -1,
    pointer = 0;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const slots = [...root.querySelectorAll<HTMLElement>('[data-scene]')];
  const studies = new Map<HTMLElement, Study>();
  const state = {
    get draws() {
      return draws;
    },
    get scenes() {
      return studies.size;
    },
  };
  let draws = 0;
  Object.defineProperty(root, 'exportStudy', {
    configurable: true,
    value: (name: string, a = 0, e = 0.18) => {
      const study = createStudy(name, env.texture, resolutionScale === 1);
      study.camera.aspect = 1.44;
      study.update(0.5, false, a, e, -1, true, 0);
      study.camera.updateProjectionMatrix();
      renderer.setPixelRatio(1);
      renderer.setSize(1440, 1000, false);
      renderer.setScissorTest(false);
      // Opaque exhibition backing also gives transmission a stable export background.
      renderer.setClearColor(0x080910, 1);
      renderer.clear();
      renderer.render(study.scene, study.camera);
      const data = canvas.toDataURL('image/png');
      renderer.setClearColor(0, 0);
      study.dispose();
      invalidate();
      return data;
    },
  });
  Object.defineProperty(root, 'exhibitionStats', { configurable: true, value: state });
  function controls(enabled: boolean) {
    root
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input')
      .forEach((e) => (e.disabled = !enabled));
    const status = root.querySelector('[data-render-status]');
    if (status) status.textContent = enabled ? 'Interactive sculpture.' : 'Static view.';
  }
  controls(true);
  root.dataset.runtime = 'webgl';
  function invalidate() {
    if (!frame && !disposed && !lost && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function draw() {
    frame = 0;
    if (disposed || lost || document.hidden) return;
    const w = document.documentElement.clientWidth,
      h = innerHeight,
      mobile = w < 700;
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2) * resolutionScale;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
    }
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    let visible = 0;
    for (const slot of slots) {
      const r = slot.getBoundingClientRect();
      if (r.bottom < -500 || r.top > h + 500) {
        const old = studies.get(slot);
        if (old) {
          old.dispose();
          studies.delete(slot);
        }
        slot.removeAttribute('data-live');
        continue;
      }
      let study = studies.get(slot);
      if (!study) {
        study = createStudy(slot.dataset.scene!, env.texture, resolutionScale === 1);
        studies.set(slot, study);
      }
      if (r.bottom <= 0 || r.top >= h) continue;
      visible++;
      const section = slot.closest<HTMLElement>('section')!,
        bounds = section.getBoundingClientRect();
      const progress = T.MathUtils.clamp((h - bounds.top) / (bounds.height + h), 0, 1);
      study.camera.aspect = r.width / r.height;
      study.update(progress, mobile, angle, elevation, selected, media.matches, pointer);
      study.camera.updateProjectionMatrix();
      renderer.setViewport(r.left, h - r.bottom, r.width, r.height);
      renderer.setScissor(
        Math.max(0, r.left),
        Math.max(0, h - r.bottom),
        Math.min(w, r.right) - Math.max(0, r.left),
        Math.min(h, r.bottom) - Math.max(0, r.top),
      );
      renderer.clearDepth();
      renderer.render(study.scene, study.camera);
      slot.dataset.live = 'true';
      draws++;
    }
    canvas.style.visibility = visible ? 'visible' : 'hidden';
  }
  const range = root.querySelector<HTMLInputElement>('input[type=range]')!,
    output = root.querySelector('output')!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  function sync() {
    range.value = String(Math.round(angle));
    output.textContent = `${Math.round(angle)}°`;
    buttons.forEach((b, i) =>
      b.setAttribute(
        'aria-pressed',
        String(angle === presets[i].angle && elevation === presets[i].elevation),
      ),
    );
    invalidate();
  }
  range.addEventListener(
    'input',
    () => {
      angle = clampAngle(Number(range.value));
      sync();
    },
    options,
  );
  buttons.forEach((b, i) =>
    b.addEventListener(
      'click',
      () => {
        if (lost) return;
        angle = presets[i].angle;
        elevation = presets[i].elevation;
        sync();
      },
      options,
    ),
  );
  root.querySelector('[data-reset]')!.addEventListener(
    'click',
    () => {
      angle = 0;
      elevation = 0.18;
      sync();
    },
    options,
  );
  root.querySelectorAll<HTMLButtonElement>('[data-path]').forEach((b, i) =>
    b.addEventListener(
      'click',
      () => {
        selected = togglePath(selected, i);
        root
          .querySelectorAll('[data-path]')
          .forEach((button, n) => button.setAttribute('aria-pressed', String(n === selected)));
        invalidate();
      },
      options,
    ),
  );
  const perspective = root.querySelector<HTMLElement>('[data-scene=perspective]')!;
  let drag: { id: number; x: number; y: number; angle: number } | undefined;
  perspective.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, angle };
    },
    options,
  );
  perspective.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        drag = undefined;
        return;
      }
      if (Math.abs(dx) > 6) {
        perspective.setPointerCapture(e.pointerId);
        angle = clampAngle(drag.angle + dx * 0.25);
        sync();
      }
    },
    options,
  );
  const release = () => {
    drag = undefined;
  };
  perspective.addEventListener('pointerup', release, options);
  perspective.addEventListener('pointercancel', release, options);
  perspective.addEventListener('lostpointercapture', release, options);
  root.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' || media.matches || drag) return;
      pointer = e.clientX / innerWidth - 0.5;
      invalidate();
    },
    options,
  );
  const reveal = gsap.context(() => {
    if (!media.matches)
      gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.chapter-heading')).forEach((el) =>
        gsap.from(el, {
          y: 25,
          duration: 1,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 95%', once: true },
        }),
      );
  }, root);
  const changed = () => {
    if (media.matches) reveal.revert();
    invalidate();
  };
  media.addEventListener('change', changed, options);
  addEventListener('scroll', invalidate, { ...options, passive: true });
  addEventListener('resize', invalidate, options);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else invalidate();
    },
    options,
  );
  canvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      lost = true;
      cancelAnimationFrame(frame);
      frame = 0;
      slots.forEach((s) => s.removeAttribute('data-live'));
      canvas.style.visibility = 'hidden';
      controls(false);
      const preset = presets.findIndex((p) => p.angle === angle && p.elevation === elevation);
      fallbackCleanup = activateFallback(root, Math.max(0, preset), (i) => {
        angle = presets[i].angle;
        elevation = presets[i].elevation;
        sync();
      });
      root.dataset.runtime = 'fallback';
    },
    options,
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      fallbackCleanup();
      studies.forEach((s) => s.dispose());
      studies.clear();
      env.dispose();
      env = environment(renderer);
      lost = false;
      controls(true);
      root.dataset.runtime = 'webgl';
      sync();
    },
    options,
  );
  const resize = new ResizeObserver(invalidate);
  resize.observe(root);
  sync();
  return () => {
    disposed = true;
    fallbackCleanup();
    abort.abort();
    resize.disconnect();
    reveal.revert();
    cancelAnimationFrame(frame);
    studies.forEach((s) => s.dispose());
    studies.clear();
    env.dispose();
    renderer.dispose();
    slots.forEach((s) => s.removeAttribute('data-live'));
    delete (root as HTMLElement & { exportStudy?: unknown }).exportStudy;
    delete (root as HTMLElement & { exhibitionStats?: unknown }).exhibitionStats;
  };
}

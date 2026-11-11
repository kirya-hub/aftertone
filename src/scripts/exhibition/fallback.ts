import { presets } from './state';

export function activateFallback(
  root: HTMLElement,
  initialPreset = 0,
  onPreset: (index: number) => void = () => {},
): () => void {
  const controller = new AbortController();
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const poster = root.querySelector<HTMLImageElement>('[data-scene=perspective] img')!;
  const originalSrc = poster.getAttribute('src')!;
  const originalSrcset = poster.getAttribute('srcset');
  const range = root.querySelector<HTMLInputElement>('input[type=range]')!;
  const output = root.querySelector('output')!;
  const status = root.querySelector('[data-render-status]')!;
  const show = (i: number) => {
    poster.src = `/exhibition/${['perspective', 'within', 'above'][i]}.webp`;
    poster.removeAttribute('srcset');
    range.value = String(presets[i].angle);
    output.textContent = `${presets[i].angle}°`;
    buttons.forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
    onPreset(i);
  };
  status.textContent = 'Static preset views. Choose Front, Within or Above.';
  buttons.forEach((button, i) => {
    button.disabled = false;
    button.addEventListener('click', () => show(i), { signal: controller.signal });
  });
  show(initialPreset);
  return () => {
    controller.abort();
    poster.setAttribute('src', originalSrc);
    if (originalSrcset !== null) poster.setAttribute('srcset', originalSrcset);
  };
}

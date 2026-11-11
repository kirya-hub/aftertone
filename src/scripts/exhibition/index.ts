import { activateFallback } from './fallback';
import { clampAngle, presets, togglePath } from './state';
// GPU code is imported only when the exhibition approaches the viewport.
export function mountExhibition(): () => void {
  const root = document.querySelector<HTMLElement>('[data-journey]');
  if (!root) return () => {};
  let disposed = false,
    cleanup = () => {};
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        void import('./renderer')
          .then(({ mountRenderer }) => {
            if (!disposed) cleanup = mountRenderer(root);
          })
          .catch(() => {
            root.dataset.runtime = 'fallback';
            cleanup = activateFallback(root);
          });
      }
    },
    { rootMargin: '700px' },
  );
  observer.observe(root);
  return () => {
    disposed = true;
    observer.disconnect();
    cleanup();
  };
}
// Kept here as exports for the state-only tests and renderer consumers.
export { clampAngle, presets, togglePath };

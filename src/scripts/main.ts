import { initMotion } from './motion';
import { initDemo } from './demo';
import { initNavigation } from './navigation';

let dispose: (() => void) | undefined;
function mount() {
  dispose?.();
  const cleanups = [initMotion(), initNavigation()];
  const demo = document.querySelector<HTMLElement>('[data-demo]');
  if (demo) cleanups.push(initDemo(demo));
  dispose = () => cleanups.forEach((cleanup) => cleanup());
}
mount();
function onPageHide() {
  dispose?.();
  dispose = undefined;
}
function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) mount();
}
window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', onPageShow);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    onPageHide();
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  });

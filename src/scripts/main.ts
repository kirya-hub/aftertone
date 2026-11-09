import { initMotion } from './motion';

let dispose: (() => void) | undefined;
function mount() { dispose?.(); dispose = initMotion(); }
mount();
function onPageHide() { dispose?.(); dispose = undefined; }
function onPageShow(event: PageTransitionEvent) { if (event.persisted) mount(); }
window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', onPageShow);
if (import.meta.hot) import.meta.hot.dispose(() => {
  onPageHide();
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
});

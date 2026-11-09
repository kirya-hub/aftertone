export function initNavigation(): () => void {
  const menu = document.querySelector<HTMLDetailsElement>('.mobile-nav');
  if (!menu) return () => {};
  const controller = new AbortController();
  const options = { signal: controller.signal };
  menu.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => { menu.open = false; }, options));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary')?.focus(); }
  }, options);
  document.addEventListener('pointerdown', event => { if (menu.open && !menu.contains(event.target as Node)) menu.open = false; }, options);
  const desktop = window.matchMedia('(min-width: 601px)');
  desktop.addEventListener('change', () => { if (desktop.matches) menu.open = false; }, options);
  return () => controller.abort();
}

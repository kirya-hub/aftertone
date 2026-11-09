import { createScene, selectSource, selectedSource, setPosition, positionLabel, positionContext, relativeCoordinate, type SourceId } from './scene-state';

export function initDemo(root: HTMLElement): () => void {
  let scene = createScene();
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const field = root.querySelector<HTMLElement>('.demo-field')!;
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-source]'));
  const selectors = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-select-source]'));
  const rangeX = root.querySelector<HTMLInputElement>('#position-x')!;
  const rangeY = root.querySelector<HTMLInputElement>('#position-y')!;
  const reset = root.querySelector<HTMLButtonElement>('.reset-scene')!;
  const announcement = root.querySelector<HTMLElement>('[data-demo-announcement]')!;
  let announceTimer: ReturnType<typeof setTimeout>;
  let frame = 0;
  let pending: { x: number; y: number } | null = null;
  let drag: { id: SourceId; pointer: number; button: HTMLButtonElement; x: number; y: number; offsetX: number; offsetY: number } | null = null;
  const text = (selector: string, value: string) => { const element = root.querySelector(selector); if (element) element.textContent = value; };
  const valueText = (axis: 'x' | 'y', value: number) => {
    const relative = relativeCoordinate(value);
    if (relative === 0) return 'Centered on the listener';
    return `${Math.abs(relative)} relative units ${axis === 'x' ? (relative < 0 ? 'left' : 'right') : (relative < 0 ? 'in front' : 'behind')} of the listener`;
  };
  function announce(message?: string) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const source = selectedSource(scene);
      announcement.textContent = message ?? `${source.name}. ${positionLabel(source.x, source.y)}. ${valueText('x', source.x)}; ${valueText('y', source.y)}.`;
    }, 180);
  }
  function render() {
    const selected = selectedSource(scene);
    buttons.forEach(button => {
      const source = scene.sources.find(item => item.id === button.dataset.source)!;
      button.style.left = `${source.x}%`; button.style.top = `${source.y}%`;
      button.setAttribute('aria-pressed', String(source.id === scene.selected));
      button.setAttribute('aria-label', `${source.name}, ${positionLabel(source.x, source.y)}. Use arrow keys to move.`);
      const line = root.querySelector(`[data-line="${source.id}"]`)!;
      line.setAttribute('x2', String(source.x * 6)); line.setAttribute('y2', String(source.y * 4.4));
      line.setAttribute('stroke-opacity', source.id === scene.selected ? '.85' : '.35');
    });
    selectors.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.selectSource === scene.selected)));
    text('[data-source-number]', selected.number); text('[data-source-name]', selected.name);
    text('[data-source-description]', selected.description);
    text('[data-position-description]', positionLabel(selected.x, selected.y));
    text('[data-position-context]', positionContext(selected.x, selected.y));
    rangeX.value = String(selected.x); rangeY.value = String(selected.y);
    rangeX.setAttribute('aria-valuetext', valueText('x', selected.x)); rangeY.setAttribute('aria-valuetext', valueText('y', selected.y));
    text('#output-x', String(relativeCoordinate(selected.x))); text('#output-y', String(relativeCoordinate(selected.y)));
  }
  function select(id: string) { scene = selectSource(scene, id); render(); }
  function update(x: number, y: number) { scene = setPosition(scene, scene.selected, x, y); render(); }
  function flushDrag() {
    frame = 0;
    if (pending && drag) { scene = setPosition(scene, drag.id, pending.x, pending.y); render(); }
    pending = null;
  }
  function endDrag(cancel = false) {
    if (!drag) return;
    cancelAnimationFrame(frame); flushDrag();
    const previous = drag; drag = null;
    if (cancel) { scene = setPosition(scene, previous.id, previous.x, previous.y); render(); }
    previous.button.classList.remove('is-dragging');
    if (previous.button.hasPointerCapture(previous.pointer)) previous.button.releasePointerCapture(previous.pointer);
    announce();
  }
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', () => { select(button.dataset.source!); announce(); }, options);
    button.addEventListener('keydown', event => {
      const changes: Record<string, [number, number]> = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
      const delta = changes[event.key];
      if (!delta) { if (event.key === 'Escape') endDrag(true); return; }
      event.preventDefault(); select(button.dataset.source!);
      const source = selectedSource(scene); const step = event.shiftKey ? 5 : 1;
      update(source.x + delta[0] * step, source.y + delta[1] * step); announce();
    }, options);
    button.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      endDrag(); select(button.dataset.source!);
      const source = selectedSource(scene); const bounds = field.getBoundingClientRect();
      drag = { id: source.id, pointer: event.pointerId, button, x: source.x, y: source.y,
        offsetX: (event.clientX - bounds.left) / bounds.width * 100 - source.x,
        offsetY: (event.clientY - bounds.top) / bounds.height * 100 - source.y };
      button.setPointerCapture(event.pointerId); button.classList.add('is-dragging');
    }, options);
    button.addEventListener('pointermove', event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      const bounds = field.getBoundingClientRect();
      pending = { x: (event.clientX - bounds.left) / bounds.width * 100 - drag.offsetX, y: (event.clientY - bounds.top) / bounds.height * 100 - drag.offsetY };
      if (!frame) frame = requestAnimationFrame(flushDrag);
    }, options);
    button.addEventListener('pointerup', () => endDrag(), options);
    button.addEventListener('pointercancel', () => endDrag(true), options);
    button.addEventListener('lostpointercapture', () => endDrag(), options);
  }
  for (const button of selectors) {
    button.disabled = false;
    button.addEventListener('click', () => { select(button.dataset.selectSource!); announce(); }, options);
  }
  root.querySelector<HTMLFieldSetElement>('[data-position-controls]')!.disabled = false;
  for (const range of [rangeX, rangeY]) range.addEventListener('input', () => { update(Number(rangeX.value), Number(rangeY.value)); announce(); }, options);
  reset.disabled = false;
  reset.addEventListener('click', () => { endDrag(); scene = createScene(); render(); announce('Scene reset. Atmosphere selected, front left of the listener.'); }, options);
  root.addEventListener('keydown', event => { if (event.key === 'Escape') endDrag(true); }, options);
  render();
  return () => {
    endDrag(); controller.abort(); cancelAnimationFrame(frame); clearTimeout(announceTimer);
    buttons.forEach(button => { button.disabled = true; }); selectors.forEach(button => { button.disabled = true; });
    root.querySelector<HTMLFieldSetElement>('[data-position-controls]')!.disabled = true; reset.disabled = true;
  };
}

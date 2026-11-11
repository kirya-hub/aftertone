import { gsap } from 'gsap';

// The approved raster owns the silhouette, glass layers and studio lighting in
// every mode. WebGL only adds a restrained, transparent light response around it.
const vertex = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * .5 + .5;
  gl_Position = vec4(aPosition, 0., 1.);
}`;
const fragment = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uPose;
void main() {
  vec2 p = (vUv - .5 - uPose * .012) * vec2(1.35, 1.);
  float halo = exp(-dot(p, p) * 13.) * smoothstep(.05, .22, length(p));
  float response = min(length(uPose), 1.) * .035;
  vec3 light = mix(vec3(.55,.28,1.), vec3(.35,.9,1.), vUv.x);
  float alpha = halo * response;
  gl_FragColor = vec4(light * alpha, alpha);
}`;

function createRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const dispose = () => {
    if (buffer) gl.deleteBuffer(buffer);
    shaders.forEach((shader) => gl.deleteShader(shader));
    if (program) gl.deleteProgram(program);
  };
  try {
    program = gl.createProgram();
    if (!program) throw new Error('WebGL program unavailable');
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('WebGL shader unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error('WebGL shader compilation failed');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('WebGL linking failed');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('WebGL buffer unavailable');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'aPosition');
    const pose = gl.getUniformLocation(program, 'uPose');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    const draw = (x = 0, y = 0) => {
      if (gl.isContextLost()) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(pose, x, y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    return { draw, dispose };
  } catch {
    dispose();
    return null;
  }
}

export function mountImmersiveHero(): () => void {
  const hero = document.querySelector<HTMLElement>('[data-immersive-hero]');
  const canvas = hero?.querySelector<HTMLCanvasElement>('[data-resonator]');
  const stage = canvas?.parentElement;
  if (!hero || !canvas || !stage) return () => {};
  const artwork = hero.querySelector<HTMLElement>('.resonator-fallback');
  if (!artwork) return () => {};
  let renderer = createRenderer(canvas);
  const media = gsap.matchMedia(),
    controller = new AbortController();
  const pose = { x: 0, y: 0 };
  const draw = () => {
    artwork.style.transform = `perspective(1000px) translate3d(${pose.x * 3}px, ${pose.y * 2}px, 0) rotateX(${-pose.y * 0.45}deg) rotateY(${pose.x * 0.6}deg)`;
    renderer?.draw(pose.x, pose.y);
  };
  const reveal = () => {
    draw();
    stage.dataset.renderer = renderer ? 'webgl' : 'fallback';
  };
  reveal();
  const resize = new ResizeObserver(draw);
  resize.observe(stage);
  const lost = (event: Event) => {
    event.preventDefault();
    stage.dataset.renderer = 'fallback';
  };
  const restored = () => {
    renderer?.dispose();
    renderer = createRenderer(canvas);
    reveal();
  };
  canvas.addEventListener('webglcontextlost', lost, { signal: controller.signal });
  canvas.addEventListener('webglcontextrestored', restored, { signal: controller.signal });
  media.add('(prefers-reduced-motion: no-preference)', () => {
    const sequence = gsap.timeline();
    if (scrollY < 100 && !location.hash) {
      sequence
        .from(
          '.immersive-content h1',
          { y: 14, opacity: 0.5, duration: 0.9, ease: 'power3.out', clearProps: 'all' },
          0.15,
        )
        .from(
          '.immersive-description, .immersive-cta, .immersive-note',
          { opacity: 0.4, y: 8, duration: 0.7, stagger: 0.08, clearProps: 'all' },
          0.4,
        );
    }
    const move = (event: PointerEvent) => {
      // Use the actual input event: headless browsers and attached mice can report
      // no primary hover capability even while sending genuine mouse events.
      if (event.pointerType !== 'mouse' || document.hidden) return;
      const rect = hero.getBoundingClientRect();
      gsap.to(pose, {
        x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2)),
        y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2)),
        duration: 0.85,
        ease: 'power2.out',
        overwrite: 'auto',
        onUpdate: draw,
      });
    };
    const leave = () =>
      gsap.to(pose, {
        x: 0,
        y: 0,
        duration: 1,
        ease: 'power2.out',
        overwrite: 'auto',
        onUpdate: draw,
      });
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => {
      sequence.kill();
      gsap.killTweensOf(pose);
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
      pose.x = 0;
      pose.y = 0;
      draw();
    };
  });
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    resize.disconnect();
    media.revert();
    artwork.style.removeProperty('transform');
    renderer?.dispose();
  };
}

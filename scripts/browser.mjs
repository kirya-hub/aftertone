// Dependency-free Firefox WebDriver + BiDi harness. Requires a running geckodriver.
import { writeFile, mkdir } from 'node:fs/promises';
export const base = process.env.AFTERTONE_URL || 'http://127.0.0.1:4173';
const driver = process.env.WEBDRIVER_URL || 'http://127.0.0.1:4445';
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export async function browser({ reduced = false, javascript = true, touch = false } = {}) {
  const response = await fetch(`${driver}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          webSocketUrl: true,
          'moz:firefoxOptions': {
            args: ['-headless'],
            prefs: {
              'ui.prefersReducedMotion': reduced ? 1 : 0,
              'javascript.enabled': javascript,
              'dom.w3c_touch_events.enabled': touch ? 1 : 2,
            },
          },
        },
      },
    }),
  });
  const created = await response.json();
  if (!created.value.sessionId) throw new Error(JSON.stringify(created));
  const id = created.value.sessionId;
  const root = `${driver}/session/${id}`;
  const logs = [];
  const ws = new WebSocket(created.value.capabilities.webSocketUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const pending = new Map();
  let nextId = 0;
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'event' && data.method === 'log.entryAdded') logs.push(data.params);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  };
  const bidi = (method, params = {}) =>
    new Promise((resolve) => {
      const commandId = ++nextId;
      pending.set(commandId, resolve);
      ws.send(JSON.stringify({ id: commandId, method, params }));
    });
  await bidi('session.subscribe', { events: ['log.entryAdded'] });
  await bidi('script.addPreloadScript', {
    functionDeclaration: `() => { window.__metrics = { lcp: null, cls: null, supported: PerformanceObserver.supportedEntryTypes }; if(PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) new PerformanceObserver(l=>{window.__metrics.lcp=l.getEntries().at(-1).startTime}).observe({type:'largest-contentful-paint',buffered:true}); if(PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {window.__metrics.cls=0;new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__metrics.cls+=e.value})).observe({type:'layout-shift',buffered:true});} }`,
  });
  async function req(path, data, method = data === undefined ? 'GET' : 'POST') {
    const r = await fetch(root + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const j = await r.json();
    if (j.value?.error) throw new Error(`${path}: ${JSON.stringify(j.value)}`);
    return j.value;
  }
  const js = (script, ...args) => req('/execute/sync', { script, args });
  async function viewport(width, height) {
    const tree = await bidi('browsingContext.getTree');
    const context = tree.result.contexts[0].context;
    const r = await bidi('browsingContext.setViewport', {
      context,
      viewport: { width, height },
      devicePixelRatio: 1,
    });
    if (r.type === 'error') throw new Error(JSON.stringify(r));
    const size = await js('return [innerWidth,innerHeight]');
    if (size[0] !== width || size[1] !== height)
      throw new Error(`Viewport mismatch: ${size} vs ${width},${height}`);
    return size;
  }
  async function shot(name) {
    await mkdir('screenshots', { recursive: true });
    await writeFile(`screenshots/${name}.png`, Buffer.from(await req('/screenshot'), 'base64'));
  }
  async function go(url = base) {
    await req('/url', { url });
    await pause(450);
    if (javascript)
      await req('/execute/async', {
        script:
          'const done=arguments[arguments.length-1];document.fonts.ready.then(()=>done(true));',
        args: [],
      });
  }
  const element = async (selector) => {
    const e = await req('/element', { using: 'css selector', value: selector });
    return Object.values(e)[0];
  };
  const click = async (selector) => req(`/element/${await element(selector)}/click`, {});
  const keys = async (selector, text) => req(`/element/${await element(selector)}/value`, { text });
  const scroll = async (selector, offset = 0) => {
    await js(
      'const e=document.querySelector(arguments[0]);window.scrollTo({top:e.getBoundingClientRect().top+scrollY+arguments[1],behavior:"instant"})',
      selector,
      offset,
    );
    await pause(500);
  };
  async function drag(selector, dx, dy, pointerType = 'mouse') {
    const r = await js(
      'const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}',
      selector,
    );
    await req('/actions', {
      actions: [
        {
          type: 'pointer',
          id: 'drag',
          parameters: { pointerType },
          actions: [
            { type: 'pointerMove', duration: 0, x: Math.round(r.x), y: Math.round(r.y) },
            { type: 'pointerDown', button: 0 },
            {
              type: 'pointerMove',
              duration: 500,
              x: Math.round(r.x + dx),
              y: Math.round(r.y + dy),
            },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
    await req('/actions', undefined, 'DELETE');
  }
  return {
    req,
    js,
    viewport,
    shot,
    go,
    element,
    click,
    keys,
    scroll,
    drag,
    logs,
    bidi,
    async close() {
      ws.close();
      await req('', undefined, 'DELETE');
    },
  };
}

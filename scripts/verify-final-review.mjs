// Local production verification with installed Firefox, no security overrides.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { realpath, access, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';

const phase = process.argv.includes('--navigation')
  ? 'navigation'
  : process.argv.includes('--probe')
    ? 'probe'
    : process.argv.includes('--supplement')
      ? 'supplement'
      : 'browser';
const report = {
  date: new Date().toISOString(),
  status: 'running',
  checks: [],
  screenshots: [],
  errors: [],
  consoleErrors: [],
  logs: [],
};
const children = [];
let active;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function port() {
  const s = createServer();
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function binary(name) {
  const override = name === 'firefox' ? process.env.FIREFOX_BINARY : process.env.GECKODRIVER_BINARY;
  if (override) return realpath(override);
  const direct = `/snap/firefox/current/usr/lib/firefox/${name}`;
  try {
    await access(direct);
    return realpath(direct);
  } catch {}
  return realpath(execFileSync('which', [name], { encoding: 'utf8' }).trim());
}
function start(command, args, label) {
  const child = spawn(command, args, {
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  for (const s of [child.stdout, child.stderr])
    s.on('data', (d) => {
      report.logs.push({ label, output: String(d).slice(-1500) });
      if (report.logs.length > 60) report.logs.shift();
    });
  child.on('error', (e) => report.errors.push(`${label}: ${e}`));
  return child;
}
async function ready(url, child) {
  for (let n = 0; n < 40; n++) {
    if (child.exitCode !== null || child.signalCode) throw new Error(`Process exited: ${url}`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(400) })).ok) return;
    } catch {}
    await pause(250);
  }
  throw new Error(`Readiness timeout: ${url}`);
}
async function stop() {
  clearTimeout(deadline);
  if (active) await active.close().catch(() => {});
  active = null;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode) continue;
    const ended = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([ended, pause(2000)]);
    if (child.exitCode === null && !child.signalCode) {
      child.kill('SIGKILL');
      await Promise.race([ended, pause(1000)]);
    }
  }
  await mkdir('docs/final-review', { recursive: true });
  await writeFile(
    `docs/final-review/${phase}-results.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
}
const deadline = setTimeout(() => {
  report.status = 'failed';
  report.errors.push('Outer 540-second deadline exceeded');
  stop().finally(() => process.exit(1));
}, 540000);
const probe = process.argv.includes('--probe');
const chapters = ['main', 'approach', 'experience', 'demo', 'common-ground', 'afterglow'];
const viewports = [
  [1440, 900],
  [1280, 900],
  [768, 1024],
  [390, 844],
  [360, 800],
];
report.layouts = [];
report.resources = [];
report.contrastFrames = [];
async function check(name, fn) {
  try {
    const evidence = await fn();
    report.checks.push({ name, status: 'passed', ...(evidence === undefined ? {} : { evidence }) });
  } catch (e) {
    report.checks.push({ name, status: 'failed', error: e.stack });
    report.errors.push(`${name}: ${e.message}`);
    console.error(`FAILED ${name}: ${e.message}`);
  }
}
async function shot(b, name) {
  await b.shot(`final-review/${name}`);
  const path = `screenshots/final-review/${name}.png`;
  report.screenshots.push(path);
  return path;
}
async function settle() {
  await pause(1200);
}
async function imageReady(b) {
  // Poll synchronously: Promise microtasks do not run with page JavaScript disabled.
  for (let n = 0; n < 30; n++) {
    if (
      await b.js(
        'return [...document.images].filter(i=>i.getBoundingClientRect().bottom>0&&i.getBoundingClientRect().top<innerHeight).every(i=>i.complete&&i.naturalWidth>0)',
      )
    )
      return;
    await pause(150);
  }
  throw new Error('Visible image loading timeout');
}
async function inspect(b, label) {
  const layout = await b.js(`
    const rect=e=>{const r=e instanceof Element?e.getBoundingClientRect():e;return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
    const textRects=e=>{const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),out=[];let n;while(n=walker.nextNode()){if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);out.push(...[...range.getClientRects()].map(rect));}return out};
    const pairs=[...document.querySelectorAll('.chapter-heading')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).map(e=>({title:textRects(e.querySelector('h2')),copy:textRects(e.querySelector('p'))}));
    return {viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,overlaps:pairs.filter(p=>p.title.some(t=>p.copy.some(c=>overlap(t,c)))),visibleBrokenImages:[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&(!i.complete||!i.naturalWidth)}).map(i=>i.currentSrc),runtime:document.querySelector('[data-journey]').dataset.runtime,fonts:document.fonts.status};`);
  report.layouts.push({ label, ...layout });
  assert.equal(layout.overflow, false, `${label}: horizontal overflow`);
  assert.deepEqual(layout.overlaps, [], `${label}: heading/copy overlap`);
  assert.deepEqual(layout.visibleBrokenImages, [], `${label}: visible images loaded`);
  assert.equal(layout.fonts, 'loaded');
}
async function controls(b, w) {
  await b.scroll('#demo .scene-slot', -90);
  await b.drag('[data-scene=perspective]', 60, 0);
  assert.notEqual(await b.js('return document.querySelector("output").textContent'), '0°');
  await b.click('[data-preset="1"]');
  assert.equal(await b.js('return document.querySelector("output").textContent'), '48°');
  await b.click('[data-reset]');
  await b.keys('input[type=range]', '\uE014');
  assert.equal(await b.js('return document.querySelector("output").textContent'), '1°');
  await b.keys('input[type=range]', '\uE010');
  assert.equal(await b.js('return document.querySelector("output").textContent'), '65°');
  await b.keys('input[type=range]', '\uE011');
  assert.equal(await b.js('return document.querySelector("output").textContent'), '-65°');
  await b.click('[data-reset]');
  await b.keys('[data-preset="2"]', '\uE007');
  assert.equal(await b.js('return document.querySelector("output").textContent'), '-28°');
  await shot(b, `${w}-keyboard-controls`);
  await b.click('[data-reset]');
  await b.scroll('#common-ground .path-controls', -200);
  for (const n of [0, 1, 2]) {
    await b.click(`[data-path="${n}"]`);
    assert.equal(
      await b.js(
        'return [...document.querySelectorAll("[data-path]")].filter(b=>b.getAttribute("aria-pressed")==="true").length',
      ),
      1,
    );
  }
  await b.keys('[data-path="2"]', ' ');
  assert.equal(
    await b.js('return document.querySelectorAll("[data-path]")[2].getAttribute("aria-pressed")'),
    'false',
  );
}
async function resources(b, label) {
  const data = await b.js(
    'return {brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),failed:performance.getEntriesByType("resource").filter(r=>r.responseStatus>=400).map(r=>({url:r.name,status:r.responseStatus})),entries:performance.getEntriesByType("resource").length}',
  );
  report.resources.push({ label, ...data });
  assert.deepEqual(data.brokenImages, []);
  assert.deepEqual(data.failed, []);
}
async function lossProbe(b) {
  await b.scroll('#demo .scene-slot', -100);
  await settle();
  await b.click('[data-preset="1"]');
  await b.js(
    'window.reviewLoss=document.querySelector(".journey-canvas").getContext("webgl2").getExtension("WEBGL_lose_context");reviewLoss.loseContext()',
  );
  await pause(400);
  assert.equal(
    await b.js('return document.querySelector("[data-journey]").dataset.runtime'),
    'fallback',
  );
  const initial = await b.js(
    'return {poster:document.querySelector("[data-scene=perspective] img").currentSrc,pressed:[...document.querySelectorAll("[data-preset]")].map(b=>b.getAttribute("aria-pressed"))}',
  );
  report.lossInitial = initial;
  await b.click('[data-preset="2"]');
  const state = await b.js(
    'return {angle:document.querySelector("output").textContent,range:document.querySelector("input[type=range]").value,poster:document.querySelector("[data-scene=perspective] img").currentSrc,pressed:[...document.querySelectorAll("[data-preset]")].map(b=>b.getAttribute("aria-pressed"))}',
  );
  report.lossFallback = state;
  await shot(b, 'context-lost-preset');
  await b.js('reviewLoss.restoreContext()');
  await pause(1000);
  assert.equal(
    await b.js('return document.querySelector("[data-journey]").dataset.runtime'),
    'webgl',
  );
  const restored = await b.js(
    'return {angle:document.querySelector("output").textContent,pressed:[...document.querySelectorAll("[data-preset]")].map(b=>b.getAttribute("aria-pressed")),poster:document.querySelector("[data-scene=perspective] img").currentSrc}',
  );
  report.lossRestored = restored;
  // Fallback presets must not mutate live renderer state through old listeners.
  assert.equal(state.angle, '-28°', 'Fallback angle matches the selected poster');
  assert.deepEqual(
    restored.pressed,
    ['false', 'false', 'true'],
    'Restored pressed state matches restored camera',
  );
  assert.ok(
    initial.poster.includes('within.webp'),
    'Initial fallback poster matches Within selection',
  );
  await b.click('[data-reset]');
  await b.js('reviewLoss.loseContext()');
  await pause(400);
  assert.ok(
    (
      await b.js('return document.querySelector("[data-scene=perspective] img").currentSrc')
    ).includes('perspective.webp'),
    'Repeated loss poster matches reset Front selection',
  );
  await b.js('reviewLoss.restoreContext()');
  await pause(700);
  await shot(b, 'context-restored');
}
async function fullPage(b, w) {
  // Fixed canvas only covers the viewport. Full documents explicitly show exported posters.
  await b.js(
    'window.reviewLive=[...document.querySelectorAll("[data-live]")];reviewLive.forEach(e=>e.removeAttribute("data-live"));document.querySelector(".journey-canvas").style.visibility="hidden";window.scrollTo({top:0,behavior:"instant"})',
  );
  await pause(300);
  await b.js(
    'document.querySelectorAll("[data-live]").forEach(e=>e.removeAttribute("data-live"));document.querySelector(".journey-canvas").style.visibility="hidden";[...document.images].forEach(i=>i.loading="eager")',
  );
  await b.req('/execute/async', {
    script:
      'const done=arguments[arguments.length-1];Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>done(true))',
    args: [],
  });
  const tree = await b.bidi('browsingContext.getTree');
  const result = await b.bidi('browsingContext.captureScreenshot', {
    context: tree.result.contexts[0].context,
    origin: 'document',
  });
  assert.ok(result.result?.data, JSON.stringify(result));
  const path = `screenshots/final-review/full-${w}.png`;
  await mkdir('screenshots/final-review', { recursive: true });
  await writeFile(path, Buffer.from(result.result.data, 'base64'));
  report.screenshots.push(path);
  const sections = await b.js(
    'return [document.querySelector(".header"),document.querySelector(".immersive-hero"),...document.querySelectorAll(".chapter")].map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.classList[0],x:0,y:r.y+scrollY,width:innerWidth,height:r.height}})',
  );
  report.fullPages ??= [];
  report.fullPages.push({
    width: w,
    path,
    mode: 'exported posters; live artwork in separate viewport captures',
    sections,
  });
  await b.go();
}
async function navigation(b, w) {
  await b.go();
  if (w < 601) {
    await b.click('.mobile-nav summary');
    await b.keys('.mobile-nav summary', '\uE00C');
    assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), false);
    assert.equal(await b.js('return document.activeElement.matches(".mobile-nav summary")'), true);
    await b.click('.mobile-nav summary');
    await shot(active, `${w}-menu`);
    await b.click('.mobile-nav a[href="#demo"]');
    assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), false);
  } else {
    await b.click('.desktop-nav a[href="#experience"]');
  }
  await pause(1100);
  const id = w < 601 ? '#demo' : '#experience';
  assert.equal(await b.js('return location.hash'), id);
  assert.ok(
    Math.abs(
      await b.js('return document.querySelector(arguments[0]).getBoundingClientRect().top', id),
    ) < 80,
  );
  await b.scroll('#afterglow .exhibition-footer', -150);
  await b.click('.exhibition-footer a[href="#main"]');
  await pause(1100);
  assert.equal(await b.js('return location.hash'), '#main');
  assert.ok(
    Math.abs(await b.js('return document.querySelector("#main").getBoundingClientRect().top')) < 80,
  );
  await b.keys('.skip-link', '\uE007');
  assert.equal(await b.js('return document.activeElement.id'), 'main');
  await b.click('.immersive-cta');
  await pause(1100);
  assert.equal(await b.js('return location.hash'), '#demo');
  await b.go();
  for (const a of await b.js(
    'return [...document.querySelectorAll("a[href]")].filter(a=>a.getAttribute("href").startsWith("#")).map(a=>a.hash).filter(h=>h.length>1)',
  ))
    assert.ok(await b.js('return Boolean(document.querySelector(arguments[0]))', a));
}
async function supplemental(b) {
  report.textSamples = [];
  report.httpResources = [];
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    await b.viewport(w, h);
    await b.go();
    await settle();
    for (const id of chapters) {
      await b.scroll('#' + id);
      await settle();
      await imageReady(b);
      const samples = await b.js(`
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];let n;
        while(n=walker.nextNode()) {
          const el=n.parentElement;if(!el||!n.textContent.trim()||el.closest('script,style,[aria-hidden=true]'))continue;
          const style=getComputedStyle(el);if(style.visibility==='hidden'||style.display==='none')continue;
          const range=document.createRange();range.selectNodeContents(n);
          for(const r of range.getClientRects()) if(r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth)
            out.push({text:n.textContent.trim(),fg:style.color,threshold:parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.667&&parseFloat(style.fontWeight)>=700)?3:4.5,rect:[r.x,r.y,r.width,r.height]});
        }return out;`);
      const stem = `final-review/contrast-${w}-${id}`;
      await shot(b, `contrast-${w}-${id}`);
      await b.js(
        `const style=document.createElement('style');style.id='review-text-hide';style.textContent='body * {color:transparent!important;text-shadow:none!important}';document.head.append(style)`,
      );
      await shot(b, `contrast-${w}-${id}-background`);
      await b.js('document.querySelector("#review-text-hide").remove()');
      report.textSamples.push({ stem, samples });
    }
    for (const id of chapters.slice(1)) {
      await b.scroll('#' + id, -Math.round(h * 0.6));
      await settle();
      await inspect(b, `transition-${w}-${id}`);
      await shot(b, `transition-${w}-${id}`);
    }
    await check(`HTTP assets ${w}`, async () => {
      const statuses = await b.req('/execute/async', {
        script:
          'const done=arguments[arguments.length-1];Promise.all([...new Set(performance.getEntriesByType("resource").map(e=>e.name).filter(u=>u.startsWith(location.origin)))].map(async url=>{try{const r=await fetch(url);return {url:new URL(url).pathname,status:r.status}}catch(e){return {url,error:String(e)}}})).then(done)',
        args: [],
      });
      report.httpResources.push({ w, statuses });
      assert.ok(statuses.length > 10);
      assert.ok(statuses.every((e) => e.status === 200));
    });
    await check(`Every primary navigation link ${w}`, async () => {
      await b.go();
      const selector = w < 601 ? '.mobile-nav nav a' : '.desktop-nav a';
      const hrefs = await b.js(
        'return [...document.querySelectorAll(arguments[0])].map(a=>a.getAttribute("href"))',
        selector,
      );
      for (const href of hrefs) {
        await b.js('window.scrollTo({top:0,behavior:"instant"})');
        await pause(300);
        if (w < 601) await b.click('.mobile-nav summary');
        await b.click(`${selector}[href="${href}"]`);
        await pause(1100);
        assert.equal(await b.js('return location.hash'), href);
        assert.ok(
          Math.abs(
            await b.js(
              'return document.querySelector(arguments[0]).getBoundingClientRect().top',
              href,
            ),
          ) < 80,
        );
      }
      await b.scroll('#afterglow .exhibition-footer', -150);
      await b.click('.exhibition-footer a[href="#demo"]');
      await pause(1100);
      assert.equal(await b.js('return location.hash'), '#demo');
    });
    console.log(`Supplement ${w} completed`);
  }
  await check('Hero context loss and restoration', async () => {
    await b.viewport(1440, 900);
    await b.go();
    await settle();
    await b.js(
      'window.heroLoss=document.querySelector("[data-resonator]").getContext("webgl").getExtension("WEBGL_lose_context");heroLoss.loseContext()',
    );
    await pause(400);
    assert.equal(
      await b.js('return document.querySelector(".resonator-stage").dataset.renderer'),
      'fallback',
    );
    await shot(b, 'hero-context-lost');
    await b.js('heroLoss.restoreContext()');
    await pause(700);
    assert.equal(
      await b.js('return document.querySelector(".resonator-stage").dataset.renderer'),
      'webgl',
    );
    await shot(b, 'hero-context-restored');
  });
  await check('Cold deep link to interactive chapter', async () => {
    await b.go(process.env.AFTERTONE_URL + '/#demo');
    await settle();
    assert.equal(
      await b.js('return document.querySelector("[data-journey]").dataset.runtime'),
      'webgl',
    );
    await b.click('[data-preset="1"]');
    assert.equal(await b.js('return document.querySelector("output").textContent'), '48°');
  });
  report.consoleErrors = b.logs.filter((e) => e.level === 'error');
  await check('Supplement console', () => assert.deepEqual(report.consoleErrors, []));
}

try {
  const p = await port(),
    d = await port();
  const [firefox, gecko] = await Promise.all([binary('firefox'), binary('geckodriver')]);
  process.env.FIREFOX_BINARY = firefox;
  process.env.AFTERTONE_URL = `http://127.0.0.1:${p}`;
  process.env.WEBDRIVER_URL = `http://127.0.0.1:${d}`;
  report.binaries = { firefox, gecko };
  const server = start(
    process.execPath,
    [
      'node_modules/astro/bin/astro.mjs',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(p),
      '--ignore-lock',
    ],
    'preview',
  );
  const driver = start(
    gecko,
    ['--host', '127.0.0.1', '--port', String(d), '--websocket-port', String(await port())],
    'geckodriver',
  );
  await Promise.all([
    ready(process.env.AFTERTONE_URL, server),
    ready(`${process.env.WEBDRIVER_URL}/status`, driver),
  ]);
  const { browser } = await import('./browser.mjs');
  active = await browser({ touch: true });
  report.browser = active.capabilities.browserVersion;
  await active.viewport(1440, 900);
  await active.go();
  await active.scroll('#approach');
  await settle();
  assert.equal(
    await active.js('return document.querySelector("[data-journey]").dataset.runtime'),
    'webgl',
  );
  if (process.argv.includes('--navigation')) {
    for (const [w, h] of viewports) {
      await active.viewport(w, h);
      await active.go();
      await settle();
      await check(`${w} navigation`, () => navigation(active, w));
    }
    report.consoleErrors = active.logs.filter((e) => e.level === 'error');
    await check('Navigation console', () => assert.deepEqual(report.consoleErrors, []));
  } else if (process.argv.includes('--supplement')) {
    await supplemental(active);
  } else if (probe) {
    await check('Context loss, fallback preset, restoration', () => lossProbe(active));
  } else {
    for (const [w, h] of viewports) {
      await active.viewport(w, h);
      await active.go();
      await settle();
      for (const id of chapters) {
        await active.scroll('#' + id);
        await settle();
        await imageReady(active);
        await check(`${w} ${id} layout`, () => inspect(active, `${w}-${id}`));
        await shot(active, `${w}-${id}`);
        if (id !== 'main') {
          await active.scroll(`#${id} .scene-slot`, -50);
          await settle();
          await imageReady(active);
          await shot(active, `${w}-${id}-scene`);
        }
      }
      await check(`${w} resource loading`, () => resources(active, String(w)));
      await check(`${w} mouse and keyboard controls`, () => controls(active, w));
      await check(`${w} navigation`, () => navigation(active, w));
      if (w === 1440 || w === 390) {
        for (const id of chapters) {
          await active.scroll('#' + id);
          await settle();
        }
        await fullPage(active, w);
      }
      console.log(`Viewport ${w}x${h} completed`);
    }
    await check('Touch perspective drag and vertical pan', async () => {
      await active.viewport(390, 844);
      await active.go();
      await active.scroll('#demo .scene-slot', -100);
      await settle();
      await active.drag('[data-scene=perspective]', 70, 0, 'touch');
      assert.notEqual(await active.js('return document.querySelector("output").textContent'), '0°');
      await shot(active, 'touch-drag');
      const angle = await active.js('return document.querySelector("output").textContent'),
        y = await active.js('return scrollY');
      await active.drag('[data-scene=perspective]', 0, -130, 'touch');
      assert.equal(
        await active.js('return document.querySelector("output").textContent'),
        angle,
        'Vertical gesture does not rotate',
      );
      return {
        horizontal: 'passed',
        verticalScrollDelta: (await active.js('return scrollY')) - y,
        touchAction: await active.js(
          'return getComputedStyle(document.querySelector("[data-scene=perspective]")).touchAction',
        ),
      };
    });
    await check('Context loss, fallback preset, restoration', () => lossProbe(active));
    await check('Scroll-driven Chamber and idle renderer', async () => {
      await active.viewport(1440, 900);
      await active.go();
      await active.scroll('#experience .scene-track', 100);
      await settle();
      await shot(active, 'chamber-scroll-start');
      await active.scroll('#experience .scene-track', 500);
      await settle();
      await shot(active, 'chamber-scroll-end');
      const before = await active.js(
        'return document.querySelector("[data-journey]").exhibitionStats.draws',
      );
      await pause(800);
      assert.equal(
        await active.js('return document.querySelector("[data-journey]").exhibitionStats.draws'),
        before,
      );
      const cadence = await active.req('/execute/async', {
        script:
          'const done=arguments[arguments.length-1],start=performance.now(),y=scrollY,dt=[];let last=start;function tick(t){dt.push(t-last);last=t;scrollTo(0,y+Math.sin((t-start)/800)*90);if(t-start<4000)requestAnimationFrame(tick);else{dt.shift();dt.sort((a,b)=>a-b);done({samples:dt.length,median:dt[Math.floor(dt.length*.5)],p95:dt[Math.floor(dt.length*.95)]})}}requestAnimationFrame(tick)',
        args: [],
      });
      const gpu = await active.js(
        'return {backend:document.querySelector("[data-journey]").dataset.backend,resolutionScale:document.querySelector("[data-journey]").dataset.resolutionScale}',
      );
      return { cadence, gpu };
    });
    report.consoleErrors.push(...active.logs.filter((e) => e.level === 'error'));
    await active.close();
    active = null;
    for (const mode of ['reduced', 'fallback', 'no-js']) {
      active = await browser({ reduced: mode === 'reduced', javascript: mode !== 'no-js' });
      if (mode === 'fallback')
        await active.bidi('script.addPreloadScript', {
          functionDeclaration:
            '()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==="webgl"||kind==="webgl2"?null:get.call(this,kind,...args)}}',
        });
      for (const [w, h] of [
        [1440, 900],
        [390, 844],
        [360, 800],
      ]) {
        await active.viewport(w, h);
        await active.go();
        await settle();
        await check(`${mode} ${w} Hero`, async () => {
          assert.equal(
            await active.js('return matchMedia("(prefers-reduced-motion:reduce)").matches'),
            mode === 'reduced',
          );
          assert.equal(
            await active.js('return document.querySelector(".resonator-stage").dataset.renderer'),
            mode === 'reduced' ? 'webgl' : 'fallback',
          );
          if (mode === 'reduced') {
            const before = await active.js(
              'return document.querySelector(".resonator-fallback").style.transform',
            );
            await active.req('/actions', {
              actions: [
                {
                  type: 'pointer',
                  id: 'mouse',
                  parameters: { pointerType: 'mouse' },
                  actions: [{ type: 'pointerMove', duration: 100, x: w - 40, y: 200 }],
                },
              ],
            });
            await pause(1100);
            assert.equal(
              await active.js(
                'return document.querySelector(".resonator-fallback").style.transform',
              ),
              before,
            );
          }
          await imageReady(active);
          await inspect(active, `${mode}-${w}-main`);
          await shot(active, `${mode}-${w}-main`);
        });
        for (const id of chapters.slice(1)) {
          await active.scroll('#' + id);
          await settle();
          await imageReady(active);
          await check(`${mode} ${w} ${id}`, async () => {
            await inspect(active, `${mode}-${w}-${id}`);
            if (mode === 'fallback')
              assert.equal(
                await active.js('return document.querySelector("[data-journey]").dataset.runtime'),
                'fallback',
              );
            await shot(active, `${mode}-${w}-${id}`);
          });
        }
        if (mode === 'fallback')
          await check(`Fallback ${w} presets`, async () => {
            await active.scroll('#demo');
            for (const n of [1, 2, 0]) {
              await active.click(`[data-preset="${n}"]`);
              await imageReady(active);
              assert.ok(
                (
                  await active.js(
                    'return document.querySelector("[data-scene=perspective] img").currentSrc',
                  )
                ).includes(['perspective', 'within', 'above'][n] + '.webp'),
              );
            }
          });
        if (mode === 'reduced') await check(`Reduced ${w} controls`, () => controls(active, w));
        await check(`${mode} ${w} resources`, () => resources(active, `${mode}-${w}`));
      }
      report.consoleErrors.push(...active.logs.filter((e) => e.level === 'error'));
      await active.close();
      active = null;
      console.log(`Mode ${mode} completed`);
    }
    await check('No page console errors', () => assert.deepEqual(report.consoleErrors, []));
    active = await browser();
    await active.viewport(1440, 900);
    for (const route of [
      '/archive/',
      '/hero-comparison/a/',
      '/hero-comparison/b/',
      '/hero-directions/immersive-experience/',
    ])
      await check(`Route ${route}`, async () => {
        await active.go(process.env.AFTERTONE_URL + route);
        assert.equal(await active.js('return document.querySelectorAll("h1").length'), 1);
      });
    await active.close();
    active = null;
  }
  report.status = report.errors.length ? 'failed' : 'passed';
  if (report.errors.length) process.exitCode = 1;
} catch (e) {
  report.status = 'failed';
  report.errors.push(e.stack || String(e));
  process.exitCode = 1;
} finally {
  await stop();
}
console.log(
  JSON.stringify(
    { status: report.status, checks: report.checks.length, errors: report.errors },
    null,
    2,
  ),
);

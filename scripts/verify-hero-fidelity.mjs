// Local production verification with installed Firefox, no security overrides.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { realpath, access, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';

const phase = process.argv.includes('--before') ? 'before' : 'after';
const details = process.argv.includes('--details');
const sizes = [
  [1440, 900],
  [390, 844],
  [360, 800],
];
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
  await mkdir('docs/hero-fidelity', { recursive: true });
  await writeFile(
    `docs/hero-fidelity/${details ? 'details' : phase}-results.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
}
const deadline = setTimeout(() => {
  report.status = 'failed';
  report.errors.push('Outer 300-second deadline exceeded');
  stop().finally(() => process.exit(1));
}, 300000);
async function shot(b, name) {
  await b.shot(`hero-fidelity/${details ? 'details' : phase}-${name}`);
  report.screenshots.push(`screenshots/hero-fidelity/${details ? 'details' : phase}-${name}.png`);
}
async function inspect(b, w, h, { renderer = 'webgl', reduced = false } = {}) {
  const data = await b.js(`
 const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
 const fits=r=>r.x>=-1&&r.right<=innerWidth+1;
 const hero=rect('.immersive-hero'),header=rect('.header'),kicker=rect('.scene-kicker'),title=rect('h1'),copy=rect('.immersive-description'),action=rect('.immersive-cta'),note=rect('.immersive-note'),footer=rect('.immersive-footer');
 const aside=[...document.querySelectorAll('.scene-aside')].filter(e=>getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}});
 return {size:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,h1:document.querySelectorAll('h1').length,
 renderer:document.querySelector('.resonator-stage').dataset.renderer,reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,
 images:[...document.querySelectorAll(".immersive-hero img")].every(i=>i.complete&&i.naturalWidth>0),fonts:document.fonts.status,failedResources:performance.getEntriesByType('resource').filter(r=>r.responseStatus>=400).map(r=>r.name),
 fits:[title,copy,action,note,footer].every(fits),ordered:header.bottom<=kicker.y&&kicker.bottom<title.y&&title.bottom<=copy.y&&copy.bottom<=action.y&&action.bottom<=note.y&&note.bottom<=footer.y,
 asideClear:aside.every(r=>r.bottom<=title.y||r.right<=title.x||r.x>=title.right),actionVisible:action.bottom<=innerHeight,footerVisible:footer.bottom<=innerHeight+1,
 hero,header,kicker,title,copy,action,note,footer,cls:window.__metrics?.cls};`);
  assert.deepEqual(data.size, [w, h]);
  assert.equal(data.overflow, false, 'No horizontal overflow');
  assert.equal(data.h1, 1);
  assert.equal(data.renderer, renderer);
  assert.equal(data.reduced, reduced);
  assert.equal(data.images, true);
  assert.equal(data.fonts, 'loaded');
  assert.deepEqual(data.failedResources, []);
  assert.equal(data.fits, true, 'Text and controls fit');
  assert.equal(data.ordered, true, 'Content does not overlap');
  assert.equal(data.asideClear, true);
  assert.equal(data.actionVisible, true);
  if (w !== 1280) assert.equal(data.footerVisible, true);
  return data;
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
  const driver = start(gecko, ['--host', '127.0.0.1', '--port', String(d)], 'geckodriver');
  await Promise.all([
    ready(process.env.AFTERTONE_URL, server),
    ready(`${process.env.WEBDRIVER_URL}/status`, driver),
  ]);
  const { browser } = await import('./browser.mjs');

  const url = process.env.AFTERTONE_URL + '/';
  for (const mode of details
    ? ['webgl']
    : phase === 'before'
      ? ['webgl', 'fallback']
      : ['webgl', 'fallback', 'reduced', 'no-js']) {
    const b = (active = await browser({
      reduced: mode === 'reduced',
      javascript: mode !== 'no-js',
    }));
    try {
      if (mode === 'fallback')
        await b.bidi('script.addPreloadScript', {
          functionDeclaration: `()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind==='webgl'||kind==='webgl2')return null;return original.call(this,kind,...args)}}`,
        });
      for (const [w, h] of sizes) {
        await b.viewport(w, h);
        await b.go(url);
        await pause(1900);
        const contentGeometry = () =>
          b.js(
            'return [...document.querySelectorAll(".immersive-content,.immersive-footer")].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})',
          );
        const geometry = await contentGeometry();
        const layout = await inspect(b, w, h, {
          renderer: ['fallback', 'no-js'].includes(mode) ? 'fallback' : 'webgl',
          reduced: mode === 'reduced',
        });
        await shot(b, `${mode}-${w}x${h}`);
        if (phase === 'after' && mode !== 'no-js') {
          const transform = await b.js(
            'return getComputedStyle(document.querySelector(".resonator-fallback")).transform',
          );
          const canvas = await b.js(
            'return document.querySelector("[data-resonator]").toDataURL()',
          );
          await b.req('/actions', {
            actions: [
              {
                type: 'pointer',
                id: 'mouse',
                parameters: { pointerType: 'mouse' },
                actions: [{ type: 'pointerMove', duration: 150, x: Math.round(w * 0.8), y: 200 }],
              },
            ],
          });
          await pause(1100);
          const changed = await b.js(
            'return getComputedStyle(document.querySelector(".resonator-fallback")).transform',
          );
          if (mode === 'reduced') {
            assert.equal(transform, changed, 'Reduced motion image stays static');
            assert.equal(
              canvas,
              await b.js('return document.querySelector("[data-resonator]").toDataURL()'),
            );
          } else {
            assert.notEqual(transform, changed, 'Mouse moves artwork');
            if (mode === 'webgl')
              assert.notEqual(
                canvas,
                await b.js('return document.querySelector("[data-resonator]").toDataURL()'),
                'WebGL light response',
              );
            await shot(b, `${mode}-pointer-${w}x${h}`);
            // Touch input must not rotate the artwork.
            await b.js(
              'document.querySelector("[data-immersive-hero]").dispatchEvent(new PointerEvent("pointerleave"))',
            );
            await pause(1100);
            const neutral = await b.js(
              'return getComputedStyle(document.querySelector(".resonator-fallback")).transform',
            );
            await b.js(
              'document.querySelector("[data-immersive-hero]").dispatchEvent(new PointerEvent("pointermove",{pointerType:"touch",clientX:20,clientY:200}))',
            );
            await pause(200);
            assert.equal(
              neutral,
              await b.js(
                'return getComputedStyle(document.querySelector(".resonator-fallback")).transform',
              ),
            );
          }
          assert.deepEqual(
            await contentGeometry(),
            geometry,
            'Interaction preserves content layout',
          );
          const idleImage = await b.js(
            'return document.querySelector(".resonator-fallback").style.transform',
          );
          const idleCanvas = await b.js(
            'return document.querySelector("[data-resonator]").toDataURL()',
          );
          await pause(300);
          assert.equal(
            await b.js('return document.querySelector(".resonator-fallback").style.transform'),
            idleImage,
            'Artwork rests without input',
          );
          assert.equal(
            await b.js('return document.querySelector("[data-resonator]").toDataURL()'),
            idleCanvas,
            'Light stays still without input',
          );
          await b.click('.immersive-cta');
          await pause(1000);
          assert.equal(await b.js('return location.hash'), '#demo');
          assert.ok(
            Math.abs(
              await b.js('return document.querySelector("#demo").getBoundingClientRect().top'),
            ) < 70,
          );
        }
        report.checks.push({ mode, w, h, result: 'passed', layout });
      }
      if (phase === 'after' && mode === 'webgl') {
        await b.viewport(1440, 900);
        await b.go(url);
        await pause(1900);
        await b.js(
          'window.__loss=document.querySelector("[data-resonator]").getContext("webgl").getExtension("WEBGL_lose_context");window.__loss.loseContext()',
        );
        await pause(250);
        assert.equal(
          await b.js('return document.querySelector(".resonator-stage").dataset.renderer'),
          'fallback',
        );
        await shot(b, 'context-lost');
        await b.js('window.__loss.restoreContext()');
        await pause(700);
        assert.equal(
          await b.js('return document.querySelector(".resonator-stage").dataset.renderer'),
          'webgl',
        );
        report.checks.push({ test: 'context loss/restore', result: 'passed' });
      }
      report.consoleErrors.push(...b.logs.filter((l) => l.level === 'error'));
      assert.equal(report.consoleErrors.length, 0, 'No console errors');
    } finally {
      await b.close();
      active = null;
    }
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.errors.push(error.stack || String(error));
  process.exitCode = 1;
} finally {
  await stop();
}
console.log(
  JSON.stringify({
    phase,
    status: report.status,
    checks: report.checks.length,
    errors: report.errors,
  }),
);

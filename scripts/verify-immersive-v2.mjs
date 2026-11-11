// Local production verification with installed Firefox, no security overrides.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { realpath, access, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';

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
  await mkdir('docs/immersive-v2', { recursive: true });
  await writeFile('docs/immersive-v2/browser-results.json', JSON.stringify(report, null, 2) + '\n');
}
const deadline = setTimeout(() => {
  report.status = 'failed';
  report.errors.push('Outer 300-second deadline exceeded');
  stop().finally(() => process.exit(1));
}, 300000);
async function shot(b, name) {
  await b.shot(`immersive-v2/${name}`);
  report.screenshots.push(`screenshots/immersive-v2/${name}.png`);
}
async function inspect(b, w, h, { renderer = 'webgl', reduced = false } = {}) {
  const data = await b.js(`
 const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
 const fits=r=>r.x>=-1&&r.right<=innerWidth+1;
 const hero=rect('.immersive-hero'),header=rect('.header'),kicker=rect('.scene-kicker'),title=rect('h1'),copy=rect('.immersive-description'),action=rect('.immersive-cta'),note=rect('.immersive-note'),footer=rect('.immersive-footer');
 const aside=[...document.querySelectorAll('.scene-aside')].filter(e=>getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}});
 return {size:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,h1:document.querySelectorAll('h1').length,
 renderer:document.querySelector('.resonator-stage').dataset.renderer,reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,
 images:[...document.images].every(i=>i.complete&&i.naturalWidth>0),fonts:document.fonts.status,failedResources:performance.getEntriesByType('resource').filter(r=>r.responseStatus>=400).map(r=>r.name),
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
const contrasts = [];
async function captureContrast(b, label, foregroundScreenshot) {
  const data =
    await b.js(`const selectors=['.header .brand > span','.desktop-nav a','.header-cta','.scene-kicker > span','.scene-aside .micro','.scene-aside p','.axis-mark span','.immersive-content h1 > span','.immersive-content h1 em','.immersive-description','.immersive-cta','.immersive-note','.immersive-footer a','.immersive-footer > span'];
 const result=[];
 for(const selector of selectors)for(const element of document.querySelectorAll(selector)){if(!element.getClientRects().length)continue;const style=getComputedStyle(element);const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;const rects=[];while(node=walker.nextNode()){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);for(const r of range.getClientRects())if(r.width&&r.height)rects.push({x:r.x,y:r.y,w:r.width,h:r.height});}if(rects.length)result.push({selector,color:style.color,fontSize:style.fontSize,fontWeight:style.fontWeight,rects});}
 const style=document.createElement('style');style.id='contrast-hide';style.textContent='${'.immersive-hero *, .header *'} {color:transparent!important;text-shadow:none!important;transition:none!important;}';document.head.append(style);return result;`);
  await pause(100);
  await shot(b, `contrast-background-${label}`);
  await b.js("document.querySelector('#contrast-hide').remove()");
  contrasts.push({
    label,
    foregroundScreenshot,
    samples: data,
    screenshot: `screenshots/immersive-v2/contrast-background-${label}.png`,
  });
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
  const url = process.env.AFTERTONE_URL + '/hero-directions/immersive-experience/';
  for (const mode of ['normal', 'reduced', 'no-js', 'no-webgl']) {
    const b = (active = await browser({
      reduced: mode === 'reduced',
      javascript: mode !== 'no-js',
    }));
    report.browser = b.capabilities.browserVersion;
    try {
      if (mode === 'no-webgl')
        await b.bidi('script.addPreloadScript', {
          functionDeclaration: `()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind==='webgl'||kind==='webgl2')return null;return original.call(this,kind,...args)}}`,
        });
      for (const [w, h] of mode === 'normal' ? [...sizes, [768, 1024], [1280, 800]] : sizes) {
        await b.viewport(w, h);
        if (mode === 'normal' && sizes.some((s) => s[0] === w)) {
          await b.go(url.replace('immersive-experience/', 'immersive-experience-before/'));
          await pause(1400);
          await shot(b, `before-${w}x${h}`);
        }
        await b.go(url);
        await pause(1800);
        const layout = await inspect(b, w, h, {
          renderer: ['no-js', 'no-webgl'].includes(mode) ? 'fallback' : 'webgl',
          reduced: mode === 'reduced',
        });
        await shot(b, `${mode === 'normal' ? 'after' : mode}-${w}x${h}`);
        if (sizes.some((s) => s[0] === w))
          await captureContrast(
            b,
            `${mode}-${w}x${h}`,
            `screenshots/immersive-v2/${mode === 'normal' ? 'after' : mode}-${w}x${h}.png`,
          );
        if (mode === 'reduced') {
          const canvas = await b.js(
            'return document.querySelector("canvas[data-resonator]").toDataURL()',
          );
          await b.req('/actions', {
            actions: [
              {
                type: 'pointer',
                id: 'mouse',
                parameters: { pointerType: 'mouse' },
                actions: [{ type: 'pointerMove', duration: 150, x: Math.round(w * 0.7), y: 200 }],
              },
            ],
          });
          await pause(1000);
          assert.equal(
            await b.js('return document.querySelector("canvas[data-resonator]").toDataURL()'),
            canvas,
            'Reduced motion is static',
          );
        }
        if (mode === 'normal') {
          if (w === 1440) {
            const before = await b.js(
              'return document.querySelector("canvas[data-resonator]").toDataURL()',
            );
            await b.req('/actions', {
              actions: [
                {
                  type: 'pointer',
                  id: 'mouse',
                  parameters: { pointerType: 'mouse' },
                  actions: [{ type: 'pointerMove', duration: 300, x: 1010, y: 280 }],
                },
              ],
            });
            await pause(1100);
            assert.notEqual(
              await b.js('return document.querySelector("canvas[data-resonator]").toDataURL()'),
              before,
              'Pointer changes real scene',
            );
            await shot(b, 'pointer-1440x900');
            for (const [selector, hash] of [
              ['.desktop-nav a[href="#approach"]', '#approach'],
              ['.desktop-nav a[href="#experience"]', '#experience'],
              ['.desktop-nav a[href="#capabilities"]', '#capabilities'],
              ['.header-cta', '#demo'],
            ]) {
              await b.go(url);
              await b.click(selector);
              await pause(900);
              assert.equal(await b.js('return location.hash'), hash);
            }
          }
          await b.go(url);
          await b.click('.immersive-cta');
          await pause(1000);
          assert.equal(await b.js('return location.hash'), '#demo');
          assert.ok(
            Math.abs(
              await b.js('return document.querySelector("#demo").getBoundingClientRect().top'),
            ) < 70,
          );
          await b.go(url);
          await b.click('.immersive-footer a');
          await pause(900);
          assert.equal(await b.js('return location.hash'), '#approach');
          if (w <= 600) {
            await b.go(url);
            await b.click('.mobile-nav summary');
            assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), true);
            await shot(b, `menu-${w}`);
            await b.keys('.mobile-nav summary', '\uE00C');
            assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), false);
            await b.click('.mobile-nav summary');
            await b.click('.mobile-nav a[href="#experience"]');
            await pause(900);
            assert.equal(await b.js('return location.hash'), '#experience');
            assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), false);
            await b.go(url);
            await pause(1800);
            await b.js('document.querySelector(".immersive-cta").focus()');
            await b.keys('.immersive-cta', '\uE004');
            await b.keys('.immersive-footer a', '\uE008\uE004\uE000');
            assert.equal(
              await b.js('return document.activeElement.matches(".immersive-cta")'),
              true,
            );
            await shot(b, `focus-${w}`);
          }
        }
        report.checks.push({ mode, w, h, result: 'passed', layout });
      }
      if (mode === 'normal') {
        await b.viewport(1440, 900);
        await b.go(url);
        await pause(1800);
        await b.js(
          'window.__loss=document.querySelector("canvas[data-resonator]").getContext("webgl").getExtension("WEBGL_lose_context");window.__loss.loseContext()',
        );
        await pause(150);
        assert.equal(
          await b.js('return document.querySelector(".resonator-stage").dataset.renderer'),
          'fallback',
        );
        await shot(b, 'context-lost-1440x900');
        await b.js('window.__loss.restoreContext()');
        await pause(800);
        assert.equal(
          await b.js('return document.querySelector(".resonator-stage").dataset.renderer'),
          'webgl',
        );
        report.checks.push({ test: 'WebGL loss and restoration', result: 'passed' });
        // Real back navigation exercises BFCache when Firefox elects to preserve it.
        await b.go(url.replace('immersive-experience/', 'refined-spatial/'));
        await b.req('/back', {});
        await pause(1800);
        assert.equal(
          await b.js('return document.querySelector(".resonator-stage").dataset.renderer'),
          'webgl',
        );
        report.checks.push({ test: 'Back navigation', result: 'passed' });
        await b.go(url);
        await b.req('/execute/async', {
          script:
            'const done=arguments[arguments.length-1];setTimeout(()=>{done(document.querySelector(".resonator-stage").dataset.renderer)},200)',
          args: [],
        });
        await shot(b, 'entrance-1440x900');
      }
      report.consoleErrors.push(...b.logs.filter((e) => e.level === 'error'));
      assert.deepEqual(
        b.logs.filter((e) => e.level === 'error'),
        [],
        'No console errors',
      );
    } finally {
      await b.close();
      active = null;
    }
  }
  await writeFile(
    'docs/immersive-v2/contrast-samples.json',
    JSON.stringify(contrasts, null, 2) + '\n',
  );
  report.status = 'passed';
} catch (error) {
  report.status = error.code === 'ERR_ASSERTION' || report.checks.length ? 'failed' : 'blocked';
  report.errors.push(String(error));
  process.exitCode = 1;
} finally {
  await stop();
  console.log(
    JSON.stringify(
      {
        status: report.status,
        checks: report.checks.length,
        screenshots: report.screenshots.length,
        errors: report.errors,
      },
      null,
      2,
    ),
  );
}

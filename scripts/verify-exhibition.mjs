import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, writeFile, realpath, access } from 'node:fs/promises';
const report = {
  date: new Date().toISOString(),
  checks: [],
  errors: [],
  consoleErrors: [],
  screenshots: [],
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
  for (const p of [
    process.env[name === 'firefox' ? 'FIREFOX_BINARY' : 'GECKODRIVER_BINARY'],
    `/snap/firefox/current/usr/lib/firefox/${name}`,
  ].filter(Boolean)) {
    try {
      await access(p);
      return await realpath(p);
    } catch {}
  }
  return execFileSync('which', [name], { encoding: 'utf8' }).trim();
}
function start(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(p);
  p.stdout.on('data', () => {});
  p.stderr.on('data', () => {});
  return p;
}
async function ready(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {}
    await pause(200);
  }
  throw Error(`Not ready: ${url}`);
}
const timer = setTimeout(() => {
  report.errors.push('Global timeout');
  cleanup().finally(() => process.exit(1));
}, 480000);
async function cleanup() {
  clearTimeout(timer);
  if (active) await active.close().catch(() => {});
  for (const p of children) {
    p.kill('SIGTERM');
  }
  await mkdir('docs/exhibition', { recursive: true });
  await writeFile('docs/exhibition/browser-results.json', JSON.stringify(report, null, 2) + '\n');
}
try {
  const http = await port(),
    driver = await port();
  process.env.AFTERTONE_URL = `http://127.0.0.1:${http}`;
  process.env.WEBDRIVER_URL = `http://127.0.0.1:${driver}`;
  process.env.FIREFOX_BINARY = await binary('firefox');
  start('python3', [
    '-m',
    'http.server',
    String(http),
    '--bind',
    '127.0.0.1',
    '--directory',
    'dist',
  ]);
  start(await binary('geckodriver'), ['--host', '127.0.0.1', '--port', String(driver)]);
  await ready(process.env.AFTERTONE_URL);
  await ready(`${process.env.WEBDRIVER_URL}/status`);
  const { browser } = await import('./browser.mjs');
  const chapters = ['approach', 'experience', 'demo', 'common-ground', 'afterglow'];
  active = await browser();
  await active.viewport(1440, 900);
  await active.go();
  await active.scroll('#approach');
  await pause(1800);
  assert.equal(
    await active.js('return document.querySelector("[data-journey]").dataset.runtime'),
    'webgl',
  );
  if (process.env.EXPORT_POSTERS === '1') {
    await mkdir('public/exhibition', { recursive: true });
    for (const [name, a, e] of [
      ['trace', 0, 0.18],
      ['chamber', 0, 0.18],
      ['perspective', 0, 0.18],
      ['common', 0, 0.18],
      ['afterglow', 0, 0.18],
      ['within', 48, 0.05],
      ['above', -28, 0.95],
    ]) {
      const data = await active.js(
        'return document.querySelector("[data-journey]").exportStudy(arguments[0],arguments[1],arguments[2])',
        ['within', 'above'].includes(name) ? 'perspective' : name,
        a,
        e,
      );
      await writeFile(`public/exhibition/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
    }
    report.checks.push('Real scene posters exported');
  } else {
    for (const [w, h] of [
      [1440, 900],
      [1280, 900],
      [768, 1024],
      [390, 844],
      [360, 800],
    ]) {
      await active.viewport(w, h);
      await active.go();
      await pause(1000);
      for (const id of ['main', ...chapters]) {
        await active.scroll(`#${id}`);
        await pause(700);
        const file = `exhibition/${w}-${id}`;
        await active.shot(file);
        report.screenshots.push(`screenshots/${file}.png`);
        if (id !== 'main') {
          await active.scroll(`#${id} .scene-slot`);
          await active.shot(`exhibition/${w}-${id}-scene`);
        }
        assert.equal(
          await active.js('return document.documentElement.scrollWidth>innerWidth'),
          false,
        );
      }
      await active.scroll('#demo');
      await active.click('[data-preset="1"]');
      assert.equal(await active.js('return document.querySelector("output").textContent'), '48°');
      await active.click('[data-reset]');
      await active.keys('input[type=range]', '\uE014');
      assert.equal(await active.js('return document.querySelector("output").textContent'), '1°');
      await active.drag('[data-scene=perspective]', 50, 0);
      assert.notEqual(await active.js('return document.querySelector("output").textContent'), '1°');
      await active.click('[data-reset]');
      await active.scroll('#common-ground');
      await active.click('[data-path="1"]');
      assert.equal(
        await active.js(
          'return document.querySelectorAll("[data-path]")[1].getAttribute("aria-pressed")',
        ),
        'true',
      );
      if (w < 600) {
        await active.go();
        await active.click('.mobile-nav summary');
        await active.click('.mobile-nav a[href="#demo"]');
        assert.equal(await active.js('return location.hash'), '#demo');
      }
      if (w === 1440 || w === 390) {
        await active.js(
          'document.querySelectorAll("[data-live]").forEach(e=>e.removeAttribute("data-live"));document.querySelector(".journey-canvas").style.visibility="hidden"',
        );
        const tree = await active.bidi('browsingContext.getTree');
        const result = await active.bidi('browsingContext.captureScreenshot', {
          context: tree.result.contexts[0].context,
          origin: 'document',
        });
        if (result.result?.data) {
          const path = `screenshots/exhibition/full-${w}.png`;
          await writeFile(path, Buffer.from(result.result.data, 'base64'));
          report.screenshots.push(path);
        }
      }
      report.checks.push({ viewport: [w, h], result: 'passed' });
    }
    await active.scroll('#approach');
    await pause(500);
    const before = await active.js(
      'return document.querySelector("[data-journey]").exhibitionStats.draws',
    );
    await pause(900);
    assert.equal(
      await active.js('return document.querySelector("[data-journey]").exhibitionStats.draws'),
      before,
    );
    report.checks.push('Idle renderer has no continuous draw loop');

    await active.viewport(1440, 900);
    await active.scroll('#experience .scene-slot');
    report.cadence = await active.req('/execute/async', {
      script:
        'const done=arguments[arguments.length-1],t=performance.now(),intervals=[];let last=t;const start=scrollY;function tick(now){intervals.push(now-last);last=now;window.scrollTo(0,start+Math.sin((now-t)/1500)*100);if(now-t<8000)requestAnimationFrame(tick);else{intervals.shift();intervals.sort((a,b)=>a-b);done({samples:intervals.length,median:intervals[Math.floor(intervals.length*.5)],p95:intervals[Math.floor(intervals.length*.95)],over33:intervals.filter(v=>v>33.3).length,over50:intervals.filter(v=>v>50).length});}}requestAnimationFrame(tick);',
      args: [],
    });
    await active.js(
      'window.__exhibitionLoss=document.querySelector(".journey-canvas").getContext("webgl2").getExtension("WEBGL_lose_context");window.__exhibitionLoss.loseContext()',
    );
    await pause(400);
    assert.equal(
      await active.js('return document.querySelector("[data-journey]").dataset.runtime'),
      'fallback',
    );
    await active.shot('exhibition/context-lost');
    await active.js('window.__exhibitionLoss.restoreContext()');
    await pause(700);
    assert.equal(
      await active.js('return document.querySelector("[data-journey]").dataset.runtime'),
      'webgl',
    );
    report.checks.push('WebGL context loss/restoration');
    report.gpu = await active.js(
      'const gl=document.querySelector(".journey-canvas").getContext("webgl2"),d=gl.getExtension("WEBGL_debug_renderer_info");return {renderer:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,dpr:devicePixelRatio}',
    );
    await active.viewport(390, 844);
    await active.scroll('#demo .scene-slot');
    await active.drag('[data-scene=perspective]', 60, 0, 'touch');
    assert.notEqual(await active.js('return document.querySelector("output").textContent'), '0°');
    report.checks.push('Touch pointer drag');
    for (const route of [
      '/archive/',
      '/hero-comparison/a/',
      '/hero-comparison/b/',
      '/hero-directions/immersive-experience/',
    ]) {
      await active.go(process.env.AFTERTONE_URL + route);
      assert.equal(await active.js('return document.querySelectorAll("h1").length'), 1);
    }
    report.checks.push('Archive route smoke');
    report.consoleErrors.push(...active.logs.filter((l) => l.level === 'error'));
    await active.close();
    active = null;
    for (const mode of ['reduced', 'webgl-off', 'no-js']) {
      for (const [w, h] of [
        [1440, 900],
        [390, 844],
        [360, 800],
      ]) {
        active = await browser({ reduced: mode === 'reduced', javascript: mode !== 'no-js' });
        await active.viewport(w, h);
        if (mode === 'webgl-off')
          await active.bidi('script.addPreloadScript', {
            functionDeclaration:
              '()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==="webgl2"?null:original.call(this,type,...args)}}',
          });
        await active.go();
        for (const id of chapters) {
          await active.scroll(`#${id}`);
          await active.shot(`exhibition/${mode}-${w}-${id}`);
          assert.equal(
            await active.js('return document.documentElement.scrollWidth>innerWidth'),
            false,
          );
        }
        report.consoleErrors.push(
          ...active.logs.filter(
            (l) => l.level === 'error' && !l.text?.includes('Error creating WebGL context'),
          ),
        );
        report.checks.push({ mode, viewport: [w, h], result: 'passed' });
        await active.close();
        active = null;
      }
    }
  }
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.errors.push(e.stack);
  process.exitCode = 1;
} finally {
  await cleanup();
}
console.log(
  JSON.stringify(
    {
      status: report.status,
      checks: report.checks,
      errors: report.errors,
      consoleErrors: report.consoleErrors.length,
    },
    null,
    2,
  ),
);

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
  await writeFile('docs/exhibition/details-results.json', JSON.stringify(report, null, 2) + '\n');
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

  report.textSamples = [];
  active = await browser({ touch: true });
  for (const w of [1440, 390]) {
    await active.viewport(w, w === 1440 ? 900 : 844);
    await active.go();
    for (const id of ['approach', 'experience', 'demo', 'common-ground', 'afterglow']) {
      await active.scroll('#' + id);
      await pause(1100);
      const stem = `exhibition/contrast-${w}-${id}`;
      const samples = await active.js(
        `const root=document.querySelector(arguments[0]),out=[];for(const el of root.querySelectorAll('.chapter-heading h2,.chapter-heading p,.chapter-bar span')){const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);const style=getComputedStyle(n.parentElement);for(const r of range.getClientRects())if(r.top>=0&&r.bottom<=innerHeight)out.push({fg:style.color,threshold:parseFloat(style.fontSize)>=24?3:4.5,rect:[r.x,r.y,r.width,r.height]});}}return out;`,
        '#' + id,
      );
      await active.shot(stem);
      await active.js(
        `const style=document.createElement('style');style.id='contrast-hide';style.textContent='.chapter-heading h2,.chapter-heading h2 *,.chapter-heading p,.chapter-bar span{color:transparent!important}';document.head.append(style);`,
      );
      await active.shot(stem + '-background');
      await active.js('document.querySelector("#contrast-hide").remove()');
      report.textSamples.push({ stem, samples });
    }
    assert.equal(
      await active.js('return [...document.images].every(i=>i.complete&&i.naturalWidth>0)'),
      true,
    );
  }
  await active.scroll('#demo .scene-slot');
  const y = await active.js('return scrollY');
  await active.drag('[data-scene=perspective]', 0, -130, 'touch');
  report.checks.push({
    verticalTouchPan:
      (await active.js('return scrollY')) > y
        ? 'observed'
        : 'not observed in WebDriver; native pan-y needs physical-device check',
  });
  await active.scroll('#demo');
  await active.keys('input[type=range]', '\uE014');
  await active.shot('exhibition/keyboard-focus');
  report.consoleErrors = active.logs.filter((x) => x.level === 'error');
  assert.equal(report.consoleErrors.length, 0);
  await active.close();
  active = null;
  active = await browser();
  await active.viewport(390, 844);
  await active.bidi('script.addPreloadScript', {
    functionDeclaration:
      '()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==="webgl"||type==="webgl2"?null:original.call(this,type,...args)}}',
  });
  await active.go();
  await active.scroll('#demo');
  await pause(700);
  assert.equal(
    await active.js('return document.querySelector("[data-journey]").dataset.runtime'),
    'fallback',
  );
  await active.click('[data-preset="2"]');
  assert.ok(
    (await active.js('return document.querySelector("[data-scene=perspective] img").src')).includes(
      'above.webp',
    ),
  );
  await active.shot('exhibition/no-webgl-all');
  report.checks.push('Both WebGL APIs unavailable; real poster presets work');
  await active.close();
  active = null;
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.errors.push(e?.stack || String(e));
  process.exitCode = 1;
} finally {
  await cleanup();
}
console.log(
  JSON.stringify({ status: report.status, checks: report.checks, errors: report.errors }, null, 2),
);

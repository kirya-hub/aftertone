// Production-only local verification; no installation or security overrides.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { realpath, access, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';

const directions = ['refined-spatial', 'immersive-experience', 'experimental-editorial'];
const viewports = [
  [1440, 900],
  [768, 1024],
  [390, 844],
  [360, 800],
];
const report = {
  date: new Date().toISOString(),
  status: 'running',
  checks: [],
  screenshots: [],
  errors: [],
  logs: [],
};
const children = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let activeBrowser;
const deadline = setTimeout(() => {
  report.errors.push('Outer 240-second verification deadline exceeded');
  stop().finally(() => process.exit(1));
}, 240_000);
async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const value = server.address().port;
  await new Promise((r) => server.close(r));
  return value;
}
async function binary(name) {
  const explicit = name === 'firefox' ? process.env.FIREFOX_BINARY : process.env.GECKODRIVER_BINARY;
  if (explicit) return realpath(explicit);
  // Direct binaries in the installed snap avoid the launcher's confinement wrapper.
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
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      report.logs.push({ label, output: String(data).slice(-2000) });
      if (report.logs.length > 80) report.logs.shift();
    });
  child.on('error', (e) => report.errors.push(`${label}: ${e}`));
  return child;
}
async function ready(url, child) {
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null || child.signalCode)
      throw new Error(`Process exited before readiness: ${url}`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(300) })).ok) return;
    } catch {}
    await pause(250);
  }
  throw new Error(`HTTP readiness timeout: ${url}`);
}
async function stop() {
  clearTimeout(deadline);
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  activeBrowser = null;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode) continue;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, pause(2500)]);
    if (child.exitCode === null && !child.signalCode) {
      child.kill('SIGKILL');
      await Promise.race([exited, pause(1000)]);
    }
  }
  await writeFile(
    'docs/hero-directions-browser-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
}
async function inspect(b, direction, width, height) {
  const layout =
    await b.js(`const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};return {
    viewport:[innerWidth,innerHeight], direction:document.querySelector('.direction-hero').dataset.direction,
    overflow:document.documentElement.scrollWidth>innerWidth,
    heading:rect('#direction-title'), action:rect('.direction-cta,.editorial-action'),
    headingCount:document.querySelectorAll('h1').length,
    images:[...document.images].every(i=>i.complete&&i.naturalWidth>0),
    fonts:document.fonts.status,
    resources:performance.getEntriesByType('resource').filter(r=>r.responseStatus>=400).map(r=>r.name),
    animations:document.querySelector('.cinema-object')?getComputedStyle(document.querySelector('.cinema-object')).animationName:null,
    lcp:window.__metrics?.lcp,cls:window.__metrics?.cls
  }`);
  assert.deepEqual(layout.viewport, [width, height]);
  assert.equal(layout.direction, direction);
  assert.equal(layout.overflow, false, 'No horizontal overflow');
  assert.equal(layout.headingCount, 1);
  assert.ok(layout.images, 'Images decode');
  assert.equal(layout.fonts, 'loaded');
  assert.deepEqual(layout.resources, []);
  assert.ok(layout.action.left >= 0 && layout.action.right <= width, 'Action fits width');
  assert.ok(layout.action.top >= 0 && layout.action.bottom <= height, 'Action fits first viewport');
  // display:contents is used only for the editorial heading; check its text fragments.
  assert.ok(
    await b.js(
      `return [...document.querySelectorAll('#direction-title,#direction-title>*')].filter(e=>getComputedStyle(e).display!=='contents').every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})`,
    ),
    'Heading text fits width',
  );
  return layout;
}
try {
  const [previewPort, driverPort] = [await port(), await port()];
  const [firefox, gecko] = [await binary('firefox'), await binary('geckodriver')];
  process.env.FIREFOX_BINARY = firefox;
  process.env.AFTERTONE_URL = `http://127.0.0.1:${previewPort}`;
  process.env.WEBDRIVER_URL = `http://127.0.0.1:${driverPort}`;
  report.binaries = { firefox, gecko };
  const preview = start(
    process.execPath,
    [
      'node_modules/astro/bin/astro.mjs',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(previewPort),
      '--ignore-lock',
    ],
    'preview',
  );
  const driver = start(gecko, ['--host', '127.0.0.1', '--port', String(driverPort)], 'geckodriver');
  await ready(process.env.AFTERTONE_URL, preview);
  await ready(`${process.env.WEBDRIVER_URL}/status`, driver);
  const { browser } = await import('./browser.mjs');
  for (const options of [{}, { reduced: true }, { javascript: false }]) {
    const b = (activeBrowser = await browser(options));
    report.browser = b.capabilities.browserVersion;
    try {
      for (const direction of directions) {
        for (const [width, height] of Object.keys(options).length
          ? [viewports[0], viewports[2]]
          : viewports) {
          await b.viewport(width, height);
          // Keep the original three concepts reproducible; 2.0 has its own runner.
          const route =
            direction === 'immersive-experience' ? 'immersive-experience-before' : direction;
          const url = `${process.env.AFTERTONE_URL}/hero-directions/${route}/`;
          await b.go(url);
          await pause(1400);
          const layout = await inspect(b, direction, width, height);
          const state = options.reduced ? '-reduced' : options.javascript === false ? '-no-js' : '';
          const name = `hero-directions/${direction}${state}-${width}x${height}`;
          await b.shot(name);
          report.screenshots.push(`screenshots/${name}.png`);
          if (options.reduced)
            assert.ok(await b.js('return matchMedia("(prefers-reduced-motion:reduce)").matches'));
          if (options.reduced && direction === 'immersive-experience')
            assert.equal(layout.animations, 'none');
          if (!Object.keys(options).length) {
            await b.click('.direction-cta,.editorial-action');
            await pause(700);
            assert.equal(await b.js('return location.hash'), '#demo');
            assert.ok(
              Math.abs(
                await b.js("return document.querySelector('#demo').getBoundingClientRect().top"),
              ) < 70,
            );
            await b.go(url);
            await b.click('.direction-footer a');
            await pause(700);
            assert.equal(await b.js('return location.hash'), '#approach');
            if (width <= 600) {
              await b.go(url);
              await b.click('.mobile-nav summary');
              assert.ok(await b.js("return document.querySelector('.mobile-nav').open"));
              await b.shot(`hero-directions/${direction}-menu-${width}`);
              await b.keys('.mobile-nav summary', '\uE00C');
              assert.equal(await b.js("return document.querySelector('.mobile-nav').open"), false);
              await b.js("document.querySelector('.direction-cta,.editorial-action').focus()");
              assert.ok(
                await b.js(
                  "return document.activeElement.matches('.direction-cta,.editorial-action')",
                ),
              );
              await b.shot(`hero-directions/${direction}-focus-${width}`);
            }
          }
          report.checks.push({ direction, width, height, options, layout, result: 'passed' });
        }
      }
      assert.deepEqual(
        b.logs.filter((e) => e.level === 'error'),
        [],
      );
    } finally {
      await b.close();
      activeBrowser = null;
    }
  }
  report.status = 'passed';
} catch (error) {
  report.status = report.checks.length ? 'failed' : 'blocked';
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

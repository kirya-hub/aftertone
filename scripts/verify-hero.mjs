// Focused Hero checks. AFTERTONE_URL, WEBDRIVER_URL and FIREFOX_BINARY are configurable.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { browser, pause, base } from './browser.mjs';

const report = {
  url: base,
  timestamp: new Date().toISOString(),
  status: 'running',
  checks: [],
  screenshots: [],
  errors: [],
};
const capture = async (b, name) => {
  await b.shot(`neon-resonance/${name}`);
  report.screenshots.push(`screenshots/neon-resonance/${name}.png`);
};
const imageReady = (b) =>
  b.js(`const i=document.querySelector('.resonance-image');return i.complete && i.naturalWidth>0`);
const transform = (b) =>
  b.js(`return getComputedStyle(document.querySelector('.resonance-scene')).transform`);
const noOverflow = async (b) =>
  assert.ok(
    await b.js('return document.documentElement.scrollWidth<=innerWidth'),
    'No page overflow',
  );
try {
  const b = await browser();
  report.browser = {
    version: b.capabilities.browserVersion,
    driver: b.capabilities['moz:geckodriverVersion'],
    headless: b.capabilities['moz:headless'],
    profile: b.capabilities['moz:profile'],
    timeouts: b.capabilities.timeouts,
  };
  try {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [360, 800],
    ]) {
      await b.viewport(width, height);
      await b.go();
      await pause(1900);
      await noOverflow(b);
      assert.ok(await imageReady(b), 'Hero artwork decoded');
      const assets = await b.js(`return {
        viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth,
        fonts: document.fonts.status,
        images: [...document.images].map(i=>({src:i.currentSrc,loaded:i.complete&&i.naturalWidth>0})),
        failures: performance.getEntriesByType('resource').filter(r=>r.responseStatus>=400).map(r=>({url:r.name,status:r.responseStatus})),
        cta: (()=>{const r=document.querySelector('.neon-button').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()
      }`);
      assert.ok(
        assets.images.every((i) => i.loaded),
        'All page images loaded',
      );
      assert.deepEqual(assets.failures, [], 'No failed asset responses');
      assert.equal(assets.fonts, 'loaded');
      assert.ok(
        await b.js(
          `const r=document.querySelector('.neon-button').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight`,
        ),
        'Primary CTA fits first screen',
      );
      await capture(b, `neon-hero-${width}x${height}`);
      report.checks.push({
        viewport: [width, height],
        assets,
        image: await b.js(
          `const i=document.querySelector('.resonance-image');return {src:i.currentSrc,width:i.naturalWidth}`,
        ),
        result: 'pass',
      });
      const before = await transform(b);
      await b.js('window.scrollTo({top:320,behavior:"instant"})');
      await pause(1000);
      assert.notEqual(
        await transform(b),
        before,
        'Scroll moves the sculpture on a separate depth plane',
      );
      await noOverflow(b);
      if (width === 1440) await capture(b, 'neon-hero-desktop-scroll');
      await b.go();
      await pause(1900);
      await b.click('.neon-button');
      await pause(1000);
      assert.equal(await b.js('return location.hash'), '#demo');
      assert.ok(
        Math.abs(await b.js(`return document.querySelector('#demo').getBoundingClientRect().top`)) <
          70,
        'CTA reaches existing playground',
      );
      await b.go();
      await pause(1900);
      const interactions = { viewport: [width, height], primaryCTA: 'pass' };
      try {
        await b.click('.neon-session');
        await pause(1000);
        assert.equal(await b.js('return location.hash'), '#demo');
        interactions.sessionLink = 'pass';
      } catch (error) {
        interactions.sessionLink = 'fail';
        report.errors.push(`${width}x${height} .neon-session: ${error}`);
      }
      if (width <= 600) {
        await b.go();
        await b.click('.mobile-nav summary');
        assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), true);
        await b.keys('.mobile-nav summary', '\uE00C');
        assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), false);
        interactions.mobileMenu = 'pass';
      }
      report.checks.push(interactions);
    }
    assert.deepEqual(
      b.logs.filter((l) => l.level === 'error'),
      [],
      'No browser console errors',
    );
    report.checks.push(
      'Entrance settles; all three viewport screenshots; depth parallax; primary Hero link; mobile menu; console. Session link results recorded per viewport.',
    );
  } finally {
    await b.close();
  }
  for (const options of [{ reduced: true }, { javascript: false }]) {
    const b = await browser(options);
    try {
      for (const [width, height] of [
        [1440, 900],
        [390, 844],
        [360, 800],
      ]) {
        await b.viewport(width, height);
        await b.go();
        await pause(500);
        assert.ok(await imageReady(b));
        await noOverflow(b);
        await capture(b, `neon-hero-${options.reduced ? 'reduced' : 'no-js'}-${width}x${height}`);
        const before = await transform(b);
        await b.js('window.scrollTo({top:320,behavior:"instant"})');
        await pause(900);
        assert.equal(await transform(b), before, 'Static scene remains static');
        if (options.reduced)
          assert.ok(await b.js('return matchMedia("(prefers-reduced-motion: reduce)").matches'));
      }
      assert.deepEqual(
        b.logs.filter((l) => l.level === 'error'),
        [],
      );
    } finally {
      await b.close();
    }
  }
  report.checks.push(
    'Reduced motion and JavaScript disabled: loaded static artwork, no parallax, all three viewports.',
  );
  report.status = report.errors.length ? 'failed' : 'passed';
  if (report.errors.length) process.exitCode = 1;
} catch (error) {
  report.status = 'failed';
  report.errors.push(String(error), ...(error.cause ? [String(error.cause)] : []));
  process.exitCode = 1;
} finally {
  await writeFile('docs/hero-browser-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

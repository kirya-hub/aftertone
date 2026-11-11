// Run against a local production preview and the existing Firefox/geckodriver harness.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { browser, pause, base } from './browser.mjs';

const report = {
  timestamp: new Date().toISOString(),
  url: base,
  status: 'running',
  checks: [],
  screenshots: [],
  errors: [],
};
const viewports = [
  [1440, 900],
  [768, 1024],
  [390, 844],
  [360, 800],
];
const url = (variant) => new URL(`/hero-comparison/${variant}/`, base).href;
const noOverflow = async (b) => {
  assert.ok(await b.js('return document.documentElement.scrollWidth <= innerWidth'));
};
const transform = (b) =>
  b.js("return getComputedStyle(document.querySelector('.resonance-scene')).transform");
const ready = async (b) => {
  assert.ok(
    await b.js(
      "const i=document.querySelector('.resonance-image'); return i.complete && i.naturalWidth > 0",
    ),
    'Hero image decoded',
  );
  await noOverflow(b);
};
const capture = async (b, name) => {
  await b.shot(`hero-comparison/${name}`);
  report.screenshots.push(`screenshots/hero-comparison/${name}.png`);
};
const checkSession = async (b) => {
  assert.ok(
    await b.js(`const a=document.querySelector('.neon-session');
      const r=a.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return a===hit || a.contains(hit)`),
    'Session card receives pointer hits above the copy plane',
  );
  await b.click('.neon-session');
  await pause(900);
  assert.equal(await b.js('return location.hash'), '#demo');
};

try {
  const b = await browser();
  try {
    report.browser = {
      version: b.capabilities.browserVersion,
      driver: b.capabilities['moz:geckodriverVersion'],
      headless: b.capabilities['moz:headless'],
    };
    for (const variant of ['a', 'b']) {
      for (const [width, height] of viewports) {
        await b.viewport(width, height);
        await b.go(url(variant));
        await pause(1900);
        await ready(b);
        const layout = await b.js(`const rect=s=>{
            const r=document.querySelector(s).getBoundingClientRect();
            return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};
          }; return {
            viewport:[innerWidth,innerHeight],
            variant:document.querySelector('.hero').dataset.variant,
            title:rect('.hero h1'), cta:rect('.neon-button'),
            session:rect('.neon-session'), fonts:document.fonts.status,
            image:document.querySelector('.resonance-image').currentSrc,
            imagesLoaded:[...document.images].every(i=>i.complete&&i.naturalWidth>0),
            failedResources:performance.getEntriesByType('resource')
              .filter(r=>r.responseStatus>=400).map(r=>r.name)
          }`);
        assert.equal(layout.variant, variant);
        assert.equal(layout.fonts, 'loaded');
        assert.ok(layout.imagesLoaded);
        assert.deepEqual(layout.failedResources, []);
        assert.ok(layout.title.x >= 0 && layout.title.right <= width);
        assert.ok(
          layout.cta.x >= 0 && layout.cta.right <= width && layout.cta.bottom <= height,
          'CTA fits first screen',
        );
        assert.ok(layout.session.bottom <= height, 'Session link fits first screen');
        await capture(b, `${variant}-${width}x${height}`);

        const before = await transform(b);
        await b.js('scrollTo({top:320,behavior:"instant"})');
        await pause(1000);
        assert.notEqual(await transform(b), before, 'Depth plane responds to scroll');
        await noOverflow(b);
        if (width === 1440) await capture(b, `${variant}-scroll`);

        await b.go(url(variant));
        await pause(1900);
        await checkSession(b);
        await b.go(url(variant));
        await pause(1900);
        await b.click('.neon-button');
        await pause(900);
        assert.equal(await b.js('return location.hash'), '#demo');
        assert.ok(
          Math.abs(
            await b.js("return document.querySelector('#demo').getBoundingClientRect().top"),
          ) < 70,
        );

        await b.go(url(variant));
        await pause(1900);
        await b.click('.neon-scroll');
        await pause(900);
        assert.equal(await b.js('return location.hash'), '#approach');
        if (width <= 600) {
          await b.go(url(variant));
          await b.click('.mobile-nav summary');
          assert.ok(await b.js("return document.querySelector('.mobile-nav').open"));
          await b.keys('.mobile-nav summary', '\uE00C');
          assert.equal(await b.js("return document.querySelector('.mobile-nav').open"), false);
        }
        report.checks.push({ variant, width, height, layout, result: 'passed' });
      }
    }
    // The same stacking fix applies to the existing homepage Hero as well.
    for (const [width, height] of viewports.filter(([width]) => width <= 600)) {
      await b.viewport(width, height);
      await b.go();
      await pause(1900);
      await checkSession(b);
      report.checks.push({ homepageSessionRegression: [width, height], result: 'passed' });
    }
    assert.deepEqual(
      b.logs.filter((entry) => entry.level === 'error'),
      [],
    );
  } finally {
    await b.close();
  }
  for (const options of [{ reduced: true }, { javascript: false }]) {
    const b = await browser(options);
    try {
      for (const variant of ['a', 'b']) {
        for (const [width, height] of [viewports[0], viewports[2]]) {
          await b.viewport(width, height);
          await b.go(url(variant));
          await pause(500);
          await ready(b);
          await capture(
            b,
            `${variant}-${options.reduced ? 'reduced' : 'no-js'}-${width}x${height}`,
          );
          if (options.reduced)
            assert.ok(await b.js('return matchMedia("(prefers-reduced-motion:reduce)").matches'));
          const before = await transform(b);
          await b.js('scrollTo({top:320,behavior:"instant"})');
          await pause(900);
          assert.equal(await transform(b), before, 'Static scene remains static');
          report.checks.push({ variant, width, height, options, result: 'passed' });
        }
      }
      assert.deepEqual(
        b.logs.filter((entry) => entry.level === 'error'),
        [],
      );
    } finally {
      await b.close();
    }
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  for (let cause = error; cause; cause = cause.cause) {
    report.errors.push(`${cause.code ? `${cause.code}: ` : ''}${cause}`);
  }
  process.exitCode = 1;
} finally {
  await writeFile(
    'docs/hero-comparison-browser-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
}

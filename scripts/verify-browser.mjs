import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { browser, pause, base } from './browser.mjs';
const report = {
  url: base,
  timestamp: new Date().toISOString(),
  browser: null,
  viewports: [],
  metrics: [],
  consoleErrors: [],
  checks: [],
  limitations: [],
};
const b = await browser();
try {
  report.browser = await b.js('return navigator.userAgent');
  for (const [w, h] of [
    [1440, 900],
    [1280, 800],
    [768, 1024],
    [390, 844],
    [360, 844],
  ]) {
    await b.viewport(w, h);
    await b.go();
    await pause(1900);
    assert.equal(
      await b.js('return document.documentElement.scrollWidth<=innerWidth'),
      true,
      `Initial overflow ${w}`,
    );
    const timing = await b.js(
      `return {width:innerWidth,height:innerHeight,observed:window.__metrics,paints:performance.getEntriesByType('paint').map(e=>({name:e.name,startTime:e.startTime})),navigation:performance.getEntriesByType('navigation').map(e=>({duration:e.duration,domContentLoaded:e.domContentLoadedEventEnd,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize})),resources:performance.getEntriesByType('resource').map(e=>({name:e.name,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,duration:e.duration}))}`,
    );
    report.metrics.push(timing);
    assert.ok(
      await b.js(
        'const button=document.querySelector(".hero .button").getBoundingClientRect();const note=document.querySelector(".hero-note").getBoundingClientRect();return note.top-button.bottom>=8',
      ),
      'Hero CTA has a clear final gap',
    );
    await b.shot(`final-${w}-hero`);
    if (w <= 600) {
      await b.scroll('.resonance-scene', -90);
      await b.shot(`final-${w}-hero-resonance`);
    }
    for (const [selector, name, offset] of [
      ['#approach', 'approach', 0],
      ['#experience', 'experience', 0],
      ['.story-step[data-step="1"]', 'story-mid', -180],
      ['.story-step[data-step="2"]', 'story-end', -140],
      ['.playground', 'demo', -15],
      ['.capability-row:nth-of-type(1)', 'notes', -40],
      ['.capability-row:nth-of-type(2)', 'context', -40],
      ['.capability-row:nth-of-type(3)', 'evolution', -40],
      ['#faq', 'faq', 0],
      ['.final-cta', 'closing', 0],
      ['.footer', 'footer', 0],
    ]) {
      await b.scroll(selector, offset);
      assert.equal(
        await b.js('return document.documentElement.scrollWidth<=innerWidth'),
        true,
        `${w} ${name}: overflow`,
      );
      if (name === 'faq') await b.click('.faq-list summary');
      await b.shot(`final-${w}-${name}`);
    }
    if (w <= 600) {
      await b.scroll('.source-inspector', -20);
      await b.shot(`final-${w}-inspector`);
      await b.scroll('.header');
      await b.click('.mobile-nav summary');
      await b.shot(`final-${w}-menu`);
      await b.keys('.mobile-nav summary', '\uE00C');
      assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), false);
    }
    if (w <= 600) {
      assert.ok(
        await b.js(
          'return document.querySelector(".story-step h3").textContent.includes("with a point")',
        ),
        'Hidden line break keeps word separation',
      );
      assert.ok(
        await b.js(
          'return document.querySelector(".capability-row.reverse h3").textContent.includes("scene. A")',
        ),
        'Mobile capability heading keeps word separation',
      );
    }
    const broken = await b.js(
      `return Array.from(document.querySelectorAll('a[href^="#"]')).filter(a=>a.getAttribute('href')!=='#'&&!document.querySelector(a.getAttribute('href'))).map(a=>a.outerHTML)`,
    );
    assert.deepEqual(broken, [], 'Every anchor has a destination');
    await b.js('window.scrollTo({top:document.body.scrollHeight,behavior:"instant"})');
    await pause(70);
    await b.js('window.scrollTo({top:0,behavior:"instant"})');
    await pause(800);
    assert.equal(await b.js('return document.querySelectorAll(".pin-spacer").length'), 0);
    assert.equal(
      await b.js('return document.querySelector("h1").getBoundingClientRect().height>0'),
      true,
    );
    report.viewports.push({ width: w, height: h, passed: true });
    await writeFile('docs/browser-results.json', JSON.stringify(report, null, 2) + '\n');
    console.log(
      `PASS ${w}x${h}: all sections, captures, overflow, fast scroll, anchors${w <= 600 ? ', menu Escape' : ''}`,
    );
  }
  // Working CTA links and anchored refresh, including the final composition.
  await b.viewport(1280, 800);
  await b.go();
  for (const selector of ['.hero .button', '.header-cta', '.closing-link']) {
    await b.js(
      'document.querySelector(arguments[0]).scrollIntoView({block:"center",behavior:"instant"})',
      selector,
    );
    await pause(100);
    await b.click(selector);
    await pause(1100);
    assert.equal(await b.js('return location.hash'), '#demo');
    assert.ok(
      Math.abs(await b.js('return document.querySelector("#demo").getBoundingClientRect().top')) <
        70,
      `CTA scroll ${selector}`,
    );
  }
  await b.req('/refresh', {});
  await pause(600);
  assert.equal(await b.js('return location.hash'), '#demo');
  assert.equal(await b.js('return document.querySelector("#position-x").value'), '29');
  // Active demo: Shift arrows, hard boundaries and keyboard focus visibility.
  await b.scroll('.playground', -10);
  await b.keys('[data-source=air]', '\uE014');
  await b.req('/actions', {
    actions: [
      {
        type: 'key',
        id: 'keyboard',
        actions: [
          { type: 'keyDown', value: '\uE008' },
          { type: 'keyDown', value: '\uE014' },
          { type: 'keyUp', value: '\uE014' },
          { type: 'keyUp', value: '\uE008' },
        ],
      },
    ],
  });
  assert.equal(await b.js('return document.querySelector("#position-x").value'), '35');
  await b.keys('#position-x', '\uE010');
  assert.equal(await b.js('return document.querySelector("#position-x").value'), '90');
  await b.keys('#position-x', '\uE014');
  assert.equal(await b.js('return document.querySelector("#position-x").value'), '90');
  assert.ok(
    (
      await b.js('return document.querySelector("#position-x").getAttribute("aria-valuetext")')
    ).includes('right'),
  );
  assert.equal(await b.js('return getComputedStyle(document.activeElement).outlineStyle'), 'solid');
  await b.click('.reset-scene');
  // Resize with the story in progress, then refresh at a narrow width.
  await b.scroll('.story-step[data-step="1"]', -150);
  await b.viewport(360, 844);
  await pause(500);
  await b.shot('final-resize-story');
  assert.ok(
    ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(
      await b.js(
        'return getComputedStyle(document.querySelector(".field-story .field-shell")).transform',
      ),
    ),
  );
  await b.req('/refresh', {});
  await pause(500);
  assert.equal(await b.js('return document.documentElement.scrollWidth<=innerWidth'), true);
  // The first keyboard stop is the visible-on-focus skip link.
  await b.go(base);
  await b.req('/actions', {
    actions: [
      {
        type: 'key',
        id: 'tab',
        actions: [
          { type: 'keyDown', value: '\uE004' },
          { type: 'keyUp', value: '\uE004' },
        ],
      },
    ],
  });
  assert.equal(await b.js('return document.activeElement.className'), 'skip-link');
  await b.shot('final-keyboard-skip-link');
  report.checks.push(
    'Exact five-viewport matrix; all sections; all anchor targets; three primary CTA clicks; anchor refresh; fast down/up; resize in story; no ScrollTrigger pin spacers; Shift arrows; slider boundaries; aria-valuetext; visible keyboard focus; skip link; mobile Escape.',
  );
  report.consoleErrors.push(...b.logs.filter((e) => e.level === 'error'));
} finally {
  await b.close();
}
const reduced = await browser({ reduced: true });
try {
  await reduced.viewport(1440, 900);
  await reduced.go();
  await reduced.scroll('.story-step[data-step="1"]', -170);
  await reduced.shot('final-reduced-motion');
  assert.equal(
    await reduced.js('return matchMedia("(prefers-reduced-motion: reduce)").matches'),
    true,
  );
  assert.ok(
    ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(
      await reduced.js(
        'return getComputedStyle(document.querySelector(".field-story .field-shell")).transform',
      ),
    ),
  );
  await reduced.scroll('.playground', -20);
  await reduced.click('[data-select-source=signal]');
  assert.equal(
    await reduced.js('return document.querySelector("[data-source-name]").textContent'),
    'Signal',
  );
  report.consoleErrors.push(...reduced.logs.filter((e) => e.level === 'error'));
  report.checks.push('Reduced motion: static SVG, usable interactive demo.');
} finally {
  await reduced.close();
}
const nojs = await browser({ javascript: false });
try {
  await nojs.viewport(390, 844);
  await nojs.go();
  await nojs.shot('final-no-js-hero');
  await nojs.scroll('.playground', -10);
  await nojs.shot('final-no-js-demo');
  assert.equal(await nojs.js('return document.querySelector("[data-source=air]").disabled'), true);
  assert.ok(
    (await nojs.js('return document.body.textContent')).includes('This is the initial scene.'),
  );
  await nojs.scroll('#faq');
  await nojs.click('.faq-list summary');
  assert.equal(await nojs.js('return document.querySelector(".faq-list details").open'), true);
  await nojs.shot('final-no-js-faq');
  await nojs.scroll('.header');
  await nojs.click('.mobile-nav summary');
  await nojs.click('.mobile-nav a[href="#demo"]');
  await pause(900);
  assert.equal(await nojs.js('return location.hash'), '#demo');
  assert.equal(await nojs.js('return document.documentElement.scrollWidth<=innerWidth'), true);
  report.checks.push(
    'JavaScript disabled: content, noscript explanation, disabled demo controls, native mobile navigation and native FAQ.',
  );
} finally {
  await nojs.close();
}
assert.deepEqual(report.consoleErrors, [], 'No browser console errors');
if (!report.metrics[0].observed?.supported?.includes('largest-contentful-paint'))
  report.limitations.push('LCP API unavailable in this Firefox; no LCP score reported.');
if (!report.metrics[0].observed?.supported?.includes('layout-shift'))
  report.limitations.push('Layout Shift API unavailable in this Firefox; no CLS score reported.');
report.limitations.push(
  'Local, unthrottled Firefox lab. No Lighthouse score or physical-device/other-engine verification.',
);
await writeFile('docs/browser-results.json', JSON.stringify(report, null, 2) + '\n');
console.log('PASS: production browser validation. Report: docs/browser-results.json');
console.log(
  JSON.stringify(
    {
      metrics: report.metrics.map((m) => ({
        width: m.width,
        observed: m.observed,
        paints: m.paints,
      })),
      limitations: report.limitations,
    },
    null,
    2,
  ),
);

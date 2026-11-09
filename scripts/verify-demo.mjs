import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { browser, pause } from './browser.mjs';
const b = await browser();
const report = { touch: null };
try {
  await b.viewport(1440, 900);
  await b.go();
  await b.scroll('.playground', -20);
  assert.equal(await b.js('return document.querySelector("[data-source=air]").disabled'), false);
  await b.click('[data-select-source=voice]');
  assert.equal(
    await b.js('return document.querySelector("[data-source-name]").textContent'),
    'Voice',
  );
  assert.equal(await b.js('return document.querySelector("#position-x").value'), '71');
  await b.keys('[data-source=voice]', '\uE014');
  assert.equal(
    await b.js('return document.querySelector("#position-x").value'),
    '72',
    'Source arrow key movement',
  );
  await b.keys('#position-x', '\uE014');
  assert.equal(
    await b.js('return document.querySelector("#position-x").value'),
    '73',
    'Native slider key movement',
  );
  await b.drag('[data-source=voice]', -80, 55);
  const moved = await b.js(
    'return [Number(document.querySelector("#position-x").value),Number(document.querySelector("#position-y").value)]',
  );
  assert.ok(moved[0] < 73 && moved[1] > 42, JSON.stringify(moved));
  const line = await b.js(
    'return Number(document.querySelector("[data-line=voice]").getAttribute("x2"))',
  );
  assert.equal(line, moved[0] * 6, 'SVG line follows position');
  await b.shot('stage3-desktop-demo-moved');
  await b.click('.reset-scene');
  assert.equal(await b.js('return document.querySelector("#position-x").value'), '29');
  assert.equal(
    await b.js('return document.querySelector("[data-source-name]").textContent'),
    'Atmosphere',
  );
  // Verify a source can be selected even after positions overlap.
  await b.js(
    'document.querySelector("#position-x").value=71;document.querySelector("#position-x").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#position-y").value=42;document.querySelector("#position-y").dispatchEvent(new Event("input",{bubbles:true}));',
  );
  await b.click('[data-select-source=voice]');
  assert.equal(
    await b.js('return document.querySelector("[data-source-name]").textContent'),
    'Voice',
  );
  await b.click('.reset-scene');
  await b.viewport(390, 844);
  await b.scroll('.demo-field', -80);
  try {
    await b.drag('[data-source=air]', 32, 35, 'touch');
    report.touch = 'Firefox WebDriver touch pointer drag passed';
    assert.notEqual(await b.js('return document.querySelector("#position-x").value'), '29');
  } catch (e) {
    if (/unsupported|not support|unimplemented/i.test(String(e))) {
      report.touch = `Not supported by Firefox WebDriver: ${String(e).slice(0, 200)}`;
      await b.req('/actions', undefined, 'DELETE');
    } else throw e;
  }
  await b.shot('stage3-mobile-demo-field');
  await b.scroll('.source-inspector', -30);
  await b.click('[data-select-source=signal]');
  await b.keys('#position-y', '\uE015');
  assert.equal(await b.js('return document.querySelector("#position-y").value'), '69');
  await b.shot('stage3-mobile-demo-inspector');
  await b.scroll('.header');
  await b.click('.mobile-nav summary');
  assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), true);
  await b.shot('stage3-mobile-menu');
  await b.click('.mobile-nav a[href="#demo"]');
  await pause(900);
  assert.equal(await b.js('return document.querySelector(".mobile-nav").open'), false);
  assert.equal(await b.js('return location.hash'), '#demo');
  await b.scroll('#faq');
  await b.keys('.faq-list summary', '\uE007');
  assert.equal(await b.js('return document.querySelector(".faq-list details").open'), true);
  assert.equal(await b.js('return document.documentElement.scrollWidth<=innerWidth'), true);
  assert.equal(b.logs.filter((l) => l.level === 'error').length, 0, JSON.stringify(b.logs));
  console.log(
    'PASS: source selection, arrow movement, native sliders, mouse drag, SVG sync, reset, overlap selection, menu, keyboard FAQ, no overflow/errors.',
  );
  console.log(report);
  await writeFile('docs/interaction-results.json', JSON.stringify(report, null, 2) + '\n');
} finally {
  await b.close();
}

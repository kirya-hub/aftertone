import assert from 'node:assert/strict';
import { browser, pause } from './browser.mjs';
const b = await browser();
try {
  await b.viewport(1440, 900);
  await b.go();
  await pause(1900);
  await b.shot('stage2-hero');
  for (let i = 0; i < 3; i++) {
    await b.scroll(`.story-step[data-step="${i}"]`, -180);
    await pause(800);
    await b.shot(`stage2-story-${i}`);
    console.log(
      'Story chapter',
      i,
      await b.js('return document.querySelector(".story-visual").dataset.activeStep'),
    );
  }
  await b.js('window.scrollTo({top:document.body.scrollHeight,behavior:"instant"})');
  await pause(100);
  await b.js('window.scrollTo({top:0,behavior:"instant"})');
  await pause(900);
  assert.equal(await b.js('return document.documentElement.scrollWidth <= innerWidth'), true);
  await b.viewport(390, 844);
  await b.scroll('#experience');
  await b.shot('stage2-mobile-story');
  assert.ok(
    ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(
      await b.js(
        'return getComputedStyle(document.querySelector(".field-story .field-shell")).transform',
      ),
    ),
    'Desktop story animation reverted on mobile',
  );
  assert.equal(b.logs.filter((l) => l.level === 'error').length, 0, JSON.stringify(b.logs));
} finally {
  await b.close();
}
const reduced = await browser({ reduced: true });
try {
  await reduced.viewport(1440, 900);
  await reduced.go();
  await reduced.scroll('.story-step[data-step="1"]', -180);
  await reduced.shot('stage2-reduced-story');
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
  assert.equal(
    reduced.logs.filter((l) => l.level === 'error').length,
    0,
    JSON.stringify(reduced.logs),
  );
} finally {
  await reduced.close();
}
console.log('PASS: story scroll, fast down/up, responsive cleanup, reduced motion, console.');

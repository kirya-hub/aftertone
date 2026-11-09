import assert from 'node:assert/strict';
import { browser } from './browser.mjs';
const b = await browser();
try {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    await b.viewport(w, h);
    await b.go();
    assert.equal(
      await b.js('return document.documentElement.scrollWidth <= innerWidth'),
      true,
      'No horizontal overflow',
    );
    await b.shot(`stage1-${w}-hero`);
    await b.scroll('#approach');
    await b.shot(`stage1-${w}-approach`);
    await b.scroll('#demo');
    await b.shot(`stage1-${w}-demo`);
    await b.scroll('#faq');
    await b.click('.faq-list summary');
    assert.equal(await b.js('return document.querySelector(".faq-list details").open'), true);
    await b.shot(`stage1-${w}-faq`);
  }
  assert.equal(b.logs.filter((l) => l.level === 'error').length, 0, JSON.stringify(b.logs));
  console.log('PASS: 1440/390 layouts, no overflow, FAQ and console; 8 screenshots.');
} finally {
  await b.close();
}

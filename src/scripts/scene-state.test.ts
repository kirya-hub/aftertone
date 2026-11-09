import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createScene,
  selectSource,
  selectedSource,
  setPosition,
  positionLabel,
  relativeCoordinate,
} from './scene-state.ts';

test('fresh scenes are independent and reset all edited positions', () => {
  const first = createScene();
  first.sources[0].x = 80;
  const reset = createScene();
  assert.equal(reset.sources[0].x, 29);
  assert.equal(reset.selected, 'air');
});
test('selection accepts known sources and preserves the state for unknown input', () => {
  const scene = createScene();
  assert.equal(selectedSource(selectSource(scene, 'signal')).name, 'Signal');
  assert.equal(selectSource(scene, 'unknown'), scene);
  assert.equal(scene.selected, 'air');
});
test('movement clamps to the playable area without moving other sources or mutating input', () => {
  const scene = createScene();
  const next = setPosition(scene, 'voice', -300, 600);
  assert.deepEqual([next.sources[1].x, next.sources[1].y], [10, 90]);
  assert.deepEqual([scene.sources[1].x, scene.sources[1].y], [71, 42]);
  assert.equal(next.sources[0], scene.sources[0]);
  assert.equal(next.sources[2], scene.sources[2]);
});
test('invalid pointer coordinates cannot poison a scene', () => {
  const scene = createScene();
  assert.equal(setPosition(scene, 'air', NaN, 10), scene);
  assert.equal(setPosition(scene, 'air', 20, Infinity), scene);
});
test('position descriptions are consistent with the front/back orientation and center tolerance', () => {
  assert.equal(positionLabel(10, 10), 'Front left');
  assert.equal(positionLabel(90, 90), 'Back right');
  assert.equal(positionLabel(50, 50), 'At the listener');
  assert.equal(positionLabel(55, 45), 'At the listener');
  assert.equal(positionLabel(56, 44), 'Front right');
  assert.equal(relativeCoordinate(10), -80);
  assert.equal(relativeCoordinate(50), 0);
  assert.equal(relativeCoordinate(90), 80);
});

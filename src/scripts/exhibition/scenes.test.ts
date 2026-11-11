import assert from 'node:assert/strict';
import * as T from 'three';
import { createStudy } from './scenes.ts';

// Physical transmission needs a finite, closed shell, including open-path end caps.
for (const transmission of [true, false]) {
  for (const name of ['trace', 'chamber', 'perspective', 'common', 'afterglow']) {
    const env = new T.Texture();
    const study = createStudy(name, env, transmission);
    study.scene.traverse((object) => {
      if (!(object instanceof T.Mesh) || !(object.material instanceof T.MeshPhysicalMaterial))
        return;
      if (!transmission || name === 'chamber')
        assert.equal(
          object.material.transmission,
          0,
          `${name}: repeated/software surfaces avoid transmission passes`,
        );
      const geometry = object.geometry;
      const positions = geometry.getAttribute('position');
      assert.ok([...positions.array].every(Number.isFinite), `${name}: finite shell vertices`);
      const key = (i: number) =>
        [positions.getX(i), positions.getY(i), positions.getZ(i)]
          .map((n) => Math.round(n * 10000))
          .join(',');
      const edges = new Map<string, number>();
      const indices = geometry.index!;
      for (let i = 0; i < indices.count; i += 3) {
        const triangle = [key(indices.getX(i)), key(indices.getX(i + 1)), key(indices.getX(i + 2))];
        for (let j = 0; j < 3; j++) {
          const edge = [triangle[j], triangle[(j + 1) % 3]].sort().join('|');
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      }
      assert.ok(
        [...edges.values()].every((n) => n === 2),
        `${name}: every shell edge has two faces`,
      );
    });
    for (const mobile of [false, true]) {
      study.update(0.5, mobile, 48, 0.05, 1, false, 0);
      assert.ok(
        study.group.children.every((child) => child.visible),
        `${name}: independent paths stay visible`,
      );
      assert.ok(study.camera.position.toArray().every(Number.isFinite));
    }
    study.dispose();
    env.dispose();
  }
}
console.log(
  'Hardware and software versions of five sculptures: finite closed shells, mobile camera and visible independent paths passed',
);

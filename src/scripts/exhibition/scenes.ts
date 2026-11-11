import * as T from 'three';
export type Study = ReturnType<typeof createStudy>;
const tau = Math.PI * 2;
export function environment(renderer: T.WebGLRenderer) {
  // Large coloured softboxes: broad reflections without the white studio/chrome rim.
  const pmrem = new T.PMREMGenerator(renderer),
    room = new T.Scene();
  room.background = new T.Color('#17102b');
  const panels: [number, number, number, string, number][] = [
    [-5, 3, 2, '#9a7cc4', 3],
    [5, 1, -1, '#cb85b4', 2.5],
    [-2, -3, 1, '#6da7b0', 2],
    [0, 6, -4, '#b299df', 1.5],
  ];
  for (const [x, y, z, color, intensity] of panels) {
    const panel = new T.Mesh(
      new T.PlaneGeometry(5, 8),
      new T.MeshBasicMaterial({
        color: new T.Color(color).multiplyScalar(intensity),
        side: T.DoubleSide,
      }),
    );
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    room.add(panel);
  }
  const target = pmrem.fromScene(room, 0.12);
  room.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  pmrem.dispose();
  return target;
}
// A broad swept surface, with real thickness, readable edge reflections and negative space.
function ribbon(
  path: (t: number) => T.Vector3,
  width: number,
  twist: number,
  material: T.Material,
  closed = false,
  detail = 240,
) {
  const group = new T.Group(),
    positions: number[] = [],
    underside: number[] = [],
    indices: number[] = [],
    segments = detail,
    sides = detail === 240 ? 10 : 8;
  const edges: T.Vector3[][] = [[], []];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      p = path(t),
      tangent = path(t + 0.0001)
        .sub(path(t - 0.0001))
        .normalize();
    const normal = new T.Vector3(0, 0, 1).cross(tangent).normalize();
    const binormal = tangent.clone().cross(normal).normalize();
    const turn = t * twist + 0.35 * Math.sin(t * tau);
    const lateral = normal.multiplyScalar(Math.cos(turn)).addScaledVector(binormal, Math.sin(turn));
    const bend = tangent.clone().cross(lateral).normalize();
    for (let j = 0; j <= sides; j++) {
      const taper = closed ? 1 : 0.12 + 0.88 * Math.pow(Math.sin(Math.PI * t), 0.65);
      const v = (j / sides - 0.5) * width * taper,
        crown = Math.sin((j / sides) * Math.PI) * width * 0.11;
      const point = p.clone().addScaledVector(lateral, v).addScaledVector(bend, crown);
      positions.push(point.x, point.y, point.z);
      const back = point.clone().addScaledVector(bend, -0.065);
      underside.push(back.x, back.y, back.z);
      if (j === 0) edges[0].push(point);
      if (j === sides) edges[1].push(point);
      if (i < segments && j < sides) {
        const k = i * (sides + 1) + j;
        indices.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
      }
    }
  }
  const count = positions.length / 3;
  const frontIndices = [...indices];
  positions.push(...underside);
  for (let k = 0; k < frontIndices.length; k += 3)
    indices.push(frontIndices[k] + count, frontIndices[k + 2] + count, frontIndices[k + 1] + count);
  for (let i = 0; i < segments; i++) {
    for (const j of [0, sides]) {
      const a = i * (sides + 1) + j,
        b = a + sides + 1;
      if (j === 0) indices.push(a, b, a + count, b, b + count, a + count);
      else indices.push(a, a + count, b, b, a + count, b + count);
    }
  }
  if (!closed) {
    for (let j = 0; j < sides; j++) {
      const a = j,
        b = segments * (sides + 1) + j;
      indices.push(a, a + count, a + 1, a + 1, a + count, a + count + 1);
      indices.push(b, b + 1, b + count, b + 1, b + count + 1, b + count);
    }
  }
  // Sweep indexing starts on the inward face; orient the closed shell outward.
  for (let k = 0; k < indices.length; k += 3)
    [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  group.add(new T.Mesh(geometry, material));
  edges.forEach((points, i) => {
    const curve = new T.CatmullRomCurve3(points, closed);
    group.add(
      new T.Mesh(
        new T.TubeGeometry(curve, segments, 0.008, 5, closed),
        new T.MeshStandardMaterial({
          color: i ? '#ae398d' : '#489da8',
          emissive: i ? '#ad268c' : '#469bba',
          emissiveIntensity: 0.22,
          metalness: 0.25,
          roughness: 0.32,
        }),
      ),
    );
  });
  return group;
}
export function createStudy(name: string, env: T.Texture, transmission = true) {
  const scene = new T.Scene(),
    group = new T.Group();
  scene.add(group);
  scene.environment = env;
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  scene.add(new T.HemisphereLight(0xc8c2ff, 0x16091f, 0.35));
  [
    [-4, 4, 5, 0x9772ed, 23],
    [4, 0, 3, 0xe84ca9, 22],
    [-3, -2, -2, 0x46cfee, 18],
  ].forEach(([x, y, z, c, p]) => {
    const light = new T.PointLight(c, p, 30, 1.5);
    light.position.set(x, y, z);
    scene.add(light);
  });
  const materials = [0x9874bc, 0xb578a2, 0x7196ac].map(
    (color) =>
      new T.MeshPhysicalMaterial({
        color,
        metalness: 0.32,
        roughness: 0.22,
        clearcoat: 1,
        clearcoatRoughness: 0.23,
        // Repeated Chamber ribs rely on reflections; avoid stacked transmission passes.
        transmission: transmission && name !== 'chamber' ? 0.38 : 0,
        thickness: 0.6,
        ior: 1.42,
        attenuationColor: new T.Color(color),
        attenuationDistance: 2.4,
        iridescence: 0,
        iridescenceIOR: 1.4,
        side: T.FrontSide,
        envMapIntensity: 1.15,
      }),
  );
  const paths: T.Group[] = [];
  const add = (
    path: (t: number) => T.Vector3,
    w: number,
    twist: number,
    index: number,
    closed = false,
  ) => {
    const mesh = ribbon(path, w, twist, materials[index % 3], closed, transmission ? 240 : 180);
    group.add(mesh);
    paths.push(mesh);
    return mesh;
  };
  if (name === 'trace') {
    add(
      (t) => new T.Vector3((t - 0.5) * 9, Math.sin(t * tau - 0.8) * 1.2, Math.sin(t * tau) * 0.8),
      1.25,
      Math.PI * 2,
      0,
    );
    group.rotation.z = 0.28;
  } else if (name === 'chamber') {
    const template = ribbon(
      (t) => {
        const a = t * tau;
        return new T.Vector3(
          Math.cos(a) * (2.1 + 0.2 * Math.sin(a * 3)),
          Math.sin(a) * 2.1 * 0.87,
          Math.sin(a * 2) * 0.3,
        );
      },
      0.22,
      Math.PI * 2,
      materials[0],
      true,
      transmission ? 240 : 180,
    );
    for (let color = 0; color < 3; color++) {
      const indices = Array.from({ length: 16 }, (_, i) => i).filter((i) => i % 3 === color);
      template.children.forEach((child, part) => {
        const mesh = child as T.Mesh;
        const instances = new T.InstancedMesh(
          mesh.geometry,
          part === 0 ? materials[color] : mesh.material,
          indices.length,
        );
        const transform = new T.Object3D();
        indices.forEach((i, n) => {
          transform.position.set(Math.sin(i * 0.22) * 0.65, 0, -i * 0.65);
          transform.rotation.z = i * 0.12;
          transform.scale.setScalar((2.1 + i * 0.035) / 2.1);
          transform.updateMatrix();
          instances.setMatrixAt(n, transform.matrix);
        });
        instances.instanceMatrix.needsUpdate = true;
        group.add(instances);
      });
    }
    group.rotation.y = 0.25;
    group.rotation.z = -0.16;
  } else if (name === 'perspective') {
    // Three co-axial apertures align from Front; parallax reveals their separation.
    for (let i = 0; i < 3; i++) {
      const mesh = add(
        (t) => {
          const a = t * tau;
          return new T.Vector3(Math.cos(a) * 2.05, Math.sin(a) * 1.85, 0.12 * Math.sin(a * 2));
        },
        0.48,
        0,
        i,
        true,
      );
      mesh.position.z = (i - 1) * 1.8;
      mesh.rotation.z = (i - 1) * 0.12;
    }
  } else if (name === 'common') {
    // Independent open trajectories weave through a shared central span.
    for (let i = 0; i < 3; i++) {
      add(
        (t) => {
          const x = (t - 0.5) * 8;
          const phase = t * tau + (i * tau) / 3;
          return new T.Vector3(x, Math.sin(phase) * 1.35 + (i - 1) * 0.3, Math.cos(phase) * 1.5);
        },
        0.64,
        Math.PI * 1.4,
        i,
      );
    }
  } else {
    // An opening crescent and two receding echoes: a final illuminated horizon.
    for (let i = 0; i < 3; i++) {
      const mesh = add(
        (t) => {
          const a = t * Math.PI * 1.78 + 0.24;
          return new T.Vector3(Math.cos(a) * 3.15, Math.sin(a) * 1.65, Math.sin(a) * 0.7);
        },
        i === 0 ? 0.64 : 0.18,
        Math.PI * 0.7,
        i,
      );
      mesh.position.z = -i * 0.85;
      mesh.position.y = i * 0.22;
      mesh.scale.setScalar(1 - i * 0.09);
    }
    group.rotation.z = -0.22;
  }
  const raycaster = new T.Raycaster();
  function pick(x: number, y: number) {
    raycaster.setFromCamera(new T.Vector2(x, y), camera);
    return raycaster.intersectObjects(paths, true).length > 0;
  }
  function update(
    progress: number,
    mobile: boolean,
    angle: number,
    elevation: number,
    selected: number,
    reduced: boolean,
    pointer: number,
  ) {
    camera.position.set(0, 0, mobile ? (name === 'perspective' ? 14 : 16) : 10);
    group.position.y = 0;
    group.scale.setScalar(1);
    camera.lookAt(0, 0, 0);
    const p = reduced ? 0.5 : progress;
    if (name === 'trace') {
      group.scale.set(mobile ? 0.96 : 1, 0.45 + p * 0.95, 0.65 + p * 0.5);
      group.rotation.z = mobile ? 0.65 : 0.28 + (p - 0.5) * 0.2;
      group.rotation.y = (p - 0.5) * 0.5 + pointer * 0.06;
    }
    if (name === 'chamber') {
      camera.position.z = (mobile ? 10 : 6.5) - p * (mobile ? 1 : 2.8);
      camera.position.x = 0.4 * Math.sin(p * 2);
      camera.lookAt(0, 0, -4);
      const exit = T.MathUtils.smoothstep(p, 0.52, 0.88);
      group.scale.setScalar(1 - exit * 0.28);
      group.rotation.y = 0.25 * (1 - exit);
      group.rotation.z = -0.15 + p * 0.17;
      camera.position.x += reduced ? 0 : pointer * 0.12;
    }
    if (name === 'perspective') {
      const entrance = reduced ? 0 : 1 - T.MathUtils.smoothstep(p, 0.15, 0.48);
      group.rotation.z = entrance * -0.14;
      group.scale.setScalar(1 + entrance * 0.16);
      group.rotation.y = (angle * Math.PI) / 180;
      group.rotation.x = elevation;
    }
    if (name === 'common') {
      group.rotation.y = (p - 0.5) * 0.55;
      group.rotation.z = mobile ? 0.9 : -0.12;
      group.scale.setScalar(mobile ? 0.84 : 1);
      paths.forEach((path, i) => {
        path.scale.setScalar(selected < 0 || selected === i ? 1 : 0.96);
      });
      materials.forEach((m, i) => {
        m.emissive.setHex(selected === i ? [0x702bc0, 0xc03587, 0x288a9c][i] : 0);
        m.emissiveIntensity = 0.4;
        m.transmission = transmission ? (selected < 0 || selected === i ? 0.28 : 0.52) : 0;
      });
    }
    if (name === 'afterglow') {
      group.rotation.x = -0.22 + p * 0.5;
      group.scale.setScalar(mobile ? 0.84 + p * 0.1 : 1.04 + p * 0.12);
      group.rotation.z = mobile ? -0.4 : -0.22;
    }
  }
  function dispose() {
    scene.traverse((o) => {
      if (o instanceof T.Mesh) {
        if (o instanceof T.InstancedMesh) o.dispose();
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
    materials.forEach((m) => m.dispose());
    scene.clear();
  }
  return { scene, camera, group, update, dispose, pick };
}

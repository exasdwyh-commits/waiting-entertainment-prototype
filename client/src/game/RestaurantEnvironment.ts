import * as THREE from "three";
import { TABLE_PUSH_GEOMETRY } from "@waiting/shared";

function box(
  size: [number, number, number],
  color: number,
  roughness = 0.78,
) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
}

function addChair(scene: THREE.Scene, angle: number, radius: number) {
  const chair = new THREE.Group();
  const wood = 0x6f442d;
  const upholstery = 0x7f1d1d;

  const seat = box([1.25, 0.18, 1.25], upholstery, 0.9);
  seat.position.y = 0.9;
  chair.add(seat);

  const back = box([1.25, 1.45, 0.18], upholstery, 0.88);
  back.position.set(0, 1.65, 0.53);
  chair.add(back);

  const legGeometry = new THREE.BoxGeometry(0.16, 1.8, 0.16);
  const legMaterial = new THREE.MeshStandardMaterial({ color: wood, roughness: 0.82 });
  for (const [x, z] of [
    [-0.48, -0.48],
    [0.48, -0.48],
    [-0.48, 0.48],
    [0.48, 0.48],
  ] as const) {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(x, 0, z);
    chair.add(leg);
  }

  chair.position.set(
    Math.cos(angle) * radius,
    -3.68,
    Math.sin(angle) * radius,
  );
  chair.rotation.y = -angle + Math.PI / 2;

  chair.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  scene.add(chair);
}

function addBackgroundTable(
  scene: THREE.Scene,
  x: number,
  z: number,
  scale = 1,
) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35 * scale, 1.35 * scale, 0.18, 24),
    new THREE.MeshStandardMaterial({ color: 0x8b5a35, roughness: 0.76 }),
  );
  top.position.y = 1.5 * scale;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, 1.55 * scale, 16),
    new THREE.MeshStandardMaterial({ color: 0x36251e, roughness: 0.82 }),
  );
  stand.position.y = 0.7 * scale;
  stand.castShadow = true;
  group.add(stand);

  group.position.set(x, -3.68, z);
  scene.add(group);
}

function makeSignTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#160d0a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#f6d9a7");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#f6d9a7");
  ctx.fillStyle = gradient;
  ctx.font = "900 92px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("餐桌推推王", canvas.width / 2, 118);

  ctx.fillStyle = "rgba(255,255,255,.62)";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText("TABLE PUSH KING", canvas.width / 2, 200);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function addRestaurantEnvironment(scene: THREE.Scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 46),
    new THREE.MeshStandardMaterial({
      color: 0x2b1c17,
      roughness: 0.92,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.68;
  floor.receiveShadow = true;
  scene.add(floor);

  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(TABLE_PUSH_GEOMETRY.arenaRadius + 2.55, 72),
    new THREE.MeshStandardMaterial({
      color: 0x461a17,
      roughness: 0.96,
    }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = -3.665;
  rug.receiveShadow = true;
  scene.add(rug);

  const backWall = box([34, 11, 0.35], 0x201713, 0.92);
  backWall.position.set(0, 0.9, -17);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const leftWall = box([0.35, 11, 34], 0x241914, 0.94);
  leftWall.position.set(-17, 0.9, 0);
  scene.add(leftWall);

  const rightWall = box([0.35, 11, 28], 0x241914, 0.94);
  rightWall.position.set(17, 0.9, 0);
  scene.add(rightWall);

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xc99552,
    roughness: 0.55,
    metalness: 0.18,
  });
  for (const x of [-11.5, -5.75, 0, 5.75, 11.5]) {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 8.8, 0.08),
      trimMaterial,
    );
    trim.position.set(x, 0.9, -16.78);
    scene.add(trim);
  }

  for (let index = 0; index < 8; index += 1) {
    addChair(
      scene,
      (index / 8) * Math.PI * 2,
      TABLE_PUSH_GEOMETRY.arenaRadius + 3.25,
    );
  }

  addBackgroundTable(scene, -13.1, -10.8, 0.95);
  addBackgroundTable(scene, 13.0, -11.0, 0.95);
  addBackgroundTable(scene, -13.2, 8.8, 0.86);
  addBackgroundTable(scene, 13.2, 8.4, 0.86);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 2.05),
    new THREE.MeshBasicMaterial({
      map: makeSignTexture(),
      transparent: true,
      toneMapped: false,
    }),
  );
  sign.position.set(0, 2.15, -16.78);
  scene.add(sign);

  for (const x of [-7.5, 0, 7.5]) {
    const cord = box([0.055, 3.1, 0.055], 0x211714, 0.85);
    cord.position.set(x, 6.45, -4.2);
    scene.add(cord);

    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.72, 0.75, 18, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x3a2017,
        roughness: 0.7,
        side: THREE.DoubleSide,
      }),
    );
    shade.position.set(x, 4.65, -4.2);
    shade.rotation.x = Math.PI;
    scene.add(shade);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdf9d }),
    );
    bulb.position.set(x, 4.35, -4.2);
    scene.add(bulb);

    const light = new THREE.PointLight(0xffc56e, 9, 10, 2);
    light.position.copy(bulb.position);
    light.castShadow = false;
    scene.add(light);
  }

  const ambientWarm = new THREE.PointLight(0xff9f58, 4.5, 22, 2);
  ambientWarm.position.set(0, 4.5, 5.5);
  scene.add(ambientWarm);
}

import * as THREE from "/three/three.module.js";
import { loadNavalArt, updateShipArt } from "/naval-art.mjs";

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const isDisplay = location.pathname === "/display";
const hubMode = query.get("hub") === "1";
const hubName = (query.get("name") || "").trim().slice(0, 12);
const hubRound = (query.get("round") || "").trim().toUpperCase();
document.body.classList.toggle("display", isDisplay);
document.body.classList.toggle("hub-mode", hubMode);
document.body.classList.toggle("hub-admission", Boolean(hubName));

const UPGRADE_COPY = {
  speed: ["疾风船体", "基础速度与加速上限提高"],
  cannons: ["追加火炮", "每次侧舷齐射增加一枚炮弹"],
  energy: ["能量舱", "加速能量上限与回复提高"],
  attack: ["重炮弹药", "炮弹伤害提高"],
  fireRate: ["快速装填", "侧舷炮攻击间隔缩短"],
  hp: ["强化船壳", "最大生命提高并立即修复"],
  size: ["旗舰扩建", "体型、耐久与炮击威力提高"],
};

const scene = new THREE.Scene();
scene.background = new THREE.Color("#4e94a3");
scene.fog = new THREE.Fog("#4e94a3", 115, 235);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isDisplay ? 1.5 : 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("scene").append(renderer.domElement);

const phoneSpan = 26;
const camera = isDisplay
  ? new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 220)
  : new THREE.OrthographicCamera(-phoneSpan * innerWidth / innerHeight / 2,
    phoneSpan * innerWidth / innerHeight / 2, phoneSpan / 2, -phoneSpan / 2, 0.1, 220);
camera.position.set(0, isDisplay ? 58 : 38, isDisplay ? 52 : 24);

scene.add(new THREE.HemisphereLight("#baf8ff", "#073a43", 2.25));
const sun = new THREE.DirectionalLight("#fff0ce", 3.2);
sun.position.set(-38, 65, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(isDisplay ? 2048 : 1024, isDisplay ? 2048 : 1024);
sun.shadow.camera.left = -72;
sun.shadow.camera.right = 72;
sun.shadow.camera.top = 72;
sun.shadow.camera.bottom = -72;
scene.add(sun);

const waterGeo = new THREE.PlaneGeometry(420, 420);
const waterMat = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, storm: { value: 0 } },
  vertexShader: `varying vec2 sea;
    void main() {
      sea = (modelMatrix * vec4(position, 1.0)).xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `varying vec2 sea;
    uniform float time;
    uniform float storm;
    void main() {
      float swell = sin(sea.x * .28 + sea.y * .19 + time * .35) * .5 + .5;
      float crease = sin(sea.x * 2.2 + sea.y * 1.1 - time * 1.2 + sin(sea.y * .55) * .7);
      float foam = smoothstep(.93, .99, crease)
        * smoothstep(.05, .45, sin(sea.y * 1.7 - sea.x + time * .22)) * .024;
      vec3 day = mix(vec3(.035, .24, .30), vec3(.055, .34, .39), swell);
      vec3 stormSea = mix(vec3(.025, .075, .14), vec3(.05, .13, .20), swell);
      vec3 color = mix(day, stormSea, storm) + vec3(.38, .66, .68) * foam;
      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.12;
scene.add(water);

const ringMat = new THREE.MeshBasicMaterial({
  color: "#7ce8e5",
  transparent: true,
  opacity: 0.1,
  side: THREE.DoubleSide,
});
for (const radius of [18, 34, 52, 58]) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.08, radius + 0.08, 96), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  scene.add(ring);
}

const safeZoneRing = new THREE.Mesh(
  new THREE.RingGeometry(0.985, 1.0, 128),
  new THREE.MeshBasicMaterial({
    color: "#ff5d73",
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
safeZoneRing.rotation.x = -Math.PI / 2;
safeZoneRing.position.y = 0.045;
safeZoneRing.visible = false;
scene.add(safeZoneRing);

const islandMat = new THREE.MeshStandardMaterial({ color: "#7f6848", roughness: 0.92 });
const coast = [];
for (let i = 0; i < 13; i++) {
  const a = i / 13 * Math.PI * 2 + 0.16;
  const r = 62 + (i % 3) * 2.6;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(2.4 + (i % 4) * 0.8, 0),
    islandMat,
  );
  rock.position.set(Math.cos(a) * r, 0.8, Math.sin(a) * r);
  rock.scale.y = 0.8 + (i % 2) * 0.45;
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  coast.push({ rock, index: i, x: rock.position.x, z: rock.position.z });
}

const navalArt = {};
const buoys = [];
function applyNavalArt(art) {
  Object.assign(navalArt, art);
  for (const { rock, index, x, z } of coast) {
    const kind = index % 4 === 0 ? "reef" : index % 2 === 0 ? "island-palm" : "island-crag";
    const template = art[kind];
    if (!template) continue;
    const island = template.clone(true);
    island.position.set(x, 0, z);
    island.rotation.y = index * 1.37;
    island.scale.setScalar(kind === "reef" ? 2.9 : 1.55 + index % 3 * .28);
    scene.add(island);
    rock.visible = false;
  }
  if (art.buoy) {
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      const buoy = art.buoy.clone(true);
      buoy.position.set(Math.cos(angle) * 59.5, 0, Math.sin(angle) * 59.5);
      buoy.scale.setScalar(.78);
      scene.add(buoy);
      buoys.push(buoy);
    }
  }
  if (art["supply-crate"]) {
    for (const group of crateMeshes) {
      group.userData.fallbackBox.visible = false;
      const crate = art["supply-crate"].clone(true);
      crate.scale.setScalar(2.0);
      group.add(crate);
    }
  }
}

function makeBoat(color) {
  const group = new THREE.Group();
  const fallbackVisual = new THREE.Group();
  group.add(fallbackVisual);

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color: "#07313b", transparent: true, opacity: 0.22, depthWrite: false }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.scale.set(1.65, 2.65, 1);
  contactShadow.position.y = -0.1;
  group.add(contactShadow);

  const hullMat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    metalness: 0.12,
    clearcoat: 0.45,
    emissive: "#000000",
    emissiveIntensity: 0,
  });
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.75, 4.5),
    hullMat,
  );
  hull.position.y = 0.55;
  hull.castShadow = true;
  fallbackVisual.add(hull);

  const bow = new THREE.Mesh(
    new THREE.ConeGeometry(1.18, 2.1, 4),
    hull.material,
  );
  bow.rotation.x = Math.PI / 2;
  bow.rotation.z = Math.PI / 4;
  bow.position.set(0, 0.55, 3.25);
  bow.castShadow = true;
  fallbackVisual.add(bow);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.42, 1.7),
    new THREE.MeshStandardMaterial({ color: "#e9d8b4", roughness: 0.72 }),
  );
  deck.position.set(0, 1.12, -0.2);
  deck.castShadow = true;
  fallbackVisual.add(deck);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 2.9, 8),
    new THREE.MeshStandardMaterial({ color: "#47372a", roughness: 0.8 }),
  );
  mast.position.set(0, 2.1, -0.45);
  mast.castShadow = true;
  fallbackVisual.add(mast);

  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.7),
    new THREE.MeshStandardMaterial({
      color: "#f8fafc",
      roughness: 0.85,
      side: THREE.DoubleSide,
    }),
  );
  sail.position.set(0.08, 2.25, -0.35);
  sail.rotation.y = Math.PI / 2;
  fallbackVisual.add(sail);

  const cannonMat = new THREE.MeshStandardMaterial({ color: "#29323b", roughness: 0.35, metalness: 0.7 });
  for (const side of [-1, 1]) {
    for (const z of [-0.9, 0.9]) {
      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.0, 8), cannonMat);
      cannon.rotation.z = Math.PI / 2;
      cannon.position.set(side * 1.4, 0.86, z);
      cannon.castShadow = true;
      fallbackVisual.add(cannon);
    }
  }

  const wake = new THREE.Group();
  const wakeMaterial = new THREE.MeshBasicMaterial({
    color: "#d7ffff",
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const wakeStrip = new THREE.PlaneGeometry(0.15, 4.6);
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(wakeStrip, wakeMaterial);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = side * 0.16;
    strip.position.set(side * 1.12, 0, -3.6);
    wake.add(strip);
  }
  wake.position.y = 0.025;
  group.add(wake);
  group.userData.wake = wake;
  group.userData.wakeMaterial = wakeMaterial;
  group.userData.hullMat = hullMat;
  group.userData.fallbackVisual = fallbackVisual;

  const flashMat = new THREE.MeshBasicMaterial({
    color: "#ffe7a3",
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const smokeMat = new THREE.MeshBasicMaterial({
    color: "#d9e3df",
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const flashes = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 5; index++) {
      const point = new THREE.Group();
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.33, 8, 6), flashMat);
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 5), smokeMat);
      smoke.position.x = side * 0.31;
      point.add(flash, smoke);
      point.position.set(side * 1.63, 0.88, (index - 2) * 0.7);
      point.visible = false;
      group.add(point);
      flashes.push({ point, flash, smoke, side, index });
    }
  }
  group.userData.flashes = flashes;

  scene.add(group);
  return group;
}

const boatMeshes = Array.from({ length: 8 }, (_, id) =>
  makeBoat(["#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#14b8a6", "#f59e0b", "#64748b", "#ec4899"][id])
);
const wakeTrailGeometry = new THREE.PlaneGeometry(0.3, 1.7);
wakeTrailGeometry.rotateX(-Math.PI / 2);
const wakeTrail = new THREE.InstancedMesh(wakeTrailGeometry,
  new THREE.MeshBasicMaterial({ color: "#d5ffff", transparent: true, opacity: 0.24,
    depthWrite: false, side: THREE.DoubleSide }), 8 * 18 * 2);
wakeTrail.count = 0;
wakeTrail.frustumCulled = false;
scene.add(wakeTrail);
const wakeTracks = Array.from({ length: 8 }, () => ({ samples: [], timer: 0, x: null, z: null }));
const wakePosition = new THREE.Vector3();
const wakeRotation = new THREE.Quaternion();
const wakeScale = new THREE.Vector3();
const wakeMatrix = new THREE.Matrix4();
const upAxis = new THREE.Vector3(0, 1, 0);
let wakeRound = null;

function updateWakeTrail(dt) {
  if (wakeRound !== state.round) {
    for (const track of wakeTracks) { track.samples.length = 0; track.x = null; track.z = null; }
    wakeRound = state.round;
  }
  let instance = 0;
  for (const boat of state.boats) {
    const track = wakeTracks[boat.id];
    const mesh = boatMeshes[boat.id];
    track.timer += dt;
    const moved = track.x === null ? 0 : Math.hypot(mesh.position.x - track.x, mesh.position.z - track.z);
    if (moved > 10) track.samples.length = 0;
    if (boat.alive && boat.speed > 2 && (track.x === null || moved > 0.48) && track.timer > 0.14) {
      track.samples.push({
        x: mesh.position.x - Math.sin(mesh.rotation.y) * 2.1,
        z: mesh.position.z - Math.cos(mesh.rotation.y) * 2.1,
        heading: mesh.rotation.y, age: 0,
      });
      if (track.samples.length > 18) track.samples.shift();
      track.x = mesh.position.x;
      track.z = mesh.position.z;
      track.timer = 0;
    }
    for (let index = track.samples.length - 1; index >= 0; index--) {
      const sample = track.samples[index];
      sample.age += dt;
      if (sample.age >= 2.8) { track.samples.splice(index, 1); continue; }
      const fade = Math.pow(1 - sample.age / 2.8, 1.5);
      wakeRotation.setFromAxisAngle(upAxis, sample.heading);
      wakeScale.set(0.55 + fade * 0.7, 1, 0.65 + fade * 0.6);
      for (const side of [-1, 1]) {
        wakePosition.set(sample.x + Math.cos(sample.heading) * side * 0.85, 0.04,
          sample.z - Math.sin(sample.heading) * side * 0.85);
        wakeScale.x = fade * 1.2;
        wakeScale.z = fade * 1.1;
        wakeMatrix.compose(wakePosition, wakeRotation, wakeScale);
        wakeTrail.setMatrixAt(instance++, wakeMatrix);
      }
    }
  }
  wakeTrail.count = instance;
  wakeTrail.instanceMatrix.needsUpdate = true;
}

const crateMat = new THREE.MeshStandardMaterial({
  color: "#ffc857",
  roughness: 0.42,
  metalness: 0.18,
  emissive: "#7f4a00",
  emissiveIntensity: 0.35,
});
const crateMeshes = Array.from({ length: 22 }, (_, id) => {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), crateMat);
  box.rotation.set(0.22, id * 0.7, 0.15);
  box.castShadow = true;
  group.add(box);
  group.userData.fallbackBox = box;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.2, 20),
    new THREE.MeshBasicMaterial({ color: "#ffe29a", transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.55;
  group.add(ring);
  group.userData.pickupRing = ring;
  scene.add(group);
  return group;
});

void loadNavalArt().then(applyNavalArt);

function cannonballTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#777c79";
  context.fillRect(0, 0, 128, 128);
  let seed = 0x5ea2026;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 600; i++) {
    const shade = Math.floor(50 + random() * 75);
    context.fillStyle = `rgba(${shade},${shade + 3},${shade + 2},${0.12 + random() * 0.24})`;
    const size = 0.5 + random() * 3.5;
    context.fillRect(random() * 128, random() * 128, size, size);
  }
  context.strokeStyle = "#3a4240";
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(0, 65);
  context.bezierCurveTo(40, 62, 82, 68, 128, 65);
  context.stroke();
  context.strokeStyle = "#a4aaa1";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, 68);
  context.bezierCurveTo(40, 65, 82, 71, 128, 68);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const projectileTexture = cannonballTexture();
const projectileGeo = new THREE.SphereGeometry(0.38, 16, 12);
const projectileMat = new THREE.MeshStandardMaterial({
  map: projectileTexture,
  bumpMap: projectileTexture,
  bumpScale: 0.035,
  color: "#d7d9d5",
  metalness: 0.38,
  roughness: 0.79,
});
const projectileMeshes = new Map();
const projectileTarget = new THREE.Vector3();
const pickupEffects = [];
const pickupRingGeometry = new THREE.RingGeometry(0.58, 0.78, 28);
const impactRingGeometry = new THREE.RingGeometry(0.68, 0.9, 28);
const impactSprayGeometry = new THREE.ConeGeometry(0.48, 1.8, 7);
const impactEffects = [];

function showImpactEffect(x, z, kind = "splash") {
  if (impactEffects.length >= 48) {
    const oldest = impactEffects.shift();
    scene.remove(oldest.group);
    oldest.ring.material.dispose();
    oldest.spray.material.dispose();
  }
  const strong = kind === "sink";
  const group = new THREE.Group();
  const ring = new THREE.Mesh(impactRingGeometry, new THREE.MeshBasicMaterial({
    color: kind === "hit" ? "#ffe5b0" : "#ccfaff",
    transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const spray = new THREE.Mesh(impactSprayGeometry, new THREE.MeshBasicMaterial({
    color: strong ? "#e9f5f2" : kind === "hit" ? "#ffe0ae" : "#bdf6fa",
    transparent: true, opacity: 0.72, depthWrite: false,
  }));
  spray.position.y = 0.8;
  group.add(ring, spray);
  group.position.set(x, 0, z);
  group.scale.setScalar(strong ? 2.4 : kind === "hit" ? 1.35 : 1);
  scene.add(group);
  impactEffects.push({ group, ring, spray, age: 0, life: strong ? 1.2 : 0.7 });
}

function showPickupEffect(mesh) {
  const ring = new THREE.Mesh(
    pickupRingGeometry,
    new THREE.MeshBasicMaterial({ color: "#ffe39b", transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(mesh.position.x, 0.08, mesh.position.z);
  scene.add(ring);
  pickupEffects.push({ ring, age: 0 });
}

const monster = new THREE.Group();
const monsterBody = new THREE.Mesh(
  new THREE.SphereGeometry(4.4, 20, 14),
  new THREE.MeshStandardMaterial({
    color: "#6b2c91",
    roughness: 0.46,
    emissive: "#3b145d",
    emissiveIntensity: 0.9,
  }),
);
monsterBody.position.y = 1.55;
monsterBody.scale.y = 0.72;
monster.add(monsterBody);

for (const x of [-1.35, 1.35]) {
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 10, 8),
    new THREE.MeshBasicMaterial({ color: "#ff5d9b" }),
  );
  eye.position.set(x, 2.35, 3.3);
  monster.add(eye);
}

for (let i = 0; i < 7; i++) {
  const tentacle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.62, 7.2, 9),
    monsterBody.material,
  );
  const a = i / 7 * Math.PI * 2;
  tentacle.position.set(Math.cos(a) * 3.1, 0.25, Math.sin(a) * 3.1);
  tentacle.rotation.z = 0.55 + (i % 2) * 0.3;
  tentacle.rotation.y = -a;
  tentacle.userData.phase = i;
  monster.add(tentacle);
}
monster.visible = false;
scene.add(monster);

const monsterHalo = new THREE.Mesh(
  new THREE.RingGeometry(5.0, 6.4, 64),
  new THREE.MeshBasicMaterial({
    color: "#ff5d9b",
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
monsterHalo.rotation.x = -Math.PI / 2;
monsterHalo.position.y = 0.06;
monsterHalo.visible = false;
scene.add(monsterHalo);

const danger = new THREE.Mesh(
  new THREE.RingGeometry(7.4, 8.6, 48),
  new THREE.MeshBasicMaterial({ color: "#ff4664", transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
);
danger.rotation.x = -Math.PI / 2;
danger.position.y = 0.03;
danger.visible = false;
scene.add(danger);

const broadsideTargetRing = new THREE.Mesh(
  new THREE.RingGeometry(1.45, 1.64, 36),
  new THREE.MeshBasicMaterial({
    color: "#ffd166",
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
broadsideTargetRing.rotation.x = -Math.PI / 2;
broadsideTargetRing.position.y = 0.08;
broadsideTargetRing.visible = false;
scene.add(broadsideTargetRing);

const bountyRing = new THREE.Mesh(
  new THREE.RingGeometry(2.0, 2.5, 42),
  new THREE.MeshBasicMaterial({
    color: "#ffe36e",
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
bountyRing.rotation.x = -Math.PI / 2;
bountyRing.position.y = 0.1;
bountyRing.visible = false;
scene.add(bountyRing);

let state = null;
let myId = null;
let token = "";
let currentChoicesKey = "";
let steer = 0;
let throttle = false;
let previous = performance.now();
const cameraTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const displayLookTarget = new THREE.Vector3();
let cameraFollowReady = false;
const director = {
  mode: "overview", focusId: null, targetId: null,
  until: 0, seenEventId: null, round: null, lastTime: -1,
};
let lastVisualEventId = null;
let lastVisualRound = null;

function collectVisualEvents() {
  if (lastVisualRound !== state.round || lastVisualEventId === null) {
    lastVisualRound = state.round;
    lastVisualEventId = state.events[0]?.id ?? 0;
    return;
  }
  for (const event of [...state.events].reverse()) {
    if (event.id <= lastVisualEventId) continue;
    const boat = state.boats[event.boatId];
    if (event.type === "hit" && boat) showImpactEffect(boat.x, boat.z, "hit");
    if (["sink", "bounty_sink"].includes(event.type) && boat) {
      showImpactEffect(boat.x, boat.z, "sink");
    }
    if (event.type === "monster_kill" && state.monster) {
      showImpactEffect(state.monster.x, state.monster.z, "sink");
    }
  }
  lastVisualEventId = Math.max(lastVisualEventId, state.events[0]?.id ?? 0);
}

function selectDirectorShot() {
  const latestEventId = state.events[0]?.id ?? 0;
  if (director.round !== state.round || state.time < director.lastTime) {
    Object.assign(director, {
      mode: "overview", focusId: null, targetId: null,
      until: 0, seenEventId: latestEventId, round: state.round,
    });
  }
  director.lastTime = state.time;
  if (director.seenEventId === null) director.seenEventId = latestEventId;
  const leaderId = state.order.find((id) => state.boats[id]?.alive) ?? null;

  if (state.monster?.alive) {
    const current = state.boats[director.focusId];
    if (director.mode !== "boss" || !current?.alive) {
      let challenger = null;
      let distance = Infinity;
      for (const boat of state.boats) {
        if (!boat.alive) continue;
        const next = Math.hypot(boat.x - state.monster.x, boat.z - state.monster.z);
        if (next < distance) { challenger = boat; distance = next; }
      }
      Object.assign(director, {
        mode: "boss", focusId: challenger?.id ?? null,
        targetId: null, until: state.time + 6,
      });
    }
    director.seenEventId = latestEventId;
    return director;
  }

  const focusAlive = director.focusId === null || state.boats[director.focusId]?.alive;
  if (state.time < director.until && director.mode !== "boss" && focusAlive) return director;

  const event = state.events.find((item) =>
    item.id > director.seenEventId && state.time - item.time < 2.4 &&
    ["sink", "bounty_sink", "monster_kill"].includes(item.type)
  );
  director.seenEventId = latestEventId;
  if (event) {
    const focusId = Number.isInteger(event.killerId) ? event.killerId : event.boatId;
    Object.assign(director, {
      mode: event.type === "monster_kill" ? "leader" : "duel",
      focusId: state.boats[focusId]?.alive ? focusId : leaderId,
      targetId: event.type === "monster_kill" ? null : event.boatId,
      until: state.time + 3.6,
    });
  } else {
    Object.assign(director, {
      mode: leaderId === null ? "overview" : "leader",
      focusId: leaderId, targetId: null, until: state.time + 5,
    });
  }
  return director;
}

try {
  token = localStorage.getItem("sea:token") || "";
  $("name").value = localStorage.getItem("sea:name") || "";
} catch {}

const socket = window.io({
  auth: { role: isDisplay ? "display" : "player" },
});

socket.on("connect", () => {
  $("connection").textContent = "海域连接正常";
  if (isDisplay || myId !== null) return;
  if (hubName) {
    socket.emit("join", { token, name: hubName });
  } else if (token) {
    socket.emit("join", { token, name: $("name").value || "船长" });
  }
});

let hubReturnBusy = false;
async function returnToHubWhenRoundEnds() {
  if (!hubMode || !hubRound || hubReturnBusy) return;
  hubReturnBusy = true;
  try {
    const api = location.protocol + "//" + location.hostname + ":3001/api/platform";
    const response = await fetch(api, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      const round = payload.rounds?.find((candidate) => candidate.code === hubRound);
      if (!round || ["finished", "cancelled", "expired"].includes(round.status)) {
        location.replace(
          location.protocol + "//" + location.hostname + ":5177/join/" +
          encodeURIComponent(hubRound),
        );
        return;
      }
    }
  } catch {
    // Hub may itself be restarting; Socket.IO will keep retrying the game.
  } finally {
    hubReturnBusy = false;
  }
}

socket.on("disconnect", () => {
  $("connection").textContent = hubMode
    ? "本轮连接结束 · 正在确认现场状态"
    : "连接中断 · 正在重连";
  void returnToHubWhenRoundEnds();
});

socket.on("join-error", ({ message }) => {
  $("join-error").textContent = message || "加入失败";
});

socket.on("welcome", (message) => {
  if (message.role !== "player") return;
  myId = message.id;
  token = message.token;
  document.body.classList.add("player-active");
  try {
    localStorage.setItem("sea:token", token);
    localStorage.setItem("sea:name", message.name);
  } catch {}
});

socket.on("state", (next) => {
  state = next;
  updateUi();
});

$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("name").value.trim() || "船长";
  $("join-error").textContent = "";
  socket.emit("join", { name, token });
});

$("start").addEventListener("click", () => socket.emit("start"));

function sendInput() {
  if (myId === null) return;
  socket.emit("input", { steer, throttle });
}

const steerPad = $("steer-pad");
const steerThumb = $("steer-thumb");
let steerPointer = null;

function steerFromPointer(event) {
  const rect = steerPad.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  const raw = (event.clientX - center) / (rect.width * 0.36);
  steer = Math.max(-1, Math.min(1, raw));
  steerThumb.style.transform = `translateX(${steer * rect.width * 0.28}px)`;
  sendInput();
}

steerPad.addEventListener("pointerdown", (event) => {
  if (steerPointer !== null) return;
  steerPointer = event.pointerId;
  steerPad.setPointerCapture(event.pointerId);
  steerFromPointer(event);
});
steerPad.addEventListener("pointermove", (event) => {
  if (event.pointerId === steerPointer) steerFromPointer(event);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  steerPad.addEventListener(type, (event) => {
    if (event.pointerId !== steerPointer) return;
    steerPointer = null;
    steer = 0;
    steerThumb.style.transform = "translateX(0)";
    sendInput();
  });
}

const throttleButton = $("throttle");
let throttlePointer = null;
const setThrottle = (value) => {
  throttle = value;
  throttleButton.classList.toggle("pressed", value);
  sendInput();
};
throttleButton.addEventListener("pointerdown", (event) => {
  if (throttlePointer !== null) return;
  throttlePointer = event.pointerId;
  throttleButton.setPointerCapture(event.pointerId);
  setThrottle(true);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  throttleButton.addEventListener(type, (event) => {
    if (event.pointerId !== throttlePointer) return;
    throttlePointer = null;
    setThrottle(false);
  });
}

function resetControls() {
  steerPointer = null;
  throttlePointer = null;
  steer = 0;
  throttle = false;
  steerThumb.style.transform = "translateX(0)";
  throttleButton.classList.remove("pressed");
  sendInput();
}
addEventListener("blur", resetControls);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetControls();
});

addEventListener("keydown", (event) => {
  if (isDisplay || event.repeat || document.body.classList.contains("upgrading")) return;
  if (event.code === "ArrowLeft" || event.code === "KeyA") steer = -1;
  if (event.code === "ArrowRight" || event.code === "KeyD") steer = 1;
  if (event.code === "Space" || event.code === "ArrowUp") throttle = true;
  sendInput();
});
addEventListener("keyup", (event) => {
  if (isDisplay) return;
  if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)) steer = 0;
  if (["Space", "ArrowUp"].includes(event.code)) throttle = false;
  sendInput();
});

setInterval(sendInput, 120);

function findBroadsideLock(boat) {
  if (!state || !boat?.alive) return null;
  const forward = { x: Math.sin(boat.heading), z: Math.cos(boat.heading) };
  const right = { x: Math.cos(boat.heading), z: -Math.sin(boat.heading) };
  const candidates = state.boats
    .filter((other) => other.id !== boat.id && other.alive)
    .map((target) => ({ kind: "boat", target }));

  if (state.monster?.alive) candidates.push({ kind: "monster", target: state.monster });

  let best = null;
  for (const candidate of candidates) {
    const dx = candidate.target.x - boat.x;
    const dz = candidate.target.z - boat.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 31 || distance < 2) continue;
    const nx = dx / distance, nz = dz / distance;
    const sideDot = nx * right.x + nz * right.z;
    const forwardDot = nx * forward.x + nz * forward.z;
    if (Math.abs(sideDot) < 0.7 || Math.abs(forwardDot) > 0.72) continue;
    if (!best || distance < best.distance) {
      best = {
        ...candidate,
        distance,
        side: sideDot < 0 ? "左舷" : "右舷",
      };
    }
  }
  return best;
}

function updateUi() {
  if (!state) return;
  document.body.classList.toggle("battle-live", state.phase === "racing");
  const phaseLabel = {
    demo: "AI 海域巡游",
    lobby: "等待开战",
    countdown: "准备出航",
    racing: "海域激战",
    result: "本局结算",
  }[state.phase] ?? state.phase;
  $("phase").textContent = phaseLabel;

  const stageLabels = {
    salvage: "物资争夺",
    battle: "炮火升级",
    maelstrom: "风暴决战",
  };
  const stage = state.stage ?? "salvage";
  document.body.dataset.stage = stage;
  $("stage-chip").textContent = stageLabels[stage] ?? stage;

  const seconds = Math.max(0, Math.ceil(state.remaining ?? state.seconds ?? 180));
  $("timer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const ranks = $("ranks");
  ranks.replaceChildren();
  for (let position = 0; position < state.order.length; position++) {
    const boat = state.boats[state.order[position]];
    const li = document.createElement("li");
    li.classList.toggle("me", boat.id === myId);
    const bounty = boat.id === state.bountyId;
    const streak = boat.killStreak > 1 ? ` · 连沉×${boat.killStreak}` : "";
    li.classList.toggle("bounty", bounty);
    li.innerHTML = `<b>${bounty ? "♛" : String(position + 1).padStart(2, "0")}</b><span>${boat.name}<small> · Lv.${boat.level}${streak}</small></span><strong>${boat.score}</strong>`;
    ranks.append(li);
  }

  const list = $("event-list");
  list.replaceChildren();
  for (const event of state.events.slice(0, 6)) {
    const li = document.createElement("li");
    li.textContent = event.text;
    list.append(li);
  }

  const monsterArrival = state.events.find((event) => event.type === "monster_spawn");
  $("monster-warning").hidden = !(state.monster?.alive && monsterArrival &&
    state.time - monsterArrival.time < 3);
  const boss = $("monster-boss");
  boss.hidden = !(state.monster?.alive);
  if (state.monster?.alive) {
    const hp = Math.max(0, state.monster.hp);
    const maxHp = Math.max(1, state.monster.maxHp);
    $("monster-hp-fill").style.width = `${Math.max(0, Math.min(100, hp / maxHp * 100))}%`;
    $("monster-hp-value").textContent = `${Math.ceil(hp)} / ${Math.ceil(maxHp)}`;
  }
  $("storm-warning").hidden = !(state.phase === "racing" && stage === "maelstrom");

  const call = $("battle-call");
  if (state.phase === "countdown") {
    call.textContent = String(Math.max(1, Math.ceil(state.countdown)));
  } else if (state.phase === "result" && state.winnerId !== null) {
    call.textContent = `${state.boats[state.winnerId]?.name ?? "船长"} 胜出`;
  } else {
    call.textContent = "";
  }

  if (myId === null) return;
  const me = state.boats[myId];
  if (!me) return;

  $("player-name").textContent = me.name;
  $("level").textContent = `LV.${me.level}`;
  $("score").textContent = `${me.score} PTS`;
  const bountyBoat = Number.isInteger(state.bountyId) ? state.boats[state.bountyId] : null;
  const bonus = $("combat-bonus");
  if (bonus) {
    if (state.bountyId === me.id) {
      bonus.textContent = "♛ 悬赏旗舰 · 击沉你可获 +6";
      bonus.classList.add("hot");
    } else if (bountyBoat) {
      bonus.textContent = `🎯 悬赏：${bountyBoat.name} +6${me.killStreak > 1 ? ` · 连沉×${me.killStreak}` : ""}`;
      bonus.classList.remove("hot");
    } else {
      bonus.textContent = me.killStreak > 1 ? `🔥 连沉×${me.killStreak}` : "领先舰达到 8 分后进入悬赏";
      bonus.classList.remove("hot");
    }
  }
  $("hp-value").textContent = `${Math.max(0, Math.round(me.hp))}/${Math.round(me.maxHp)}`;
  $("energy-value").textContent = `${Math.round(me.energy)}/${Math.round(me.maxEnergy)}`;
  $("xp-value").textContent = `${me.xp}/${me.nextLevelXp}`;
  $("hp-fill").style.width = `${Math.max(0, Math.min(100, me.hp / me.maxHp * 100))}%`;
  $("energy-fill").style.width = `${Math.max(0, Math.min(100, me.energy / me.maxEnergy * 100))}%`;
  $("xp-fill").style.width = `${Math.max(0, Math.min(100, me.xp / me.nextLevelXp * 100))}%`;

  $("respawn").hidden = me.alive;

  const lock = findBroadsideLock(me);
  const broadsideStatus = $("broadside-status");
  if (lock) {
    broadsideStatus.textContent =
      `${lock.side}锁定 · ${lock.kind === "monster" ? "海怪" : "敌舰"} ${Math.round(lock.distance)}m`;
    broadsideStatus.classList.add("locked");
  } else {
    broadsideStatus.textContent =
      stage === "salvage" ? "抢物资升级 · 调整船身准备侧舷" : "调整船身 · 让敌舰进入左右侧舷";
    broadsideStatus.classList.remove("locked");
  }

  renderUpgrade(me.choices);
}

function renderUpgrade(choices) {
  const key = choices.join("|");
  if (key === currentChoicesKey) return;
  currentChoicesKey = key;
  document.body.classList.toggle("upgrading", choices.length > 0);
  if (choices.length) resetControls();
  const root = $("upgrade-options");
  root.replaceChildren();

  for (const id of choices) {
    const [title, desc] = UPGRADE_COPY[id] ?? [id, ""];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "upgrade-option";
    button.innerHTML = `<b>${title}</b><span>${desc}</span>`;
    button.onclick = () => socket.emit("upgrade", { id });
    root.append(button);
  }
}

function syncProjectiles() {
  const active = new Set();
  for (const projectile of state.projectiles) {
    active.add(projectile.id);
    let mesh = projectileMeshes.get(projectile.id);
    if (!mesh) {
      mesh = new THREE.Mesh(projectileGeo, projectileMat);
      mesh.castShadow = true;
      mesh.userData.fresh = true;
      scene.add(mesh);
      projectileMeshes.set(projectile.id, mesh);
    }
    projectileTarget.set(projectile.x, 0.68, projectile.z);
    mesh.position.lerp(projectileTarget, 0.72);
    if (mesh.userData.fresh) {
      mesh.position.set(projectile.x, 0.68, projectile.z);
      mesh.userData.fresh = false;
    }
    mesh.rotation.x += 0.2;
    mesh.rotation.z += 0.13;
    mesh.scale.setScalar(isDisplay ? 1.35 : 1);
  }
  for (const [id, mesh] of projectileMeshes) {
    if (active.has(id)) continue;
    showImpactEffect(mesh.position.x, mesh.position.z);
    scene.remove(mesh);
    projectileMeshes.delete(id);
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;

  if (state) {
    collectVisualEvents();
    for (const boat of state.boats) {
      const mesh = boatMeshes[boat.id];
      updateShipArt(mesh, boat, navalArt);
      if (boat.alive) mesh.userData.sinkAge = 0;
      else if (mesh.userData.wasAlive) mesh.userData.sinkAge = dt;
      else mesh.userData.sinkAge = Math.min(1.3, (mesh.userData.sinkAge ?? 1.3) + dt);
      mesh.userData.wasAlive = boat.alive;
      const sink = boat.alive ? 0 : Math.min(1, mesh.userData.sinkAge / 1.2);
      mesh.visible = boat.alive || sink < 1;
      if (!mesh.visible) continue;
      mesh.position.x += (boat.x - mesh.position.x) * Math.min(1, dt * 12);
      mesh.position.z += (boat.z - mesh.position.z) * Math.min(1, dt * 12);
      mesh.position.y = 0.12 + Math.sin(now * 0.0025 + boat.id) * 0.08 - sink * 2.8;
      let delta = boat.heading - mesh.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      mesh.rotation.y += delta * Math.min(1, dt * 10);
      mesh.rotation.x = Math.sin(now * 0.0018 + boat.id) * 0.025;
      mesh.rotation.z += ((boat.alive ? Math.max(-0.11, Math.min(0.11, -delta * 0.24)) : sink * 0.65)
        - mesh.rotation.z) * Math.min(1, dt * 7);
      mesh.scale.setScalar((0.86 + boat.radius * 0.12) * (isDisplay ? 1.24 : 1));
      mesh.userData.wakeMaterial.opacity = boat.alive ? 0.07 + Math.min(0.20, boat.speed / 70) : 0;

      const fireAge = state.time - (boat.lastFireAt ?? -999);
      const firing = fireAge >= 0 && fireAge < 0.16;
      for (const flash of mesh.userData.flashes) {
        flash.point.visible = boat.alive && firing && flash.side === boat.lastFireSide &&
          flash.index < boat.cannonCount;
        if (flash.point.visible) {
          const offset = Math.max(0, fireAge - flash.index * 0.018);
          flash.point.position.z = (flash.index - (boat.cannonCount - 1) / 2) * 0.72;
          flash.point.scale.setScalar(0.75 + (1 - offset / 0.16) * 1.1);
          flash.flash.scale.setScalar(Math.max(0.05, 1 - offset / 0.16));
          flash.smoke.scale.setScalar(0.7 + offset * 7);
        }
      }

      const hitAge = state.time - (boat.lastHitAt ?? -999);
      const hitGlow = hitAge >= 0 && hitAge < 0.24 ? 1 - hitAge / 0.24 : 0;
      const hitMaterial = mesh.userData.teamMaterial ?? mesh.userData.hullMat;
      hitMaterial.emissive.setRGB(hitGlow * 0.9, hitGlow * 0.14, hitGlow * 0.05);
      hitMaterial.emissiveIntensity = hitGlow * 1.7;
    }
    updateWakeTrail(dt);

    for (const crate of state.crates) {
      const mesh = crateMeshes[crate.id];
      const wasActive = mesh.userData.wasActive === true;
      mesh.visible = crate.active;
      mesh.userData.wasActive = crate.active;
      if (!crate.active) {
        if (wasActive) showPickupEffect(mesh);
        continue;
      }
      const bob = 0.78 + Math.sin(now * 0.003 + crate.id) * 0.22;
      if (!wasActive) mesh.position.set(crate.x, bob, crate.z);
      else {
        const follow = 1 - Math.exp(-dt * 16);
        mesh.position.x += (crate.x - mesh.position.x) * follow;
        mesh.position.z += (crate.z - mesh.position.z) * follow;
        mesh.position.y += (bob - mesh.position.y) * follow;
      }
      let nearestDistance = 8;
      for (const boat of state.boats) {
        if (!boat.alive) continue;
        nearestDistance = Math.min(nearestDistance,
          Math.hypot(boat.x - crate.x, boat.z - crate.z));
      }
      const magnet = Math.max(0, (8 - nearestDistance) / 8);
      mesh.rotation.y += dt * (0.8 + magnet * 2.2);
      mesh.scale.setScalar(1 + magnet * 0.16 + Math.sin(now * 0.009 + crate.id) * magnet * 0.04);
      mesh.userData.pickupRing.scale.setScalar(1 + magnet * 0.5);
      mesh.userData.pickupRing.material.opacity = 0.25 + magnet * 0.55;
    }

    for (let i = pickupEffects.length - 1; i >= 0; i--) {
      const effect = pickupEffects[i];
      effect.age += dt;
      effect.ring.scale.setScalar(1 + effect.age * 5);
      effect.ring.material.opacity = Math.max(0, 0.7 * (1 - effect.age / 0.35));
      if (effect.age < 0.35) continue;
      scene.remove(effect.ring);
      effect.ring.material.dispose();
      pickupEffects.splice(i, 1);
    }

    for (let i = impactEffects.length - 1; i >= 0; i--) {
      const effect = impactEffects[i];
      effect.age += dt;
      const progress = Math.min(1, effect.age / effect.life);
      effect.ring.scale.setScalar(1 + progress * 3.8);
      effect.ring.material.opacity = 0.8 * (1 - progress);
      effect.spray.scale.set(1 + progress * 0.5, 1 - progress, 1 + progress * 0.5);
      effect.spray.material.opacity = 0.72 * (1 - progress);
      if (progress < 1) continue;
      scene.remove(effect.group);
      effect.ring.material.dispose();
      effect.spray.material.dispose();
      impactEffects.splice(i, 1);
    }

    syncProjectiles();

    const bountyBoat = Number.isInteger(state.bountyId) ? state.boats[state.bountyId] : null;
    if (bountyBoat?.alive) {
      bountyRing.visible = true;
      bountyRing.position.set(bountyBoat.x, 0.1, bountyBoat.z);
      const pulse = 1 + Math.sin(now * 0.008) * 0.08;
      bountyRing.scale.setScalar((1 + bountyBoat.radius * 0.12) * pulse);
      bountyRing.material.opacity = 0.65 + Math.sin(now * 0.01) * 0.2;
    } else {
      bountyRing.visible = false;
    }

    if (state.monster?.alive) {
      monster.visible = true;
      monster.position.set(state.monster.x, 0, state.monster.z);
      monster.scale.setScalar(isDisplay ? 1.18 : 1);
      monster.rotation.y += dt * 0.25;
      monsterHalo.visible = true;
      monsterHalo.position.set(state.monster.x, 0.06, state.monster.z);
      const haloPulse = 1 + Math.sin(now * 0.006) * 0.08;
      monsterHalo.scale.setScalar(haloPulse);
      monsterHalo.material.opacity = 0.42 + Math.sin(now * 0.008) * 0.12;
      for (const child of monster.children) {
        if (child.userData.phase !== undefined) {
          child.rotation.x = Math.sin(now * 0.002 + child.userData.phase) * 0.35;
        }
      }
      if (state.monster.attack) {
        danger.visible = true;
        danger.position.x = state.monster.attack.x;
        danger.position.z = state.monster.attack.z;
        const pulse = 0.92 + Math.sin(now * 0.012) * 0.1;
        danger.scale.setScalar(pulse);
      } else {
        danger.visible = false;
      }
    } else {
      monster.visible = false;
      monsterHalo.visible = false;
      danger.visible = false;
    }

    const safeRadius = Number(state.safeRadius ?? 58);
    const stormActive = state.phase === "racing" && state.stage === "maelstrom";
    safeZoneRing.visible = stormActive;
    if (stormActive) {
      safeZoneRing.scale.setScalar(safeRadius);
      const pulse = 0.88 + Math.sin(now * 0.006) * 0.08;
      safeZoneRing.material.opacity = 0.56 + pulse * 0.2;
      waterMat.uniforms.storm.value += (1 - waterMat.uniforms.storm.value) * Math.min(1, dt * 2.5);
    } else {
      waterMat.uniforms.storm.value += (0 - waterMat.uniforms.storm.value) * Math.min(1, dt * 2.5);
    }

    broadsideTargetRing.visible = false;
    if (!isDisplay && myId !== null && state.boats[myId]?.alive) {
      const lock = findBroadsideLock(state.boats[myId]);
      if (lock) {
        broadsideTargetRing.visible = true;
        broadsideTargetRing.position.set(lock.target.x, 0.08, lock.target.z);
        const targetRadius = lock.kind === "monster" ? 1.9 : (lock.target.radius ?? 1.15);
        const scale = targetRadius * (1.12 + Math.sin(now * 0.01) * 0.05);
        broadsideTargetRing.scale.setScalar(scale);
      }
    }

    if (isDisplay) {
      const shot = selectDirectorShot();
      const focusBoat = state.boats[shot.focusId];
      const targetBoat = state.boats[shot.targetId];
      let focusX = focusBoat?.x ?? 0;
      let focusZ = focusBoat?.z ?? 0;
      let cameraHeight = 37;
      let fov = 50;

      if (shot.mode === "overview") {
        focusX = 0;
        focusZ = 0;
        cameraHeight = 51;
        fov = 55;
      } else if (shot.mode === "duel" && targetBoat && focusBoat) {
        const separation = Math.hypot(focusBoat.x - targetBoat.x, focusBoat.z - targetBoat.z);
        if (separation < 38) {
          focusX = (focusBoat.x + targetBoat.x) * 0.5;
          focusZ = (focusBoat.z + targetBoat.z) * 0.5;
          cameraHeight = Math.max(31, Math.min(43, 27 + separation * 0.42));
          fov = Math.max(48, Math.min(55, 47 + separation * 0.18));
        }
      } else if (shot.mode === "boss" && state.monster?.alive) {
        const monster = state.monster;
        const separation = focusBoat
          ? Math.hypot(focusBoat.x - monster.x, focusBoat.z - monster.z) : 0;
        focusX = focusBoat ? (monster.x + focusBoat.x) * 0.5 : monster.x;
        focusZ = focusBoat ? (monster.z + focusBoat.z) * 0.5 : monster.z;
        cameraHeight = Math.max(40, Math.min(55, 38 + separation * 0.55));
        fov = Math.max(54, Math.min(63, 52 + separation * 0.25));
      }

      cameraTarget.set(focusX + 15, cameraHeight, focusZ + 18);
      lookTarget.set(focusX, 1.0, focusZ);
      camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 1.8));
      displayLookTarget.lerp(lookTarget, 1 - Math.exp(-dt * 2.2));
      camera.lookAt(displayLookTarget);
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 2));
      try {
        window.__seaBroadcast = {
          focus: shot.mode,
          boss: Boolean(state.monster?.alive),
          fov: camera.fov,
          height: cameraHeight,
        };
      } catch {}
    } else if (myId !== null && state.boats[myId]) {
      const me = state.boats[myId];
      cameraTarget.set(me.x, 38, me.z + 24);
      lookTarget.set(me.x, 0.8, me.z);
      if (!cameraFollowReady || camera.position.distanceToSquared(cameraTarget) > 35 * 35) {
        camera.position.copy(cameraTarget);
        cameraFollowReady = true;
      } else camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 6));
      camera.lookAt(lookTarget);
    } else {
      cameraFollowReady = false;
      cameraTarget.set(0, 38, 24);
      camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 2));
      camera.lookAt(0, 0, 0);
    }
    camera.updateProjectionMatrix();
  }

  waterMat.uniforms.time.value = now * .001;
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  if (isDisplay) camera.aspect = innerWidth / innerHeight;
  else {
    camera.left = -phoneSpan * innerWidth / innerHeight / 2;
    camera.right = -camera.left;
  }
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

requestAnimationFrame(animate);

import * as THREE from "/three/three.module.js";

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
scene.background = new THREE.Color("#071f29");
scene.fog = new THREE.Fog("#071f29", 42, 130);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isDisplay ? 1.5 : 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("scene").append(renderer.domElement);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 220);
camera.position.set(0, 58, 52);

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

const waterGeo = new THREE.CircleGeometry(108, 128);
const waterMat = new THREE.MeshPhysicalMaterial({
  color: "#087f91",
  roughness: 0.18,
  metalness: 0.08,
  clearcoat: 0.9,
  clearcoatRoughness: 0.15,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.12;
water.receiveShadow = true;
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

const waterNormalColor = new THREE.Color("#087f91");
const waterStormColor = new THREE.Color("#274d67");

const islandMat = new THREE.MeshStandardMaterial({ color: "#7f6848", roughness: 0.92 });
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
}

function makeBoat(color) {
  const group = new THREE.Group();

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
  group.add(hull);

  const bow = new THREE.Mesh(
    new THREE.ConeGeometry(1.18, 2.1, 4),
    hull.material,
  );
  bow.rotation.x = Math.PI / 2;
  bow.rotation.z = Math.PI / 4;
  bow.position.set(0, 0.55, 3.25);
  bow.castShadow = true;
  group.add(bow);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.42, 1.7),
    new THREE.MeshStandardMaterial({ color: "#e9d8b4", roughness: 0.72 }),
  );
  deck.position.set(0, 1.12, -0.2);
  deck.castShadow = true;
  group.add(deck);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 2.9, 8),
    new THREE.MeshStandardMaterial({ color: "#47372a", roughness: 0.8 }),
  );
  mast.position.set(0, 2.1, -0.45);
  mast.castShadow = true;
  group.add(mast);

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
  group.add(sail);

  const cannonMat = new THREE.MeshStandardMaterial({ color: "#29323b", roughness: 0.35, metalness: 0.7 });
  for (const side of [-1, 1]) {
    for (const z of [-0.9, 0.9]) {
      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.0, 8), cannonMat);
      cannon.rotation.z = Math.PI / 2;
      cannon.position.set(side * 1.4, 0.86, z);
      cannon.castShadow = true;
      group.add(cannon);
    }
  }

  const wakeGeometry = new THREE.BufferGeometry();
  wakeGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      -1.15, 0, -1.6,
       1.15, 0, -1.6,
       0.0,  0, -7.0,
    ], 3),
  );
  const wake = new THREE.Mesh(
    wakeGeometry,
    new THREE.MeshBasicMaterial({
      color: "#d7ffff",
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  wake.position.y = 0.025;
  group.add(wake);
  group.userData.wake = wake;
  group.userData.hullMat = hullMat;

  const flashMat = new THREE.MeshBasicMaterial({
    color: "#ffe7a3",
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), flashMat.clone());
    flash.position.set(side * 1.85, 0.92, 0);
    flash.visible = false;
    group.add(flash);
    if (side < 0) group.userData.flashLeft = flash;
    else group.userData.flashRight = flash;
  }

  scene.add(group);
  return group;
}

const boatMeshes = Array.from({ length: 8 }, (_, id) =>
  makeBoat(["#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#14b8a6", "#f59e0b", "#64748b", "#ec4899"][id])
);

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
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.2, 20),
    new THREE.MeshBasicMaterial({ color: "#ffe29a", transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.55;
  group.add(ring);
  scene.add(group);
  return group;
});

const projectileGeo = new THREE.SphereGeometry(0.38, 10, 8);
const projectileMat = new THREE.MeshStandardMaterial({
  color: "#342014",
  emissive: "#ff9f1c",
  emissiveIntensity: 1.35,
  metalness: 0.42,
  roughness: 0.24,
});
const projectileMeshes = new Map();

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

const danger = new THREE.Mesh(
  new THREE.RingGeometry(7.4, 8.6, 48),
  new THREE.MeshBasicMaterial({ color: "#ff4664", transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
);
danger.rotation.x = -Math.PI / 2;
danger.position.y = 0.03;
danger.visible = false;
scene.add(danger);

const broadsideTargetRing = new THREE.Mesh(
  new THREE.RingGeometry(1.55, 2.05, 36),
  new THREE.MeshBasicMaterial({
    color: "#ffd166",
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
broadsideTargetRing.rotation.x = -Math.PI / 2;
broadsideTargetRing.position.y = 0.08;
broadsideTargetRing.visible = false;
scene.add(broadsideTargetRing);

let state = null;
let myId = null;
let token = "";
let currentChoicesKey = "";
let steer = 0;
let throttle = false;
let previous = performance.now();
const cameraTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

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
const setThrottle = (value) => {
  throttle = value;
  throttleButton.classList.toggle("pressed", value);
  sendInput();
};
throttleButton.addEventListener("pointerdown", (event) => {
  throttleButton.setPointerCapture(event.pointerId);
  setThrottle(true);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  throttleButton.addEventListener(type, () => setThrottle(false));
}

addEventListener("keydown", (event) => {
  if (isDisplay || event.repeat) return;
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
    li.innerHTML = `<b>${String(position + 1).padStart(2, "0")}</b><span>${boat.name}<small> · Lv.${boat.level}</small></span><strong>${boat.score}</strong>`;
    ranks.append(li);
  }

  const list = $("event-list");
  list.replaceChildren();
  for (const event of state.events.slice(0, 6)) {
    const li = document.createElement("li");
    li.textContent = event.text;
    list.append(li);
  }

  $("monster-warning").hidden = !(state.monster?.alive);
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
      scene.add(mesh);
      projectileMeshes.set(projectile.id, mesh);
    }
    mesh.position.set(projectile.x, 0.68, projectile.z);
  }
  for (const [id, mesh] of projectileMeshes) {
    if (active.has(id)) continue;
    scene.remove(mesh);
    projectileMeshes.delete(id);
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;

  if (state) {
    for (const boat of state.boats) {
      const mesh = boatMeshes[boat.id];
      mesh.visible = boat.alive;
      if (!boat.alive) continue;
      mesh.position.x += (boat.x - mesh.position.x) * Math.min(1, dt * 12);
      mesh.position.z += (boat.z - mesh.position.z) * Math.min(1, dt * 12);
      mesh.position.y = 0.12 + Math.sin(now * 0.0025 + boat.id) * 0.08;
      let delta = boat.heading - mesh.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      mesh.rotation.y += delta * Math.min(1, dt * 10);
      mesh.scale.setScalar(0.86 + boat.radius * 0.12);
      mesh.userData.wake.material.opacity = 0.12 + Math.min(0.42, boat.speed / 34);

      const fireAge = state.time - (boat.lastFireAt ?? -999);
      const firing = fireAge >= 0 && fireAge < 0.16;
      mesh.userData.flashLeft.visible = firing && boat.lastFireSide < 0;
      mesh.userData.flashRight.visible = firing && boat.lastFireSide > 0;
      if (firing) {
        const flashScale = 0.75 + (1 - fireAge / 0.16) * 1.4;
        (boat.lastFireSide < 0 ? mesh.userData.flashLeft : mesh.userData.flashRight)
          .scale.setScalar(flashScale);
      }

      const hitAge = state.time - (boat.lastHitAt ?? -999);
      const hitGlow = hitAge >= 0 && hitAge < 0.24 ? 1 - hitAge / 0.24 : 0;
      mesh.userData.hullMat.emissive.setRGB(hitGlow * 0.9, hitGlow * 0.14, hitGlow * 0.05);
      mesh.userData.hullMat.emissiveIntensity = hitGlow * 1.7;
    }

    for (const crate of state.crates) {
      const mesh = crateMeshes[crate.id];
      mesh.visible = crate.active;
      if (!crate.active) continue;
      mesh.position.set(crate.x, 0.78 + Math.sin(now * 0.003 + crate.id) * 0.22, crate.z);
      mesh.rotation.y += dt * 0.8;
    }

    syncProjectiles();

    if (state.monster?.alive) {
      monster.visible = true;
      monster.position.set(state.monster.x, 0, state.monster.z);
      monster.rotation.y += dt * 0.25;
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
      danger.visible = false;
    }

    const safeRadius = Number(state.safeRadius ?? 58);
    const stormActive = state.phase === "racing" && state.stage === "maelstrom";
    safeZoneRing.visible = stormActive;
    if (stormActive) {
      safeZoneRing.scale.setScalar(safeRadius);
      const pulse = 0.88 + Math.sin(now * 0.006) * 0.08;
      safeZoneRing.material.opacity = 0.56 + pulse * 0.2;
      waterMat.color.copy(waterNormalColor).lerp(waterStormColor, 0.58);
    } else {
      waterMat.color.lerp(waterNormalColor, Math.min(1, dt * 2.5));
    }

    broadsideTargetRing.visible = false;
    if (!isDisplay && myId !== null && state.boats[myId]?.alive) {
      const lock = findBroadsideLock(state.boats[myId]);
      if (lock) {
        broadsideTargetRing.visible = true;
        broadsideTargetRing.position.set(lock.target.x, 0.08, lock.target.z);
        const targetRadius = lock.kind === "monster" ? 1.9 : (lock.target.radius ?? 1.15);
        const scale = targetRadius * (1.35 + Math.sin(now * 0.01) * 0.08);
        broadsideTargetRing.scale.setScalar(scale);
      }
    }

    if (isDisplay) {
      const leader = state.boats[state.order[0]] ?? state.boats[0];
      const recent = state.events.find((event) =>
        state.time - event.time < 2.6 &&
        [
          "sink", "broadside", "hit", "collision",
          "monster_spawn", "monster_warning", "monster_kill", "stage",
        ].includes(event.type)
      );
      const eventFocusId = Number.isInteger(recent?.killerId)
        ? recent.killerId
        : Number.isInteger(recent?.attackerId)
          ? recent.attackerId
          : Number.isInteger(recent?.boatId)
            ? recent.boatId
            : null;
      const eventTargetId = Number.isInteger(recent?.targetId)
        ? recent.targetId
        : (
            recent?.type === "hit" && Number.isInteger(recent?.boatId)
              ? recent.boatId
              : null
          );
      const eventBoat = eventFocusId !== null ? state.boats[eventFocusId] : null;
      const targetBoat = eventTargetId !== null ? state.boats[eventTargetId] : null;
      const focusBoat = eventBoat?.alive ? eventBoat : leader;

      let focusX = focusBoat.x;
      let focusZ = focusBoat.z;
      let cameraHeight = state.stage === "maelstrom" ? 40 : 36;
      let fov = state.stage === "maelstrom" ? 53 : 49;

      if (targetBoat?.alive) {
        focusX = (focusBoat.x + targetBoat.x) * 0.5;
        focusZ = (focusBoat.z + targetBoat.z) * 0.5;
        const separation = Math.hypot(focusBoat.x - targetBoat.x, focusBoat.z - targetBoat.z);
        cameraHeight = Math.max(29, Math.min(42, 27 + separation * 0.55));
        fov = Math.max(46, Math.min(56, 46 + separation * 0.22));
      }

      if (state.monster?.alive && (
        recent?.type?.startsWith("monster") ||
        recent?.targetKind === "monster" ||
        Math.hypot(focusBoat.x - state.monster.x, focusBoat.z - state.monster.z) < 25
      )) {
        focusX = focusBoat.x * 0.32 + state.monster.x * 0.68;
        focusZ = focusBoat.z * 0.32 + state.monster.z * 0.68;
        cameraHeight = 34;
        fov = 50;
      }

      cameraTarget.set(focusX + 18, cameraHeight, focusZ + 22);
      lookTarget.set(focusX, 1.0, focusZ);
      camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 2.5));
      camera.lookAt(lookTarget);
      camera.fov = fov;
    } else if (myId !== null && state.boats[myId]) {
      const me = state.boats[myId];
      const backX = -Math.sin(me.heading) * 9;
      const backZ = -Math.cos(me.heading) * 9;
      cameraTarget.set(me.x + backX, 8.5, me.z + backZ);
      lookTarget.set(
        me.x + Math.sin(me.heading) * 8,
        0.8,
        me.z + Math.cos(me.heading) * 8,
      );
      camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 5));
      camera.lookAt(lookTarget);
      camera.fov = 64 + (throttle ? 5 : 0);
    } else {
      cameraTarget.set(0, 47, 48);
      camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 2));
      camera.lookAt(0, 0, 0);
    }
    camera.updateProjectionMatrix();
  }

  water.material.roughness = 0.16 + Math.sin(now * 0.00045) * 0.035;
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

requestAnimationFrame(animate);

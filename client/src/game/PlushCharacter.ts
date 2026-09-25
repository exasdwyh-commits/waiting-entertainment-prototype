import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PlayerState, TableCharacter } from "@waiting/shared";
import type { CharacterVisual } from "./CharacterVisual";

type MaterialSet = Record<"fur" | "cream" | "accent" | "dark" | "eye", THREE.Material>;

const plushNoise = (() => {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 38921;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = 100 + ((seed >>> 24) % 112);
    pixels.set([grain, grain, grain, 255], i * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.needsUpdate = true;
  return texture;
})();

function plushMaterial(color: THREE.ColorRepresentation) {
  const base = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.98,
    metalness: 0,
    sheen: 0.85,
    sheenRoughness: 1,
    sheenColor: base.clone().lerp(new THREE.Color(0xffffff), 0.48),
    bumpMap: plushNoise,
    bumpScale: 0.022,
  });
}

function blob(parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number,
  sx: number, sy: number, sz: number, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 9), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function cone(parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number,
  radius: number, height: number, tilt = 0) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8), material);
  mesh.position.set(x, y, z);
  mesh.rotation.z = tilt;
  parent.add(mesh);
  return mesh;
}

/** Merge static face/costume pieces by material; limbs remain separate for pose changes. */
function compact(group: THREE.Group) {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...group.children]) {
    if (!(child instanceof THREE.Mesh) || !(child.geometry instanceof THREE.BufferGeometry)) continue;
    child.updateMatrix();
    const geometry = child.geometry.clone().applyMatrix4(child.matrix);
    const material = child.material as THREE.Material;
    const list = batches.get(material) ?? [];
    list.push(geometry);
    batches.set(material, list);
    child.geometry.dispose();
    group.remove(child);
  }
  for (const [material, geometries] of batches) {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
    if (!geometry) continue;
    if (geometries.length > 1) geometries.forEach((part) => part.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function makeMaterials(character: TableCharacter): MaterialSet {
  const fur = new THREE.Color(character.color);
  const cream = fur.clone().lerp(new THREE.Color("#fff0dc"), 0.67);
  return {
    fur: plushMaterial(fur),
    cream: plushMaterial(cream),
    accent: plushMaterial(character.accent),
    dark: new THREE.MeshStandardMaterial({ color: "#241d23", roughness: 0.42 }),
    eye: new THREE.MeshStandardMaterial({ color: "#fffaf2", roughness: 0.2, metalness: 0.02 }),
  };
}

function addHeadFeatures(head: THREE.Group, character: TableCharacter, mat: MaterialSet) {
  const species = character.species;
  const wide = species === "wombat" || species === "capybara" || species === "tapir";
  blob(head, mat.fur, 0, 0, 0, wide ? 0.51 : 0.46, wide ? 0.38 : 0.43, 0.4, 16);

  if (species === "axolotl") {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        blob(head, mat.accent, side * (0.48 + i * 0.045), 0.27 - i * 0.16, -0.02,
          0.2, 0.085, 0.12);
      }
    }
  } else if (species === "duck") {
    blob(head, mat.accent, 0, -0.12, 0.46, 0.31, 0.095, 0.24);
    blob(head, mat.accent, 0, -0.19, 0.43, 0.25, 0.055, 0.18);
  } else if (species === "tapir") {
    blob(head, mat.cream, 0, -0.16, 0.37, 0.19, 0.26, 0.27);
    blob(head, mat.dark, 0, -0.32, 0.55, 0.13, 0.065, 0.11);
  } else if (species === "capybara") {
    blob(head, mat.cream, 0, -0.19, 0.4, 0.38, 0.18, 0.3);
    blob(head, mat.cream, 0, -0.24, 0.56, 0.28, 0.12, 0.12);
    blob(head, mat.dark, 0, -0.1, 0.59, 0.1, 0.075, 0.06);
  } else if (species === "pangolin") {
    blob(head, mat.cream, 0, -0.15, 0.4, 0.21, 0.16, 0.31);
    blob(head, mat.dark, 0, -0.2, 0.67, 0.08, 0.055, 0.06);
    for (let row = 0; row < 3; row++) {
      for (const side of [-1, 1]) blob(head, mat.accent,
        side * (0.16 + row * 0.1), 0.36 - row * 0.08, -0.04,
        0.16, 0.11, 0.2);
    }
  } else if (species === "gecko") {
    blob(head, mat.cream, 0, -0.22, 0.31, 0.31, 0.16, 0.22);
    for (const side of [-1, 1]) blob(head, mat.fur, side * 0.3, 0.25, 0.25, 0.2, 0.23, 0.2);
  } else {
    for (const side of [-1, 1]) blob(head, mat.cream, side * 0.14, -0.18, 0.36, 0.22, 0.17, 0.18);
    blob(head, mat.dark, 0, -0.1, 0.53, 0.105, 0.07, 0.08);
  }

  if (species === "otter") {
    for (const side of [-1, 1]) blob(head, mat.cream,
      side * 0.31, -0.17, 0.29, 0.17, 0.14, 0.16);
  }

  if (species === "hedgehog") {
    for (let i = -3; i <= 3; i++) {
      cone(head, mat.accent, i * 0.14, 0.43 - Math.abs(i) * 0.035, -0.12,
        0.11, 0.38, i * -0.12);
    }
  } else if (species !== "axolotl" && species !== "gecko" && species !== "duck") {
    for (const side of [-1, 1]) {
      if (species === "red-panda") {
        cone(head, mat.fur, side * 0.34, 0.39, -0.02, 0.16, 0.32, -side * 0.2);
        blob(head, mat.cream, side * 0.34, 0.41, 0.1, 0.085, 0.14, 0.05);
      } else {
        const smallEar = species === "wombat" || species === "capybara";
        blob(head, mat.fur, side * 0.36, 0.32, -0.03,
          smallEar ? 0.12 : 0.16, smallEar ? 0.13 : 0.19, 0.13);
        blob(head, mat.cream, side * 0.36, 0.33, 0.08,
          smallEar ? 0.065 : 0.085, smallEar ? 0.07 : 0.11, 0.035);
      }
    }
  }

  const eyeHeight = species === "gecko" ? 0.25 : 0.08;
  const eyeX = species === "gecko" ? 0.3 : 0.2;
  const eyeZ = species === "gecko" ? 0.42 : 0.36;
  for (const side of [-1, 1]) {
    if (species === "red-panda") blob(head, mat.cream, side * 0.23, 0.05, 0.31, 0.18, 0.2, 0.075);
    blob(head, mat.eye, side * eyeX, eyeHeight, eyeZ, 0.12, 0.145, 0.07);
    blob(head, mat.dark, side * eyeX + side * 0.015, eyeHeight - 0.01, eyeZ + 0.06,
      0.075, 0.095, 0.04);
    blob(head, mat.eye, side * eyeX - 0.025, eyeHeight + 0.035, eyeZ + 0.095,
      0.023, 0.025, 0.015, 8);
  }
  compact(head);
}

function addTail(root: THREE.Group, character: TableCharacter, mat: MaterialSet) {
  const tail = new THREE.Group();
  tail.position.set(0, -0.32, -0.29);
  root.add(tail);
  switch (character.species) {
    case "red-panda":
      for (let i = 0; i < 5; i++) blob(tail, i % 2 ? mat.cream : mat.fur,
        0.31 + i * 0.15, -0.02 + i * 0.105, -0.17 - i * 0.09,
        0.2 - i * 0.014, 0.17, 0.2);
      break;
    case "pangolin":
      blob(tail, mat.fur, 0, -0.18, -0.38, 0.2, 0.15, 0.54);
      for (let i = 0; i < 3; i++) blob(tail, mat.accent, 0, -0.06, -0.25 - i * 0.22,
        0.17 - i * 0.035, 0.08, 0.15);
      break;
    case "gecko":
      blob(tail, mat.fur, 0, -0.11, -0.44, 0.16, 0.12, 0.54);
      break;
    case "otter":
      blob(tail, mat.fur, 0, -0.17, -0.43, 0.16, 0.14, 0.49);
      break;
    case "axolotl":
      blob(tail, mat.accent, 0, -0.11, -0.42, 0.2, 0.11, 0.42);
      break;
    default:
      blob(tail, mat.fur, 0, -0.07, -0.33, 0.12, 0.12, 0.28);
  }
  compact(tail);
  return tail;
}

export function createPlushCharacter(character: TableCharacter, targetHeight = 1.7): CharacterVisual {
  const mat = makeMaterials(character);
  const root = new THREE.Group();
  const figure = new THREE.Group();
  figure.scale.setScalar(targetHeight / 1.86);
  root.add(figure);
  const heavy = character.body === "heavy";
  const light = character.body === "light";

  const torso = new THREE.Group();
  torso.position.y = -0.16;
  figure.add(torso);
  blob(torso, mat.fur, 0, 0, 0, heavy ? 0.44 : light ? 0.32 : 0.38,
    heavy ? 0.47 : 0.43, 0.32);
  blob(torso, mat.cream, 0, -0.06, 0.25, heavy ? 0.31 : 0.26, 0.32, 0.1);
  blob(torso, mat.accent, 0, 0.26, 0.26, 0.32, 0.08, 0.1);
  if (character.species === "pangolin") {
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) blob(torso, mat.accent,
        side * (0.32 + row * 0.015), 0.17 - row * 0.22, -0.13,
        0.15, 0.15, 0.18);
    }
  }
  compact(torso);

  const head = new THREE.Group();
  head.position.set(0, 0.41, 0.045);
  figure.add(head);
  addHeadFeatures(head, character, mat);

  const arms: THREE.Group[] = [];
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * (heavy ? 0.43 : 0.37), -0.02, 0);
    blob(arm, mat.fur, side * 0.075, -0.19, 0.05, 0.17, 0.28, 0.18);
    blob(arm, mat.cream, side * 0.11, -0.38, 0.12, 0.16, 0.12, 0.15);
    compact(arm);
    figure.add(arm);
    arms.push(arm);

    const leg = new THREE.Group();
    leg.position.set(side * 0.21, -0.52, 0);
    blob(leg, mat.fur, 0, -0.16, 0, 0.18, 0.23, 0.19);
    blob(leg, character.species === "duck" ? mat.accent : mat.cream,
      0, -0.32, 0.13, 0.22, 0.09, 0.28);
    if (character.species === "gecko") {
      for (let toe = -1; toe <= 1; toe++) blob(leg, mat.accent, toe * 0.13, -0.36, 0.34,
        0.07, 0.045, 0.12, 8);
    }
    compact(leg);
    figure.add(leg);
    legs.push(leg);
  }
  const tail = addTail(figure, character, mat);
  let state: PlayerState = "idle";
  let phase = 0;
  let impact = 0;
  let received = true;
  const targetScale = new THREE.Vector3(1, 1, 1);

  return {
    root,
    setState: (next) => { state = next; },
    addImpact: (strength, wasReceived) => {
      impact = Math.max(impact, Math.min(1.2, Math.max(0, strength)));
      received = wasReceived;
    },
    update: (delta) => {
      const moving = state === "moving";
      const fighting = ["pushing", "throwing", "kicking", "headbutting", "dropkicking"].includes(state);
      const limp = ["carried", "hit", "ko", "ragdoll", "eliminated"].includes(state);
      phase += delta * (moving ? 9.5 : fighting ? 7 : 2.5);
      const stride = moving ? Math.sin(phase) * 0.48 : 0;
      legs[0].rotation.x += (stride - legs[0].rotation.x) * Math.min(1, delta * 13);
      legs[1].rotation.x += (-stride - legs[1].rotation.x) * Math.min(1, delta * 13);
      arms[0].rotation.x += ((fighting ? -0.85 : -stride * 0.55) - arms[0].rotation.x) * Math.min(1, delta * 12);
      arms[1].rotation.x += ((fighting ? -1.1 : stride * 0.55) - arms[1].rotation.x) * Math.min(1, delta * 12);
      torso.rotation.z += ((limp ? 0.25 : moving ? -stride * 0.07 : 0) - torso.rotation.z) * Math.min(1, delta * 8);
      head.rotation.z += ((limp ? -0.18 : Math.sin(phase * 0.5) * 0.04) - head.rotation.z) * Math.min(1, delta * 7);
      figure.position.y = moving ? Math.abs(Math.sin(phase)) * 0.035 : Math.sin(phase) * 0.015;
      tail.rotation.y = Math.sin(phase * (moving ? 0.6 : 0.35)) * (moving ? 0.22 : 0.12);
      targetScale.set(received ? 1 + impact * 0.12 : 1 - impact * 0.05,
        received ? 1 - impact * 0.14 : 1 - impact * 0.03, 1 + impact * 0.11);
      root.scale.lerp(targetScale, Math.min(1, delta * 14));
      impact = Math.max(0, impact - delta * 4.8);
    },
  };
}

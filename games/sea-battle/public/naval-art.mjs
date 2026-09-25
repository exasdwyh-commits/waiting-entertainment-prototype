import * as THREE from "/three/three.module.js";
import { GLTFLoader } from "/three/addons/loaders/GLTFLoader.js";

const ASSETS = [
  ...Array.from({ length: 5 }, (_, index) => `ship-stage-${index + 1}`),
  "island-palm", "island-crag", "reef", "buoy", "supply-crate",
];

export async function loadNavalArt() {
  const loader = new GLTFLoader();
  const entries = await Promise.all(ASSETS.map(async (id) => {
    try {
      const model = (await loader.loadAsync(`/assets/naval/${id}.glb`)).scene;
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = /^(Ship |Sail)/.test(object.name);
        if (object.material?.name === "Sail ivory") object.material.side = THREE.DoubleSide;
      });
      return [id, model];
    } catch (error) {
      console.warn(`Naval model ${id} could not be loaded; using fallback geometry.`, error);
      return [id, null];
    }
  }));
  return Object.fromEntries(entries);
}

function showCannonCount(model, count) {
  const barrels = [];
  model.traverse((object) => {
    if (/^Broadside barrel/.test(object.name)) barrels.push(object);
  });
  for (const side of [-1, 1]) {
    const positions = barrels
      .filter((barrel) => Math.sign(barrel.position.x) === side)
      .map((barrel) => barrel.position.z)
      .sort((a, b) => Math.abs(a) - Math.abs(b));
    const enabled = positions.slice(0, Math.min(count, positions.length));
    model.traverse((object) => {
      if (!/^(Broadside barrel|Cannon carriage|Muzzle brass|Bore shadow)/.test(object.name)) return;
      if (Math.sign(object.position.x) !== side) return;
      object.visible = enabled.some((z) => Math.abs(z - object.position.z) < 0.001);
    });
  }
}

export function updateShipArt(group, boat, art) {
  const stage = Math.max(1, Math.min(5, boat.level));
  const template = art[`ship-stage-${stage}`];
  if (!template) return;
  const count = Math.max(1, Math.min(5, boat.cannonCount));
  if (group.userData.artStage !== stage) {
    const previous = group.userData.artModel;
    if (previous) group.remove(previous);
    group.userData.teamMaterial?.dispose();

    const model = template.clone(true);
    // The original Blender model points toward -Z; this game heads toward +Z.
    model.rotation.y = Math.PI;
    model.scale.setScalar(1.28);
    let teamMaterial;
    model.traverse((object) => {
      if (!object.isMesh || object.material?.name !== "Team teal") return;
      teamMaterial ??= object.material.clone();
      teamMaterial.color.set(boat.color);
      object.material = teamMaterial;
    });
    group.userData.teamMaterial = teamMaterial;
    group.add(model);
    group.userData.artModel = model;
    group.userData.artStage = stage;
    group.userData.artCannons = 0;
    group.userData.fallbackVisual.visible = false;
  }
  if (group.userData.artCannons !== count) {
    showCannonCount(group.userData.artModel, count);
    group.userData.artCannons = count;
  }
}

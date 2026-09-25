import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { characterForSeat, type PlayerState } from "@waiting/shared";
import { createPlushCharacter } from "./PlushCharacter";

type LoadedCharacter = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

export type CharacterVisual = {
  root: THREE.Group;
  mixer?: THREE.AnimationMixer;
  setState: (state: PlayerState) => void;
  addImpact: (strength: number, received: boolean) => void;
  update: (delta: number) => void;
};

const characterPromises = new Map<string, Promise<LoadedCharacter>>();

const plushBump = (() => {
  const size = 96;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 72391;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = 94 + ((seed >>> 24) % 118);
    pixels.set([grain, grain, grain, 255], i * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 9);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
})();

function loadCharacter(url: string) {
  const existing = characterPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<LoadedCharacter>((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
      undefined,
      reject,
    );
  });

  characterPromises.set(url, promise);
  return promise;
}

function styleCharacter(root: THREE.Object3D, tint: number) {
  const tintColor = new THREE.Color(tint);

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;

    const source = Array.isArray(object.material) ? object.material : [object.material];
    const materials = source.map((material) => {
      const cloned = material.clone();
      if ("color" in cloned && cloned.color instanceof THREE.Color) {
        if (!(cloned instanceof THREE.MeshStandardMaterial && cloned.map)) {
          cloned.color.lerp(tintColor, 0.12);
        }
      }
      if (!(cloned instanceof THREE.MeshStandardMaterial)) return cloned;
      const plush = new THREE.MeshPhysicalMaterial({
        color: cloned.color,
        map: cloned.map,
        normalMap: cloned.normalMap ?? undefined,
        normalScale: cloned.normalScale,
        aoMap: cloned.aoMap,
        bumpMap: cloned.normalMap ? undefined : plushBump,
        bumpScale: cloned.normalMap ? 0 : 0.016,
        roughness: 0.9,
        metalness: 0,
        envMapIntensity: 0.36,
        sheen: 0.58,
        sheenRoughness: 0.72,
        sheenColor: new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.42),
        side: cloned.side,
        transparent: cloned.transparent,
        alphaTest: cloned.alphaTest,
      });
      cloned.dispose();
      return plush;
    });

    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
}

function fitCharacter(root: THREE.Object3D, targetHeight: number) {
  root.updateMatrixWorld(true);
  const initial = new THREE.Box3().setFromObject(root);
  const size = initial.getSize(new THREE.Vector3());
  const scale = size.y > 0.001 ? targetHeight / size.y : 1;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(root);
  root.position.y -= (fitted.min.y + fitted.max.y) * 0.5;
}

function chooseClip(clips: THREE.AnimationClip[], state: PlayerState) {
  const aliases: Record<PlayerState, string[]> = {
    idle: ["idle", "stand"],
    moving: ["walk", "run", "move"],
    pushing: ["attackmeleeright", "attackmeleeleft", "attack", "interactright"],
    grabbing: ["holdingboth", "holdingright", "interactright", "idle"],
    carried: ["fall", "die", "holdingboth"],
    throwing: ["attackmeleeright", "interactright", "attack"],
    jumping: ["jump", "run", "walk"],
    kicking: ["kick", "attackmeleeright", "attack"],
    headbutting: ["attackmeleeleft", "attackmeleeright", "interactright"],
    dropkicking: ["jump", "kick", "fall"],
    hit: ["fall", "hit", "damage"],
    ko: ["die", "fall", "hit"],
    waking: ["getup", "recover", "stand", "idle"],
    ragdoll: ["fall", "die", "hit"],
    recovering: ["idle", "stand", "getup", "recover"],
    edge_hang: ["holdingboth", "holdingright", "fall"],
    climbing: ["jump", "interactright", "holdingboth"],
    celebrate: ["emoteyes", "idle"],
    eliminated: ["die", "fall", "death"],
  };

  const desired = aliases[state];
  const normalized = clips.map((clip) => ({
    clip,
    name: clip.name.toLowerCase().replace(/[\s_-]/g, ""),
  }));

  for (const keyword of desired) {
    const compact = keyword.replace(/[\s_-]/g, "");
    const match = normalized.find((entry) => entry.name.includes(compact));
    if (match) return match.clip;
  }

  return state === "moving"
    ? clips.find((clip) => /walk|run/i.test(clip.name))
    : clips.find((clip) => /idle/i.test(clip.name));
}

export async function createCharacterVisual(
  tint: number,
  targetHeight = 1.75,
  variantIndex = 0,
): Promise<CharacterVisual> {
  const character = characterForSeat(variantIndex);
  if (!character.modelUrl) return createPlushCharacter(character, targetHeight);
  try {
    const loaded = await loadCharacter(character.modelUrl);
    const root = new THREE.Group();
    const model = cloneSkeleton(loaded.scene) as THREE.Group;
    styleCharacter(model, tint);
    fitCharacter(model, targetHeight);
    root.add(model);

    const mixer = loaded.animations.length
      ? new THREE.AnimationMixer(model)
      : undefined;

    let currentAction: THREE.AnimationAction | undefined;
    let currentState: PlayerState | undefined;
    let impactStrength = 0;
    let impactReceived = true;
    let phase = 0;
    const restingY = model.position.y;

    const setState = (state: PlayerState) => {
      if (state === currentState && mixer) return;
      currentState = state;
      if (!mixer) return;

      const clip = chooseClip(loaded.animations, state);
      if (!clip) return;

      const next = mixer.clipAction(clip);
      if (next === currentAction) return;

      next.reset().fadeIn(0.14).play();
      currentAction?.fadeOut(0.14);
      currentAction = next;
    };

    setState("idle");

    return {
      root,
      mixer,
      setState,
      addImpact: (strength, received) => {
        impactStrength = Math.max(
          impactStrength,
          Math.max(0, Math.min(1.2, strength)),
        );
        impactReceived = received;
      },
      update: (delta) => {
        mixer?.update(delta);
        if (!mixer) {
          const moving = currentState === "moving";
          const attacking = ["pushing", "throwing", "kicking", "headbutting", "dropkicking"].includes(currentState ?? "idle");
          phase += delta * (moving ? 9 : attacking ? 7 : 2.5);
          model.position.y = restingY + (moving ? Math.abs(Math.sin(phase)) * 0.07 : Math.sin(phase) * 0.012);
          model.rotation.z += ((moving ? Math.sin(phase) * 0.055 : attacking ? -0.09 : 0) - model.rotation.z) * Math.min(1, delta * 9);
          model.rotation.x += ((currentState === "hit" ? 0.12 : 0) - model.rotation.x) * Math.min(1, delta * 9);
        }

        if (impactStrength > 0.001) {
          const amount = impactStrength;
          const target = impactReceived
            ? new THREE.Vector3(
                1 + amount * 0.14,
                Math.max(0.76, 1 - amount * 0.18),
                1 + amount * 0.08,
              )
            : new THREE.Vector3(
                Math.max(0.86, 1 - amount * 0.05),
                Math.max(0.88, 1 - amount * 0.04),
                1 + amount * 0.16,
              );
          root.scale.lerp(target, 0.46);
          impactStrength = Math.max(0, impactStrength - delta * 4.8);
        } else {
          root.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);
        }
      },
    };
  } catch (error) {
    console.warn(`Character ${character.id} model failed to load; using plush preview.`, error);
    return createPlushCharacter(character, targetHeight);
  }
}

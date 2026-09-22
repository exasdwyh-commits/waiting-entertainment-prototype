import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { PlayerState } from "@waiting/shared";

const MODEL_URLS = [
  "/assets/characters/character-female-a.glb",
  "/assets/characters/character-male-a.glb",
  "/assets/characters/character-female-b.glb",
  "/assets/characters/character-male-b.glb",
  "/assets/characters/character-female-c.glb",
  "/assets/characters/character-male-c.glb",
  "/assets/characters/character-female-d.glb",
  "/assets/characters/character-male-d.glb",
] as const;

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

function loadCharacter(variantIndex: number) {
  const url = MODEL_URLS[
    Math.abs(Math.trunc(variantIndex)) % MODEL_URLS.length
  ];

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

function tintCharacter(root: THREE.Object3D, tint: number) {
  const tintColor = new THREE.Color(tint);

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;

    const source = Array.isArray(object.material) ? object.material : [object.material];
    const materials = source.map((material) => {
      const cloned = material.clone();
      if ("color" in cloned && cloned.color instanceof THREE.Color) {
        cloned.color.lerp(tintColor, 0.38);
      }
      return cloned;
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

function fallbackCharacter(tint: number, targetHeight: number): CharacterVisual {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.36, 0.96, 5, 8),
    new THREE.MeshStandardMaterial({ color: tint, roughness: 0.62 }),
  );
  body.position.y = targetHeight * 0.5;
  root.add(body);

  return {
    root,
    setState: () => undefined,
    addImpact: () => undefined,
    update: () => undefined,
  };
}

export async function createCharacterVisual(
  tint: number,
  targetHeight = 1.75,
  variantIndex = 0,
): Promise<CharacterVisual> {
  try {
    const loaded = await loadCharacter(variantIndex);
    const root = new THREE.Group();
    const model = cloneSkeleton(loaded.scene) as THREE.Group;
    tintCharacter(model, tint);
    fitCharacter(model, targetHeight);
    root.add(model);

    const mixer = loaded.animations.length
      ? new THREE.AnimationMixer(model)
      : undefined;

    let currentAction: THREE.AnimationAction | undefined;
    let currentState: PlayerState | undefined;
    let impactStrength = 0;
    let impactReceived = true;

    const setState = (state: PlayerState) => {
      if (!mixer || state === currentState) return;
      currentState = state;

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
    console.warn("Character model failed to load; using capsule fallback.", error);
    return fallbackCharacter(tint, targetHeight);
  }
}

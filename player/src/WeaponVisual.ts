import * as THREE from "three";
import type { WeaponKind } from "@waiting/shared";

export type WeaponVisual = {
  root: THREE.Group;
  kind: WeaponKind;
};

export function createWeaponVisual(kind: WeaponKind): WeaponVisual {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: kind === "plate" ? 0xf8fafc : 0x475569,
    metalness: kind === "plate" ? 0.18 : 0.72,
    roughness: kind === "plate" ? 0.32 : 0.38,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x292524,
    metalness: 0.15,
    roughness: 0.7,
  });

  if (kind === "pan") {
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.36, 0.13, 24),
      metal,
    );
    bowl.rotation.x = Math.PI / 2;
    bowl.position.z = 0.12;
    root.add(bowl);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.13, 0.78),
      dark,
    );
    handle.position.z = -0.38;
    root.add(handle);
  } else if (kind === "spatula") {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.08, 0.68),
      metal,
    );
    blade.position.z = 0.3;
    root.add(blade);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.12, 1.05),
      dark,
    );
    handle.position.z = -0.48;
    root.add(handle);
  } else {
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.34, 0.075, 28),
      metal,
    );
    plate.position.y = 0.02;
    root.add(plate);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.035, 8, 28),
      new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        roughness: 0.28,
      }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    root.add(rim);
  }

  root.scale.setScalar(kind === "spatula" ? 0.82 : 0.9);
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return { root, kind };
}

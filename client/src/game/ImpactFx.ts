import * as THREE from "three";
import type { GameEventType } from "@waiting/shared";

type ActiveFx = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  startedAt: number;
  durationMs: number;
  startScale: number;
  endScale: number;
  rise: number;
  driftX: number;
  driftZ: number;
  spin: number;
};

export class ImpactFx {
  private readonly active: ActiveFx[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  spawn(
    type: GameEventType,
    position: [number, number, number],
    importance = 0.5,
  ) {
    const isFall = type === "big_fall" || type === "final_elimination";
    const isToss = type === "toss";
    const isHeavy = type === "heavy_hit";
    const isPunch = type === "punch_hit" || type === "push_hit";
    const isGrab = type === "grab";
    const isSave = type === "edge_save";
    const isWin = type === "win";

    const geometry = isFall || isWin || isToss || isHeavy
      ? new THREE.TorusGeometry(
          isWin ? 0.58 : isToss ? 0.38 : isHeavy ? 0.32 : 0.42,
          isToss ? 0.065 : isHeavy ? 0.06 : 0.055,
          8,
          28,
        )
      : new THREE.TorusGeometry(
          isGrab ? 0.18 : 0.22,
          isGrab ? 0.028 : 0.045,
          7,
          20,
        );

    const color =
      type === "final_elimination" || isWin ? 0xffd166 :
      isSave ? 0x7dd3fc :
      isToss ? 0xffa94d :
      isHeavy ? 0xfff1a8 :
      isGrab ? 0x60a5fa :
      isPunch ? 0xffffff :
      0xfb7185;

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], Math.max(0.08, position[1]), position[2]);

    if (isFall || isWin || isSave || isToss || isHeavy) {
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = isWin ? 0.09 : Math.max(0.06, position[1] * 0.25);
    } else {
      mesh.rotation.y = Math.PI / 4;
    }

    const strength = Math.max(0.25, Math.min(1, importance));
    mesh.scale.setScalar(isWin ? 0.75 : 0.55 + strength * 0.3);
    mesh.renderOrder = 5;
    this.scene.add(mesh);

    this.active.push({
      mesh,
      material,
      startedAt: performance.now(),
      durationMs:
        isWin ? 1500 :
        isFall ? 850 :
        isToss ? 620 :
        isHeavy ? 520 :
        isGrab ? 260 :
        360,
      startScale: mesh.scale.x,
      endScale:
        isWin ? 3.2 :
        isFall ? 2.8 :
        isToss ? 2.65 :
        isHeavy ? 2.45 :
        isGrab ? 1.45 :
        1.8 + strength * 0.45,
      rise:
        isWin ? 0.45 :
        isFall ? 0.18 :
        isToss ? 0.42 :
        isHeavy ? 0.34 :
        isGrab ? 0.14 :
        0.24,
      driftX: 0,
      driftZ: 0,
      spin: 0,
    });

    if (isPunch || isHeavy || isToss) {
      this.spawnHitShards(
        position,
        color,
        isHeavy || isToss ? Math.max(0.78, strength) : strength,
      );
    }

    if (isHeavy || isToss || isFall) {
      this.spawnSmokePuffs(
        position,
        isToss || isFall ? Math.max(0.8, strength) : strength,
      );
    }
  }

  private spawnSmokePuffs(
    position: [number, number, number],
    strength: number,
  ) {
    const count = 7 + Math.round(strength * 4);

    for (let index = 0; index < count; index += 1) {
      const angle =
        (index / count) * Math.PI * 2 +
        (index % 2 === 0 ? 0.16 : -0.12);
      const material = new THREE.MeshBasicMaterial({
        color: index % 3 === 0 ? 0xd6d3d1 : 0xa8a29e,
        transparent: true,
        opacity: 0.3 + strength * 0.18,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 + strength * 0.035, 7, 5),
        material,
      );

      mesh.position.set(
        position[0] + Math.cos(angle) * 0.12,
        Math.max(0.12, position[1] * 0.18 + 0.12),
        position[2] + Math.sin(angle) * 0.12,
      );
      mesh.renderOrder = 4;
      this.scene.add(mesh);

      const speed = 0.24 + strength * 0.34;
      this.active.push({
        mesh,
        material,
        startedAt: performance.now(),
        durationMs: 420 + index * 22,
        startScale: 0.8,
        endScale: 2.5 + strength * 1.1,
        rise: 0.22 + strength * 0.26,
        driftX: Math.cos(angle) * speed,
        driftZ: Math.sin(angle) * speed,
        spin: 0,
      });
    }
  }

  private spawnHitShards(
    position: [number, number, number],
    color: number,
    strength: number,
  ) {
    const count = 6;

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + 0.22;
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.18),
        material,
      );

      mesh.position.set(
        position[0],
        Math.max(0.32, position[1] + 0.28),
        position[2],
      );
      mesh.rotation.set(angle * 0.3, angle, angle * 0.55);
      mesh.renderOrder = 6;
      this.scene.add(mesh);

      const speed = 0.65 + strength * 0.8;
      this.active.push({
        mesh,
        material,
        startedAt: performance.now(),
        durationMs: 300 + index * 18,
        startScale: 1,
        endScale: 0.18,
        rise: 0.72 + strength * 0.45,
        driftX: Math.cos(angle) * speed,
        driftZ: Math.sin(angle) * speed,
        spin: (index % 2 === 0 ? 1 : -1) * (5 + strength * 4),
      });
    }
  }

  update(now: number) {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const fx = this.active[index];
      const t = Math.min(1, (now - fx.startedAt) / fx.durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const scale = THREE.MathUtils.lerp(fx.startScale, fx.endScale, eased);

      fx.mesh.scale.setScalar(scale);
      fx.mesh.position.x += fx.driftX * 0.016;
      fx.mesh.position.y += fx.rise * 0.016;
      fx.mesh.position.z += fx.driftZ * 0.016;
      fx.mesh.rotation.y += fx.spin * 0.016;
      fx.material.opacity = Math.max(0, 0.9 * (1 - t));

      if (t >= 1) {
        this.scene.remove(fx.mesh);
        fx.mesh.geometry.dispose();
        fx.material.dispose();
        this.active.splice(index, 1);
      }
    }
  }
}

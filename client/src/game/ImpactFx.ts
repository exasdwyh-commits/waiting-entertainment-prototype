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
    const isSave = type === "edge_save";
    const isWin = type === "win";

    const geometry = isFall || isWin
      ? new THREE.TorusGeometry(isWin ? 0.58 : 0.42, 0.055, 8, 28)
      : new THREE.TorusGeometry(0.22, 0.045, 7, 20);

    const color =
      type === "final_elimination" || isWin ? 0xffd166 :
      isSave ? 0x7dd3fc :
      type === "push_hit" ? 0xffffff :
      0xfb7185;

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], Math.max(0.08, position[1]), position[2]);

    if (isFall || isWin || isSave) {
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
      durationMs: isWin ? 1500 : isFall ? 850 : 430,
      startScale: mesh.scale.x,
      endScale: isWin ? 3.2 : isFall ? 2.8 : 2.05 + strength * 0.6,
      rise: isWin ? 0.45 : isFall ? 0.18 : 0.32,
    });
  }

  update(now: number) {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const fx = this.active[index];
      const t = Math.min(1, (now - fx.startedAt) / fx.durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const scale = THREE.MathUtils.lerp(fx.startScale, fx.endScale, eased);

      fx.mesh.scale.setScalar(scale);
      fx.mesh.position.y += fx.rise * 0.016;
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

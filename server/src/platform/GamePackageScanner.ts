import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameManifestV1 } from "@waiting/shared";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export interface DiscoveredGamePackage {
  directory: string;
  manifestPath: string;
  manifest: GameManifestV1;
}

export class GamePackageScanner {
  readonly root: string;

  constructor(
    root = process.env.WAITING_GAME_CENTER_DIR?.trim() ||
      resolve(PROJECT_ROOT, "game-center/installed"),
  ) {
    this.root = resolve(root);
  }

  scan(): DiscoveredGamePackage[] {
    let entries;
    try {
      entries = readdirSync(this.root, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return [];
      throw error;
    }

    const packages: DiscoveredGamePackage[] = [];

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      const directory = resolve(this.root, entry.name);
      const manifestPath = resolve(directory, "game-package.json");

      let raw: string;
      try {
        raw = readFileSync(manifestPath, "utf8");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") continue;
        throw error;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`game-package-invalid-json:${entry.name}`);
      }

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`game-package-invalid-manifest:${entry.name}`);
      }

      packages.push({
        directory,
        manifestPath,
        manifest: parsed as GameManifestV1,
      });
    }

    return packages;
  }
}

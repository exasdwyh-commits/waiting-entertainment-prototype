import type { GameManifestV1 } from "@waiting/shared";
import {
  BUILTIN_GAME_MANIFESTS,
  validateGameManifests,
} from "./GameRegistry.js";
import {
  GamePackageScanner,
  type DiscoveredGamePackage,
} from "./GamePackageScanner.js";

function cloneManifests(manifests: readonly GameManifestV1[]): GameManifestV1[] {
  return manifests.map((manifest) => structuredClone(manifest));
}

export class GameRegistryManager {
  private installed: DiscoveredGamePackage[] = [];

  constructor(
    private readonly scanner = new GamePackageScanner(),
    private readonly fallback: readonly GameManifestV1[] = BUILTIN_GAME_MANIFESTS,
  ) {}

  load(): GameManifestV1[] {
    this.installed = this.scanner.scan();
    if (this.installed.length === 0) {
      return cloneManifests(this.fallback);
    }

    const manifests = this.installed.map((entry) => entry.manifest);
    validateGameManifests(manifests);
    return cloneManifests(manifests);
  }

  refresh(): GameManifestV1[] {
    return this.load();
  }

  listInstalled(): DiscoveredGamePackage[] {
    return this.installed.map((entry) => ({
      directory: entry.directory,
      manifestPath: entry.manifestPath,
      manifest: structuredClone(entry.manifest),
    }));
  }

  get(gameId: string): GameManifestV1 | undefined {
    const entry = this.installed.find((item) => item.manifest.id === gameId);
    return entry ? structuredClone(entry.manifest) : undefined;
  }
}

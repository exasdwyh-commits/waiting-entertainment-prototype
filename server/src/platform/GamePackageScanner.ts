import fs from 'node:fs/promises';
import path from 'node:path';

export type GamePackage = {
  id: string;
  name: string;
  version: string;
  category?: string;
  runtime?: {
    type?: string;
    port?: number;
  };
  players?: {
    min?: number;
    max?: number;
  };
};

export class GamePackageScanner {
  constructor(private readonly root = path.resolve(process.cwd(), 'game-center/installed')) {}

  async scan(): Promise<GamePackage[]> {
    const result: GamePackage[] = [];

    let entries;
    try {
      entries = await fs.readdir(this.root, { withFileTypes: true });
    } catch {
      return result;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifest = path.join(this.root, entry.name, 'game-package.json');
      try {
        const raw = await fs.readFile(manifest, 'utf8');
        const pkg = JSON.parse(raw) as GamePackage;
        if (pkg.id && pkg.name && pkg.version) {
          result.push(pkg);
        }
      } catch {
        // Invalid packages are ignored during discovery.
      }
    }

    return result;
  }
}

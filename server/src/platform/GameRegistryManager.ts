import { GamePackageScanner, type GamePackage } from './GamePackageScanner.js';

export class GameRegistryManager {
  private games: GamePackage[] = [];

  constructor(private readonly scanner = new GamePackageScanner()) {}

  async refresh() {
    this.games = await this.scanner.scan();
    return this.games;
  }

  list() {
    return this.games;
  }

  get(id: string) {
    return this.games.find((game) => game.id === id);
  }
}

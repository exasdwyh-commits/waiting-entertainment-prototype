import { randomUUID } from "node:crypto";
import type {
  ContentSettings,
  GameManifestV1,
  MediaItem,
  MediaKind,
} from "@waiting/shared";
import { LocalStateStore } from "./LocalStateStore.js";

function clampDuration(value: number): number {
  return Math.max(3, Math.min(120, Math.round(value || 10)));
}

function normalizeSource(source: string | undefined): string | undefined {
  const value = source?.trim();
  if (!value) return undefined;
  if (value.startsWith("/")) return value.slice(0, 500);
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid-media-source");
    }
    return url.toString().slice(0, 500);
  } catch {
    throw new Error("invalid-media-source");
  }
}

export class ContentService {
  private settings: ContentSettings;

  constructor(private readonly store: LocalStateStore) {
    this.settings = store.content();
  }

  snapshot(): ContentSettings {
    return structuredClone(this.settings);
  }

  isGameEnabled(gameId: string): boolean {
    return !this.settings.disabledGameIds.includes(gameId);
  }

  orderGames(games: GameManifestV1[]): GameManifestV1[] {
    const positions = new Map(
      this.settings.gameOrder.map((gameId, index) => [gameId, index]),
    );
    return [...games].sort((a, b) => {
      const ai = positions.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = positions.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  }

  setGameEnabled(gameId: string, enabled: boolean): ContentSettings {
    const set = new Set(this.settings.disabledGameIds);
    if (enabled) set.delete(gameId);
    else set.add(gameId);
    this.settings.disabledGameIds = [...set];
    this.ensureGameOrder(gameId);
    this.persist();
    return this.snapshot();
  }

  moveGame(gameId: string, direction: "up" | "down"): ContentSettings {
    this.ensureGameOrder(gameId);
    const order = [...this.settings.gameOrder];
    const index = order.indexOf(gameId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index >= 0 && target >= 0 && target < order.length) {
      [order[index], order[target]] = [order[target], order[index]];
      this.settings.gameOrder = order;
      this.persist();
    }
    return this.snapshot();
  }

  addMedia(input: {
    kind: MediaKind;
    title?: string;
    source?: string;
    headline?: string;
    subline?: string;
    durationSeconds?: number;
  }): MediaItem {
    if (!["message", "image", "video"].includes(input.kind)) {
      throw new Error("invalid-media-kind");
    }

    const source =
      input.kind === "message" ? undefined : normalizeSource(input.source);
    if (input.kind !== "message" && !source) {
      throw new Error("media-source-required");
    }

    const headline = input.headline?.trim().slice(0, 80);
    const subline = input.subline?.trim().slice(0, 140);
    const title =
      input.title?.trim().slice(0, 60) ||
      headline ||
      (input.kind === "image" ? "图片素材" : input.kind === "video" ? "视频素材" : "文字素材");

    const item: MediaItem = {
      id: randomUUID(),
      kind: input.kind,
      title,
      ...(source ? { source } : {}),
      ...(headline ? { headline } : {}),
      ...(subline ? { subline } : {}),
      durationSeconds: clampDuration(input.durationSeconds ?? 10),
      enabled: true,
      createdAt: Date.now(),
    };

    this.settings.media.push(item);
    this.persist();
    return structuredClone(item);
  }

  setMediaEnabled(mediaId: string, enabled: boolean): MediaItem {
    const item = this.requireMedia(mediaId);
    item.enabled = enabled;
    this.persist();
    return structuredClone(item);
  }

  moveMedia(mediaId: string, direction: "up" | "down"): ContentSettings {
    const index = this.settings.media.findIndex((item) => item.id === mediaId);
    if (index < 0) throw new Error("media-not-found");
    const target = direction === "up" ? index - 1 : index + 1;
    if (target >= 0 && target < this.settings.media.length) {
      [this.settings.media[index], this.settings.media[target]] = [
        this.settings.media[target],
        this.settings.media[index],
      ];
      this.persist();
    }
    return this.snapshot();
  }

  removeMedia(mediaId: string): ContentSettings {
    const before = this.settings.media.length;
    this.settings.media = this.settings.media.filter((item) => item.id !== mediaId);
    if (this.settings.media.length === before) throw new Error("media-not-found");
    this.persist();
    return this.snapshot();
  }

  private requireMedia(mediaId: string): MediaItem {
    const item = this.settings.media.find((candidate) => candidate.id === mediaId);
    if (!item) throw new Error("media-not-found");
    return item;
  }

  private ensureGameOrder(gameId: string): void {
    if (!this.settings.gameOrder.includes(gameId)) {
      this.settings.gameOrder.push(gameId);
    }
  }

  private persist(): void {
    this.store.saveContent(this.settings);
  }
}

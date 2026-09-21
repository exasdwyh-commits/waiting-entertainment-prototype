export type ReplayActorFrame = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  alive: boolean;
};

export type ReplayFrame = {
  atMs: number;
  actors: ReplayActorFrame[];
};

export type Highlight = {
  type: "elimination" | "edge-save" | "final";
  atMs: number;
  actorId?: string;
};

export class ReplayBuffer {
  private frames: ReplayFrame[] = [];
  private highlights: Highlight[] = [];

  constructor(
    private readonly windowMs = 8_000,
    private readonly maxHighlights = 12,
  ) {}

  push(frame: ReplayFrame) {
    this.frames.push(frame);
    const cutoff = frame.atMs - this.windowMs;
    while (this.frames.length && this.frames[0].atMs < cutoff) this.frames.shift();
  }

  mark(highlight: Highlight) {
    this.highlights.push(highlight);
    if (this.highlights.length > this.maxHighlights) this.highlights.shift();
  }

  latestHighlight() {
    return this.highlights.at(-1);
  }

  clipAround(atMs: number, beforeMs = 3_500, afterMs = 1_500) {
    return this.frames.filter((frame) => frame.atMs >= atMs - beforeMs && frame.atMs <= atMs + afterMs);
  }
}

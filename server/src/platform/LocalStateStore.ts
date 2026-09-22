import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { ContentSettings, QueueTicket } from "@waiting/shared";

export interface PersistedQueueState {
  sequence: number;
  tickets: QueueTicket[];
}

export interface PersistedPlatformState {
  version: 1;
  queue: PersistedQueueState;
  content: ContentSettings;
}

function defaultContent(): ContentSettings {
  return {
    gameOrder: ["table-push-king", "pilot-racer"],
    disabledGameIds: [],
    media: [
      {
        id: "system-welcome",
        kind: "message",
        title: "默认候场欢迎页",
        headline: "现场互动正在准备",
        subline: "留意主持人和大屏，下一轮很快开始",
        durationSeconds: 10,
        enabled: true,
        createdAt: 0,
      },
    ],
  };
}

function defaultState(): PersistedPlatformState {
  return {
    version: 1,
    queue: { sequence: 0, tickets: [] },
    content: defaultContent(),
  };
}

function safeContent(value: unknown): ContentSettings {
  if (!value || typeof value !== "object") return defaultContent();
  const raw = value as Partial<ContentSettings>;
  const fallback = defaultContent();
  return {
    gameOrder: Array.isArray(raw.gameOrder)
      ? raw.gameOrder.filter((item): item is string => typeof item === "string")
      : fallback.gameOrder,
    disabledGameIds: Array.isArray(raw.disabledGameIds)
      ? raw.disabledGameIds.filter((item): item is string => typeof item === "string")
      : [],
    media: Array.isArray(raw.media)
      ? raw.media
          .filter((item) => item && typeof item === "object")
          .map((item) => structuredClone(item)) as ContentSettings["media"]
      : fallback.media,
  };
}

export class LocalStateStore {
  readonly path: string;
  private state: PersistedPlatformState;

  constructor(path = process.env.WAITING_STATE_FILE?.trim() || "data/platform-state.json") {
    this.path = resolve(path);
    this.state = this.load();
  }

  queue(): PersistedQueueState {
    return structuredClone(this.state.queue);
  }

  content(): ContentSettings {
    return structuredClone(this.state.content);
  }

  saveQueue(queue: PersistedQueueState): void {
    this.state.queue = structuredClone(queue);
    this.flush();
  }

  saveContent(content: ContentSettings): void {
    this.state.content = structuredClone(content);
    this.flush();
  }

  private load(): PersistedPlatformState {
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<PersistedPlatformState>;
      const queue = parsed.queue;
      return {
        version: 1,
        queue: {
          sequence:
            typeof queue?.sequence === "number" && Number.isFinite(queue.sequence)
              ? Math.max(0, Math.floor(queue.sequence))
              : 0,
          tickets: Array.isArray(queue?.tickets)
            ? queue.tickets.filter((ticket): ticket is QueueTicket =>
                Boolean(ticket && typeof ticket === "object" && typeof ticket.id === "string"),
              )
            : [],
        },
        content: safeContent(parsed.content),
      };
    } catch {
      return defaultState();
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = this.path + ".tmp";
    writeFileSync(temporary, JSON.stringify(this.state, null, 2) + "\n", "utf8");
    renameSync(temporary, this.path);
  }
}

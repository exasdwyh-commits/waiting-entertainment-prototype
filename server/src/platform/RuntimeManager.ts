import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EntertainmentRound,
  GameManifestV1,
  GameRuntimeStatus,
} from "@waiting/shared";

type RuntimeEntry = {
  child?: ChildProcess;
  state: GameRuntimeStatus["state"];
  managed: boolean;
  startedAt?: number;
  message?: string;
  checkedAt: number;
  logs: string[];
};

type ProcessConfig = {
  cwd: string;
  command: string[];
  port: number;
  source: "environment" | "bundled";
};

type HealthProbe =
  | { state: "healthy" }
  | { state: "offline" }
  | { state: "unexpected"; detail: string };

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const HEALTH_TIMEOUT_MS = 10_000;
const HEALTH_POLL_MS = 180;
const HEALTH_REFRESH_MS = 2_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendLog(entry: RuntimeEntry, chunk: unknown) {
  const text = String(chunk ?? "").trim();
  if (!text) return;
  entry.logs.push(text);
  if (entry.logs.length > 24) entry.logs.splice(0, entry.logs.length - 24);
}

export class RuntimeManager {
  private readonly entries = new Map<string, RuntimeEntry>();

  status(manifest: GameManifestV1): GameRuntimeStatus {
    if (manifest.runtime.kind === "embedded") {
      return {
        gameId: manifest.id,
        kind: "embedded",
        state: "embedded",
        configured: true,
        managed: true,
        checkedAt: 0,
        configSource: "embedded",
      };
    }

    const config = this.processConfig(manifest);
    const entry = this.entries.get(manifest.id);
    const configured = Boolean(config);

    return {
      gameId: manifest.id,
      kind: "process",
      state: configured ? (entry?.state ?? "stopped") : "not-configured",
      configured,
      managed: entry?.managed ?? false,
      ...(config ? { configSource: config.source, workingDirectory: config.cwd } : {}),
      ...(manifest.runtime.port ? { port: manifest.runtime.port } : {}),
      ...(entry?.child?.pid ? { pid: entry.child.pid } : {}),
      ...(entry?.startedAt ? { startedAt: entry.startedAt } : {}),
      checkedAt: entry?.checkedAt ?? 0,
      ...((entry?.message || (!configured ? this.configurationMessage(manifest) : undefined))
        ? { message: entry?.message || this.configurationMessage(manifest) }
        : {}),
    };
  }

  list(manifests: readonly GameManifestV1[]): GameRuntimeStatus[] {
    return manifests.map((manifest) => this.status(manifest));
  }

  async refresh(
    manifest: GameManifestV1,
    force = false,
  ): Promise<GameRuntimeStatus> {
    if (manifest.runtime.kind === "embedded") return this.status(manifest);

    const config = this.processConfig(manifest);
    if (!config) return this.status(manifest);

    const entry = this.entry(manifest.id);
    const now = Date.now();
    if (
      !force &&
      entry.checkedAt > 0 &&
      now - entry.checkedAt < HEALTH_REFRESH_MS
    ) {
      return this.status(manifest);
    }

    const probe = await this.probeHealth(manifest);
    entry.checkedAt = now;

    if (probe.state === "healthy") {
      entry.state = "running";
      entry.message = undefined;
      if (!entry.child) entry.managed = false;
      return this.status(manifest);
    }

    if (probe.state === "unexpected") {
      entry.state = "failed";
      entry.message =
        `port ${config.port} is occupied by an unexpected service · ${probe.detail}`;
      if (!entry.child) entry.managed = false;
      return this.status(manifest);
    }

    if (entry.child) {
      if (entry.state !== "starting") {
        entry.state = "unhealthy";
        entry.message = "health check failed";
      }
      return this.status(manifest);
    }

    // Preserve a concrete startup failure until a future successful health
    // probe. Otherwise an operator would see it immediately collapse back to
    // "stopped" and lose the only useful clue.
    if (entry.state !== "failed") {
      entry.state = "stopped";
      entry.managed = false;
      entry.message = undefined;
    }
    return this.status(manifest);
  }

  async refreshAll(
    manifests: readonly GameManifestV1[],
    force = false,
  ): Promise<GameRuntimeStatus[]> {
    return await Promise.all(
      manifests.map((manifest) => this.refresh(manifest, force)),
    );
  }

  assertConfigured(manifest: GameManifestV1): void {
    if (manifest.runtime.kind !== "process") return;
    if (!this.processConfig(manifest)) throw new Error("runtime-not-configured");
  }

  async prepareRound(
    manifest: GameManifestV1,
    round: EntertainmentRound,
  ): Promise<GameRuntimeStatus> {
    if (manifest.runtime.kind === "embedded") return this.status(manifest);
    return await this.ensureRunning(manifest, round.code);
  }

  async beginRound(
    manifest: GameManifestV1,
    round: EntertainmentRound,
  ): Promise<GameRuntimeStatus> {
    if (manifest.runtime.kind === "embedded") return this.status(manifest);

    await this.ensureRunning(manifest, round.code);

    if (manifest.runtime.startPath) {
      const port = manifest.runtime.port;
      if (!port) throw new Error("runtime-port-missing");
      try {
        const response = await fetch(
          `http://127.0.0.1:${port}${manifest.runtime.startPath}`,
          {
            method: "POST",
            signal: AbortSignal.timeout(3_000),
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        const entry = this.entry(manifest.id);
        const message =
          "start action failed: " +
          (error instanceof Error ? error.message : String(error));
        if (entry.managed) await this.stop(manifest.id);
        const failed = this.entry(manifest.id);
        failed.state = "failed";
        failed.checkedAt = Date.now();
        failed.message = message;
        throw new Error("runtime-start-action-failed");
      }
    }

    return this.status(manifest);
  }

  async endRound(manifest: GameManifestV1): Promise<void> {
    if (manifest.runtime.kind !== "process") return;
    const entry = this.entries.get(manifest.id);
    if (!entry?.managed || !entry.child) return;
    await this.stop(manifest.id);
  }

  async ensureRunning(
    manifest: GameManifestV1,
    roomCode?: string,
  ): Promise<GameRuntimeStatus> {
    if (manifest.runtime.kind === "embedded") return this.status(manifest);

    const config = this.processConfig(manifest);
    if (!config) throw new Error("runtime-not-configured");

    const initialProbe = await this.probeHealth(manifest);
    if (initialProbe.state === "healthy") {
      const entry = this.entry(manifest.id);
      entry.state = "running";
      entry.checkedAt = Date.now();
      entry.message = undefined;
      if (!entry.child) entry.managed = false;
      return this.status(manifest);
    }
    if (initialProbe.state === "unexpected") {
      const entry = this.entry(manifest.id);
      entry.state = "failed";
      entry.managed = false;
      entry.checkedAt = Date.now();
      entry.message =
        `port ${config.port} is occupied by an unexpected service · ${initialProbe.detail}`;
      throw new Error("runtime-port-conflict");
    }

    const previous = this.entries.get(manifest.id);
    if (previous?.child && previous.state === "starting") {
      await this.waitForHealthy(manifest, previous);
      return this.status(manifest);
    }

    if (previous?.child) await this.stop(manifest.id);

    const entry: RuntimeEntry = {
      state: "starting",
      managed: true,
      startedAt: Date.now(),
      checkedAt: 0,
      logs: [],
    };
    this.entries.set(manifest.id, entry);

    const [command, ...args] = config.command;
    try {
      const child = spawn(command, args, {
        cwd: config.cwd,
        env: {
          ...process.env,
          PORT: String(config.port),
          HOST: "0.0.0.0",
          ...(roomCode ? { ROOM_CODE: roomCode } : {}),
          WAITING_HUB_RUNTIME: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      entry.child = child;

      child.stdout?.on("data", (chunk) => appendLog(entry, chunk));
      child.stderr?.on("data", (chunk) => appendLog(entry, chunk));
      child.once("error", (error) => {
        entry.state = "failed";
        entry.checkedAt = Date.now();
        entry.message = error.message;
      });
      child.once("exit", (code, signal) => {
        if (entry.state !== "stopped") {
          entry.state = code === 0 ? "stopped" : "failed";
          entry.checkedAt = Date.now();
          entry.message =
            code === 0
              ? undefined
              : `process exited code=${code ?? "null"} signal=${signal ?? "null"}`;
        }
        entry.child = undefined;
      });
    } catch (error) {
      entry.state = "failed";
      entry.checkedAt = Date.now();
      entry.message = error instanceof Error ? error.message : String(error);
      throw new Error("runtime-start-failed");
    }

    await this.waitForHealthy(manifest, entry);
    return this.status(manifest);
  }

  async stop(gameId: string): Promise<void> {
    const entry = this.entries.get(gameId);
    if (!entry?.child) {
      if (entry) {
        entry.state = "stopped";
        entry.managed = false;
        entry.message = undefined;
      }
      return;
    }

    const child = entry.child;
    entry.state = "stopped";
    entry.message = undefined;

    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      const deadline = Date.now() + 2_000;
      while (
        child.exitCode === null &&
        child.signalCode === null &&
        Date.now() < deadline
      ) {
        await sleep(60);
      }
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }

    entry.child = undefined;
    entry.managed = false;
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((gameId) => this.stop(gameId)));
  }

  logs(gameId: string): string[] {
    return [...(this.entries.get(gameId)?.logs ?? [])];
  }

  private entry(gameId: string): RuntimeEntry {
    let entry = this.entries.get(gameId);
    if (!entry) {
      entry = {
        state: "stopped",
        managed: false,
        checkedAt: 0,
        logs: [],
      };
      this.entries.set(gameId, entry);
    }
    return entry;
  }

  private processConfig(manifest: GameManifestV1): ProcessConfig | undefined {
    if (manifest.runtime.kind !== "process") return undefined;
    const envName = manifest.runtime.workingDirectoryEnv;
    const envCwd = envName ? process.env[envName]?.trim() : "";
    const bundledCwd = manifest.runtime.bundledPath
      ? resolve(PROJECT_ROOT, manifest.runtime.bundledPath)
      : "";
    const cwd = envCwd || bundledCwd;
    const source: ProcessConfig["source"] = envCwd ? "environment" : "bundled";
    const command = manifest.runtime.command;
    const port = manifest.runtime.port;
    if (!cwd || !existsSync(cwd) || !command?.length || !port) return undefined;
    return { cwd, command, port, source };
  }

  private configurationMessage(manifest: GameManifestV1): string {
    const envName = manifest.runtime.workingDirectoryEnv;
    const envCwd = envName ? process.env[envName]?.trim() : "";
    if (envCwd && !existsSync(envCwd)) {
      return `${envName} does not point to an existing directory`;
    }
    if (manifest.runtime.bundledPath) {
      const bundled = resolve(PROJECT_ROOT, manifest.runtime.bundledPath);
      if (!existsSync(bundled)) return `bundled package path not found: ${manifest.runtime.bundledPath}`;
    } else if (envName && !envCwd) {
      return `set ${envName} to the local game directory`;
    } else if (!envName) {
      return "working directory is not declared";
    }
    if (!manifest.runtime.command?.length) return "runtime command is missing";
    if (!manifest.runtime.port) return "runtime port is missing";
    return "runtime is not configured";
  }

  private async waitForHealthy(
    manifest: GameManifestV1,
    entry: RuntimeEntry,
  ): Promise<void> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (entry.state === "failed") throw new Error("runtime-start-failed");
      const probe = await this.probeHealth(manifest);
      if (probe.state === "healthy") {
        entry.state = "running";
        entry.checkedAt = Date.now();
        entry.message = undefined;
        return;
      }
      if (probe.state === "unexpected") {
        await this.stop(manifest.id);
        const failed = this.entry(manifest.id);
        failed.state = "failed";
        failed.checkedAt = Date.now();
        failed.message = `health protocol mismatch · ${probe.detail}`;
        throw new Error("runtime-health-protocol-mismatch");
      }
      await sleep(HEALTH_POLL_MS);
    }

    const tail = entry.logs.slice(-3).join(" | ");
    const message = tail
      ? "health timeout · " + tail.slice(-500)
      : "health endpoint did not become ready";
    await this.stop(manifest.id);
    const failed = this.entry(manifest.id);
    failed.state = "failed";
    failed.checkedAt = Date.now();
    failed.message = message;
    throw new Error("runtime-health-timeout");
  }

  private async probeHealth(manifest: GameManifestV1): Promise<HealthProbe> {
    if (manifest.runtime.kind === "embedded") return { state: "healthy" };
    const port = manifest.runtime.port;
    if (!port) return { state: "offline" };

    try {
      const response = await fetch(
        `http://127.0.0.1:${port}${manifest.runtime.healthPath}`,
        { signal: AbortSignal.timeout(800) },
      );
      if (!response.ok) {
        return {
          state: "unexpected",
          detail: `health endpoint returned HTTP ${response.status}`,
        };
      }
      if (!manifest.runtime.healthProtocol) return { state: "healthy" };

      const body = await response.json().catch(() => null) as
        | { protocol?: string }
        | null;
      if (body?.protocol === manifest.runtime.healthProtocol) {
        return { state: "healthy" };
      }
      return {
        state: "unexpected",
        detail:
          `expected protocol ${manifest.runtime.healthProtocol}, got ${body?.protocol ?? "missing protocol"}`,
      };
    } catch {
      return { state: "offline" };
    }
  }
}

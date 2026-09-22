import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameManifestV1, GameSettingV1 } from "@waiting/shared";

export type GameSettingValue = string | number | boolean;

export interface GameSettingsState {
  values: Record<string, GameSettingValue>;
  overrides: Record<string, GameSettingValue>;
}

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SETTINGS_RELATIVE_PATH = ".waiting/game-settings.json";

// Hub 固定注入的运行时变量：settings 永远不允许映射到这些 env，
// 即使 manifest 将来写错也会在这里被挡住（RuntimeManager 侧还有第二道保险）。
const RESERVED_ENV_KEYS = new Set([
  "PORT",
  "HOST",
  "ROOM_CODE",
  "WAITING_HUB_RUNTIME",
]);

function fail(code: string): never {
  throw new Error(code);
}

function validateSetting(
  setting: GameSettingV1,
  raw: unknown,
): GameSettingValue {
  const key = setting.key;
  switch (setting.type) {
    case "number": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        fail(`settings-invalid-value:${key}`);
      }
      if (setting.min !== undefined && raw < setting.min) {
        fail(`settings-invalid-value:${key}`);
      }
      if (setting.max !== undefined && raw > setting.max) {
        fail(`settings-invalid-value:${key}`);
      }
      if (setting.step !== undefined && setting.step > 0) {
        const offset = setting.min ?? 0;
        const steps = (raw - offset) / setting.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-9) {
          fail(`settings-invalid-value:${key}`);
        }
      }
      return raw;
    }
    case "enum": {
      if (
        typeof raw !== "string" ||
        !setting.options?.some((option) => option.value === raw)
      ) {
        fail(`settings-invalid-value:${key}`);
      }
      return raw;
    }
    case "boolean": {
      if (typeof raw !== "boolean") fail(`settings-invalid-value:${key}`);
      return raw;
    }
    case "text": {
      if (typeof raw !== "string") fail(`settings-invalid-value:${key}`);
      return raw;
    }
  }
}

type SettingsFile = Record<string, Record<string, GameSettingValue>>;

/**
 * 本机 Game Settings Store（P1-1）：
 * - 数据存 `.waiting/game-settings.json`（gitignore），不引数据库；
 * - 文件不存在 => 全部使用 manifest default；
 * - 非法值直接拒绝（settings-invalid-value / settings-unknown-key），不静默修正；
 * - number 校验 min / max / step，enum 必须属于 options；
 * - 写文件走 temp + rename 原子替换。
 */
export class GameSettingsStore {
  constructor(private readonly root: string = PROJECT_ROOT) {}

  get filePath(): string {
    return resolve(this.root, SETTINGS_RELATIVE_PATH);
  }

  private readAll(): SettingsFile {
    if (!existsSync(this.filePath)) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch {
      return fail("settings-file-invalid");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("settings-file-invalid");
    }
    return parsed as SettingsFile;
  }

  private writeAll(data: SettingsFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    renameSync(tempPath, this.filePath);
  }

  /** 解析结果：values = manifest default 与已保存覆盖值的合并，overrides = 仅已修改的键。 */
  state(manifest: GameManifestV1): GameSettingsState {
    const stored = this.readAll()[manifest.id];
    const definitions = manifest.settings ?? [];
    const values: Record<string, GameSettingValue> = {};
    const overrides: Record<string, GameSettingValue> = {};

    if (stored !== undefined) {
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
        fail("settings-file-invalid");
      }
      for (const [key, raw] of Object.entries(stored)) {
        const setting = definitions.find((item) => item.key === key);
        if (!setting) fail(`settings-unknown-key:${key}`);
        overrides[key] = validateSetting(setting, raw);
      }
    }

    for (const setting of definitions) {
      values[setting.key] =
        setting.key in overrides ? overrides[setting.key] : setting.default;
    }
    return { values, overrides };
  }

  /** PUT：只接受该 game manifest 中定义的 setting 键；先整批校验，再原子落盘。
   *  值等于 manifest default 时不写入覆盖（“已修改”仅表示真实差异）。 */
  update(
    manifest: GameManifestV1,
    patch: Record<string, unknown>,
  ): GameSettingsState {
    const all = this.readAll();
    const stored = all[manifest.id] ?? {};
    const definitions = manifest.settings ?? [];
    const validated: Record<string, GameSettingValue> = {};

    for (const [key, raw] of Object.entries(patch)) {
      const setting = definitions.find((item) => item.key === key);
      if (!setting) fail(`settings-unknown-key:${key}`);
      validated[key] = validateSetting(setting, raw);
    }

    for (const [key, value] of Object.entries(validated)) {
      const setting = definitions.find((item) => item.key === key)!;
      if (value === setting.default) delete stored[key];
      else stored[key] = value;
    }

    if (Object.keys(stored).length === 0) delete all[manifest.id];
    else all[manifest.id] = stored;
    this.writeAll(all);
    return this.state(manifest);
  }

  /** 恢复默认：删除该 game 的覆盖记录，回到 manifest default。 */
  reset(manifest: GameManifestV1): GameSettingsState {
    const all = this.readAll();
    if (manifest.id in all) {
      delete all[manifest.id];
      this.writeAll(all);
    } else if (!existsSync(this.filePath)) {
      // 文件从未创建时也写一个空 store，让“恢复默认”后的状态可观察。
      this.writeAll(all);
    }
    return this.state(manifest);
  }

  /**
   * spawn 前解析要注入的 env：仅 wired 且声明了 env 的 setting，
   * 值为 resolved（default 与覆盖合并后的最终值）。
   * 保留变量（PORT/HOST/ROOM_CODE/WAITING_HUB_RUNTIME）在此被过滤。
   */
  resolveEnv(manifest: GameManifestV1): Record<string, string> {
    const { values } = this.state(manifest);
    const env: Record<string, string> = {};
    for (const setting of manifest.settings ?? []) {
      if (!setting.wired || !setting.env) continue;
      if (RESERVED_ENV_KEYS.has(setting.env)) continue;
      env[setting.env] = String(values[setting.key]);
    }
    return env;
  }
}

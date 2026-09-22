import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameSettingsStore } from "../dist/platform/GameSettingsStore.js";

const root = mkdtempSync(join(tmpdir(), "waiting-settings-"));
const store = new GameSettingsStore(root);

const manifest = {
  id: "fixture-game",
  settings: [
    {
      key: "trackId",
      label: "赛道",
      type: "enum",
      env: "TRACK",
      wired: true,
      default: "bay",
      options: [
        { value: "bay", label: "海湾" },
        { value: "ridge", label: "山脊" },
      ],
    },
    { key: "laps", label: "圈数", type: "number", env: "LAPS", wired: true, default: 3, min: 1, max: 10, step: 1 },
    { key: "seconds", label: "时长", type: "number", env: "RACE_SECONDS", wired: true, default: 150, min: 30, max: 300, step: 10 },
    { key: "enabled", label: "开关", type: "boolean", default: true },
    { key: "note", label: "备注", type: "text", default: "" },
    // 故意映射到保留变量：resolveEnv 必须过滤掉它。
    { key: "portLike", label: "危险参数", type: "text", env: "PORT", wired: true, default: "x" },
  ],
};

// 1. 文件不存在时使用 manifest default，不创建文件。
let state = store.state(manifest);
assert.deepEqual(state.overrides, {});
assert.equal(state.values.laps, 3);
assert.equal(state.values.trackId, "bay");
assert.equal(existsSync(store.filePath), false);

// 2. 合法值持久化，JSON 结构符合预期。
state = store.update(manifest, {
  trackId: "ridge",
  laps: 5,
  seconds: 180,
  enabled: false,
  note: "门店A",
});
assert.equal(state.values.laps, 5);
assert.equal(state.overrides.laps, 5);
assert.equal(state.values.trackId, "ridge");
assert.equal(state.overrides.note, "门店A");
const persisted = JSON.parse(readFileSync(store.filePath, "utf8"));
assert.equal(persisted["fixture-game"].laps, 5);
assert.equal(persisted["fixture-game"].seconds, 180);

// 3. 非法值全部拒绝，且失败的写入不得改变文件。
assert.throws(() => store.update(manifest, { laps: 99 }), /settings-invalid-value:laps/);
assert.throws(() => store.update(manifest, { seconds: 155 }), /settings-invalid-value:seconds/);
// step 校验以 min 为基准：min=30, step=10 => 30/40/50 合法，35 非法。
assert.throws(() => store.update(manifest, { seconds: 35 }), /settings-invalid-value:seconds/);
assert.throws(() => store.update(manifest, { trackId: "volcano" }), /settings-invalid-value:trackId/);
assert.throws(() => store.update(manifest, { laps: "5" }), /settings-invalid-value:laps/);
assert.throws(() => store.update(manifest, { enabled: "yes" }), /settings-invalid-value:enabled/);
assert.throws(() => store.update(manifest, { note: 7 }), /settings-invalid-value:note/);
assert.throws(() => store.update(manifest, { nope: 1 }), /settings-unknown-key:nope/);
assert.throws(() => store.update(manifest, { laps: 5, nope: 1 }), /settings-unknown-key:nope/);
const afterFailures = JSON.parse(readFileSync(store.filePath, "utf8"));
assert.equal(afterFailures["fixture-game"].laps, 5);
assert.equal(afterFailures["fixture-game"].seconds, 180);
assert.ok(!("nope" in afterFailures["fixture-game"]));

// 4. step 校验基准：min=30, step=10 => 40/50 合法（30 已在上一步证明非法侧）。
state = store.update(manifest, { seconds: 40 });
assert.equal(state.values.seconds, 40);

// 5. resolveEnv：wired + env，值为 resolved 终值；保留变量被过滤。
const env = store.resolveEnv(manifest);
assert.equal(env.TRACK, "ridge");
assert.equal(env.LAPS, "5");
assert.equal(env.RACE_SECONDS, "40");
assert.equal(env.PORT, undefined);
assert.ok(!("WIDGET" in env));

// 5b. 值回到 default 时覆盖自动移除（“已修改”只表示真实差异）。
state = store.update(manifest, { laps: 3 });
assert.equal(state.values.laps, 3);
assert.ok(!("laps" in state.overrides));
const fileAfterDefault = JSON.parse(readFileSync(store.filePath, "utf8"));
assert.ok(!("laps" in fileAfterDefault["fixture-game"]));
assert.ok("trackId" in fileAfterDefault["fixture-game"]);

// 6. 恢复默认：覆盖记录删除，回到 manifest default。
state = store.reset(manifest);
assert.deepEqual(state.overrides, {});
assert.equal(state.values.laps, 3);
assert.equal(state.values.trackId, "bay");
const afterReset = JSON.parse(readFileSync(store.filePath, "utf8"));
assert.ok(!("fixture-game" in afterReset));

// 6b. 恢复默认后只提交等于默认值的键：不产生任何覆盖记录。
const defaultOnly = store.update(manifest, { laps: 3 });
assert.deepEqual(defaultOnly.overrides, {});
assert.ok(!("fixture-game" in JSON.parse(readFileSync(store.filePath, "utf8"))));

// 7. 损坏的文件必须大声失败，不静默重置。
writeFileSync(store.filePath, "{oops", "utf8");
assert.throws(() => store.state(manifest), /settings-file-invalid/);
assert.throws(() => store.resolveEnv(manifest), /settings-file-invalid/);

// 8. manifest 收缩后残留的未知键必须大声失败（恢复默认可自救）。
writeFileSync(
  store.filePath,
  JSON.stringify({ "fixture-game": { removedKey: 1 } }),
  "utf8",
);
assert.throws(() => store.state(manifest), /settings-unknown-key:removedKey/);
writeFileSync(store.filePath, JSON.stringify({}), "utf8");
assert.deepEqual(store.state(manifest).overrides, {});

rmSync(root, { recursive: true, force: true });
console.log(
  "GameSettingsStore smoke passed: defaults, strict validation, atomic persistence, reserved env guard, reset, and loud corruption handling.",
);

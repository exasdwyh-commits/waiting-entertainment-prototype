import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStateStore } from "../dist/platform/LocalStateStore.js";
import { QueueService } from "../dist/platform/QueueService.js";
import { ContentService } from "../dist/platform/ContentService.js";

const dir = mkdtempSync(join(tmpdir(), "waiting-state-"));
const file = join(dir, "platform-state.json");

try {
  const store = new LocalStateStore(file);
  const queue = new QueueService(store);
  const content = new ContentService(store);

  const first = queue.add(4, "靠窗");
  assert.equal(first.number, "A001");
  queue.transition(first.id, "called");

  content.setGameEnabled("pilot-racer", false);
  content.moveGame("pilot-racer", "up");
  const media = content.addMedia({
    kind: "message",
    title: "晚市欢迎",
    headline: "下一轮马上开始",
    subline: "扫码报名现场互动",
    durationSeconds: 7,
  });
  assert.equal(media.enabled, true);

  const reloadedStore = new LocalStateStore(file);
  const reloadedQueue = new QueueService(reloadedStore);
  const reloadedContent = new ContentService(reloadedStore);

  const queueItems = reloadedQueue.list();
  assert.equal(queueItems.length, 1);
  assert.equal(queueItems[0].number, "A001");
  assert.equal(queueItems[0].status, "called");

  const second = reloadedQueue.add(2);
  assert.equal(second.number, "A002");

  const settings = reloadedContent.snapshot();
  assert.ok(settings.disabledGameIds.includes("pilot-racer"));
  assert.equal(settings.gameOrder[0], "pilot-racer");
  assert.ok(settings.media.some((item) => item.id === media.id));

  reloadedContent.setMediaEnabled(media.id, false);
  const thirdStore = new LocalStateStore(file);
  assert.equal(
    thirdStore.content().media.find((item) => item.id === media.id)?.enabled,
    false,
  );

  console.log("Persistence smoke passed: queue numbering, queue state, game content and media survive restart.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

import test from "node:test";
import assert from "node:assert/strict";
import { createSeaBattle } from "../server.mjs";

test("Sea Battle runtime exposes Hub health protocol and start action", async () => {
  const runtime = await createSeaBattle({ host: "127.0.0.1", port: 0, manual: true, seconds: 45 });
  try {
    const info = await fetch(`http://127.0.0.1:${runtime.port}/info`).then((r) => r.json());
    assert.equal(info.protocol, "sea-battle/1");
    assert.equal(info.capacity, 8);
    assert.match(info.join, /code=/);

    const start = await fetch(`http://127.0.0.1:${runtime.port}/api/start`, { method: "POST" });
    assert.equal(start.status, 200);
    const body = await start.json();
    assert.equal(body.phase, "countdown");

    const display = await fetch(`http://127.0.0.1:${runtime.port}/display`);
    assert.equal(display.status, 200);
    assert.match(await display.text(), /SEA BATTLE/);

    const three = await fetch(`http://127.0.0.1:${runtime.port}/three/three.module.js`);
    assert.equal(three.status, 200);
    assert.match(three.headers.get("content-type") || "", /javascript/);
  } finally {
    await runtime.close();
  }
});

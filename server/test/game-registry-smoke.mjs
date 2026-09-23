import assert from "node:assert/strict";
import {
  BUILTIN_GAME_MANIFESTS,
  GameRegistry,
  validateGameManifests,
} from "../dist/platform/GameRegistry.js";
import { GameRegistryManager } from "../dist/platform/GameRegistryManager.js";

const clone = (value) => structuredClone(value);

assert.doesNotThrow(() => validateGameManifests(BUILTIN_GAME_MANIFESTS));

const pluginManager = new GameRegistryManager();
const installed = pluginManager.load();
assert.deepEqual(
  installed.map((game) => game.id).sort(),
  ["pilot-racer", "sea-battle", "table-push-king"],
);
assert.equal(pluginManager.listInstalled().length, 3);
assert.equal(pluginManager.get("table-push-king")?.runtime.kind, "embedded");
assert.equal(pluginManager.get("pilot-racer")?.runtime.port, 9010);
assert.equal(pluginManager.get("sea-battle")?.runtime.port, 9020);

const license = {
  storeId: "validator-test",
  plan: "PRO",
  entitlements: [
    "game:table-push-king",
    "game:pilot-racer",
    "game:sea-battle",
  ],
};
assert.doesNotThrow(() => new GameRegistry(license, BUILTIN_GAME_MANIFESTS));
const sea = BUILTIN_GAME_MANIFESTS.find((manifest) => manifest.id === "sea-battle");
assert.equal(sea?.version, "0.2.0");
assert.equal(sea?.runtime.bundledPath, "games/sea-battle");
assert.equal(sea?.settings?.find((setting) => setting.key === "seconds")?.default, 180);
const racer = BUILTIN_GAME_MANIFESTS.find((manifest) => manifest.id === "pilot-racer");
assert.equal(racer?.settings?.find((setting) => setting.key === "seconds")?.default, 150);

{
  const manifests = clone(BUILTIN_GAME_MANIFESTS);
  manifests.push(clone(manifests[0]));
  assert.throws(
    () => validateGameManifests(manifests),
    /manifest-duplicate-id:table-push-king/,
  );
}

{
  const manifests = clone(BUILTIN_GAME_MANIFESTS);
  const duplicate = clone(manifests[1]);
  duplicate.id = "port-collision";
  duplicate.name = "Port Collision";
  duplicate.commercial.entitlements = ["game:port-collision"];
  manifests.push(duplicate);
  assert.throws(
    () => validateGameManifests(manifests),
    /manifest-duplicate-port:9010:pilot-racer:port-collision/,
  );
}

{
  const manifests = clone(BUILTIN_GAME_MANIFESTS);
  manifests[1].entrypoints.player = "http://localhost:9010/";
  assert.throws(
    () => validateGameManifests(manifests),
    /manifest-invalid:pilot-racer:player-entrypoint-not-lan-portable/,
  );
}

{
  const manifests = clone(BUILTIN_GAME_MANIFESTS);
  delete manifests[2].runtime.healthProtocol;
  assert.throws(
    () => validateGameManifests(manifests),
    /manifest-invalid:sea-battle:process-health-protocol/,
  );
}

{
  const manifests = clone(BUILTIN_GAME_MANIFESTS);
  manifests[2].players = { min: 9, max: 8 };
  assert.throws(
    () => validateGameManifests(manifests),
    /manifest-invalid:sea-battle:invalid-player-range/,
  );
}

{
  const manifests = clone(BUILTIN_GAME_MANIFESTS);
  manifests[2].commercial.entitlements = ["updates:pro"];
  assert.throws(
    () => validateGameManifests(manifests),
    /manifest-invalid:sea-battle:missing-entitlement:game:sea-battle/,
  );
}

{
  const manifests = clone(BUILTIN_GAME_MANIFESTS);
  manifests[0].runtime.port = 9999;
  assert.throws(
    () => validateGameManifests(manifests),
    /manifest-invalid:table-push-king:embedded-runtime-has-process-fields/,
  );
}

console.log("GameRegistry smoke passed: plugin discovery, ids, ports, LAN entrypoints, player ranges, entitlement identity, and runtime contracts are validated.");


{
  const manifests = clone(BUILTIN_GAME_MANIFESTS);
  manifests[2].runtime.bundledPath = "../escape";
  assert.throws(
    () => validateGameManifests(manifests),
    /manifest-invalid:sea-battle:process-bundled-path/,
  );
}

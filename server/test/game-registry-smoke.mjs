import assert from "node:assert/strict";
import {
  BUILTIN_GAME_MANIFESTS,
  GameRegistry,
  validateGameManifests,
} from "../dist/platform/GameRegistry.js";

const clone = (value) => structuredClone(value);

assert.doesNotThrow(() => validateGameManifests(BUILTIN_GAME_MANIFESTS));

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

console.log("GameRegistry smoke passed: ids, ports, LAN entrypoints, player ranges, entitlement identity, and runtime contracts are validated.");

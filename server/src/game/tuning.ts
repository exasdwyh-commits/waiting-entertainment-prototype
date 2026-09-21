export const GAME_TUNING = {
  world: {
    gravityY: -18,
    arenaFriction: 1.25,
    arenaRestitution: 0.04,
  },

  movement: {
    linearDamping: 2.5,
    angularDamping: 2.2,
    colliderFriction: 1.1,
    colliderRestitution: 0.08,
    impulsePerTick: 0.16,
    maxHorizontalSpeed: 4.2,
    recoveryControlScale: 0.35,
    attackControlScale: 0.72,
    minBalanceControl: 0.52,
  },

  push: {
    cooldownMs: 850,
    animationHoldMs: 320,
    lungeImpulse: 1.7,
    lungeLift: 0.1,
    hitRange: 1.65,
    minimumFacingDot: 0.15,
    maxStrength: 3.0,
    falloffDistance: 2.25,
    verticalHitImpulse: 0.65,
    momentumMinMultiplier: 0.85,
    momentumMaxMultiplier: 1.25,
    momentumReferenceSpeed: 4.2,
  },

  balance: {
    hitLossBase: 0.26,
    hitLossScale: 0.52,
    minimumAfterHit: 0.08,
    knockdownBaseMs: 360,
    knockdownImpactMs: 460,
    recoveryStateBaseMs: 420,
    recoveryStateBalanceMs: 360,
    recoveringPerSecond: 0.9,
    passivePerSecond: 0.34,
    uprightMaxTorque: 0.11,
    uprightTiltFactor: 0.045,
    uprightRecoveryBoost: 1.85,
  },

  ledge: {
    hangWindowMs: 1_400,
    botRecoveryLeadMs: 650,
    inwardInputDot: 0.3,
    climbDurationMs: 680,
    climbInwardDistance: 1.45,
    climbTargetY: 0.96,
    climbRecoveryMs: 360,
    successfulClimbBalance: 0.52,
    failedHangBalance: 0.12,
    hangBalanceCap: 0.3,
  },
} as const;


function requireFinitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid game tuning: ${name} must be > 0 (received ${value})`);
  }
}

function requireUnitRange(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid game tuning: ${name} must be between 0 and 1 (received ${value})`);
  }
}

export function validateGameTuning() {
  if (!Number.isFinite(GAME_TUNING.world.gravityY) || GAME_TUNING.world.gravityY >= 0) {
    throw new Error("Invalid game tuning: world.gravityY must be negative");
  }

  requireFinitePositive("movement.linearDamping", GAME_TUNING.movement.linearDamping);
  requireFinitePositive("movement.angularDamping", GAME_TUNING.movement.angularDamping);
  requireFinitePositive("movement.colliderFriction", GAME_TUNING.movement.colliderFriction);
  requireFinitePositive("movement.impulsePerTick", GAME_TUNING.movement.impulsePerTick);
  requireFinitePositive("movement.maxHorizontalSpeed", GAME_TUNING.movement.maxHorizontalSpeed);
  requireUnitRange("movement.recoveryControlScale", GAME_TUNING.movement.recoveryControlScale);
  requireUnitRange("movement.attackControlScale", GAME_TUNING.movement.attackControlScale);
  requireUnitRange("movement.minBalanceControl", GAME_TUNING.movement.minBalanceControl);

  requireFinitePositive("push.cooldownMs", GAME_TUNING.push.cooldownMs);
  requireFinitePositive("push.lungeImpulse", GAME_TUNING.push.lungeImpulse);
  requireFinitePositive("push.hitRange", GAME_TUNING.push.hitRange);
  requireFinitePositive("push.maxStrength", GAME_TUNING.push.maxStrength);
  requireFinitePositive("push.falloffDistance", GAME_TUNING.push.falloffDistance);
  requireUnitRange("push.minimumFacingDot", GAME_TUNING.push.minimumFacingDot);
  requireFinitePositive("push.momentumMinMultiplier", GAME_TUNING.push.momentumMinMultiplier);
  requireFinitePositive("push.momentumMaxMultiplier", GAME_TUNING.push.momentumMaxMultiplier);
  requireFinitePositive("push.momentumReferenceSpeed", GAME_TUNING.push.momentumReferenceSpeed);
  if (GAME_TUNING.push.momentumMaxMultiplier < GAME_TUNING.push.momentumMinMultiplier) {
    throw new Error("Invalid game tuning: push momentum max must be >= min");
  }

  requireUnitRange("balance.hitLossBase", GAME_TUNING.balance.hitLossBase);
  requireUnitRange("balance.hitLossScale", GAME_TUNING.balance.hitLossScale);
  requireUnitRange("balance.minimumAfterHit", GAME_TUNING.balance.minimumAfterHit);
  requireFinitePositive("balance.recoveringPerSecond", GAME_TUNING.balance.recoveringPerSecond);
  requireFinitePositive("balance.uprightMaxTorque", GAME_TUNING.balance.uprightMaxTorque);

  requireFinitePositive("ledge.hangWindowMs", GAME_TUNING.ledge.hangWindowMs);
  requireFinitePositive("ledge.climbDurationMs", GAME_TUNING.ledge.climbDurationMs);
  requireUnitRange("ledge.inwardInputDot", GAME_TUNING.ledge.inwardInputDot);
  requireUnitRange("ledge.successfulClimbBalance", GAME_TUNING.ledge.successfulClimbBalance);
  requireUnitRange("ledge.failedHangBalance", GAME_TUNING.ledge.failedHangBalance);
  requireUnitRange("ledge.hangBalanceCap", GAME_TUNING.ledge.hangBalanceCap);
}

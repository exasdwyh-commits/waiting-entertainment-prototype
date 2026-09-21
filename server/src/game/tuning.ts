export const GAME_TUNING = {
  match: {
    roundMs: 180_000,
    openingEndMs: 60_000,
    brawlEndMs: 135_000,
    dangerEndMs: 165_000,
    preFinalRespawnMs: 2_000,
    respawnProtectionMs: 1_100,
    respawnCandidateCount: 16,
    resultMs: 8_000,
  },

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
    sprintImpulseMultiplier: 1.34,
    sprintMaxSpeedMultiplier: 1.32,
    carryMoveScale: 0.7,
    recoveryControlScale: 0.35,
    attackControlScale: 0.72,
    minBalanceControl: 0.52,
  },

  stamina: {
    max: 1,
    sprintDrainPerSecond: 0.15,
    grabDrainPerSecond: 0.17,
    recoveryPerSecond: 0.24,
    recoveryDelayAfterSpendMs: 420,
    punchCost: 0.055,
    heavyCost: 0.17,
    throwCost: 0.13,
    exhaustedThreshold: 0.08,
  },

  punch: {
    cooldownMs: 360,
    animationHoldMs: 210,
    lungeImpulse: 0.62,
    hitRange: 1.2,
    minimumFacingDot: 0.02,
    maxStrength: 1.35,
    verticalHitImpulse: 0.12,
    balanceLoss: 0.13,
    staggerMs: 190,
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

  grab: {
    range: 1.18,
    minimumFacingDot: -0.12,
    holdForward: 0.72,
    holdHeight: 0.94,
    botHoldMs: 520,
    targetBalanceBias: 0.28,
  },

  environment: {
    lazySusanBaseSpeed: 0.28,
    lazySusanMaxSpeed: 0.72,
    lazySusanImpulsePerTick: 0.012,
    finalTenSpeedMultiplier: 1.45,
  },

  toss: {
    range: 1.25,
    maxTargetBalance: 0.52,
    windupMs: 340,
    cooldownMs: 1_150,
    holdForward: 0.62,
    holdHeight: 1.15,
    baseStrength: 4.05,
    verticalStrength: 1.05,
    momentumBonus: 0.35,
    targetBalanceAfter: 0.08,
    knockdownMs: 760,
    attackerLockMs: 280,
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
  requireFinitePositive("match.roundMs", GAME_TUNING.match.roundMs);
  requireFinitePositive(
    "match.preFinalRespawnMs",
    GAME_TUNING.match.preFinalRespawnMs,
  );
  requireFinitePositive(
    "match.respawnProtectionMs",
    GAME_TUNING.match.respawnProtectionMs,
  );
  requireFinitePositive(
    "match.respawnCandidateCount",
    GAME_TUNING.match.respawnCandidateCount,
  );
  if (
    !(
      GAME_TUNING.match.openingEndMs <
      GAME_TUNING.match.brawlEndMs &&
      GAME_TUNING.match.brawlEndMs <
      GAME_TUNING.match.dangerEndMs &&
      GAME_TUNING.match.dangerEndMs <
      GAME_TUNING.match.roundMs
    )
  ) {
    throw new Error("Invalid game tuning: match stage boundaries must be ascending");
  }

  if (!Number.isFinite(GAME_TUNING.world.gravityY) || GAME_TUNING.world.gravityY >= 0) {
    throw new Error("Invalid game tuning: world.gravityY must be negative");
  }

  requireFinitePositive("movement.linearDamping", GAME_TUNING.movement.linearDamping);
  requireFinitePositive("movement.angularDamping", GAME_TUNING.movement.angularDamping);
  requireFinitePositive("movement.colliderFriction", GAME_TUNING.movement.colliderFriction);
  requireFinitePositive("movement.impulsePerTick", GAME_TUNING.movement.impulsePerTick);
  requireFinitePositive("movement.maxHorizontalSpeed", GAME_TUNING.movement.maxHorizontalSpeed);
  requireFinitePositive("movement.sprintImpulseMultiplier", GAME_TUNING.movement.sprintImpulseMultiplier);
  requireFinitePositive("movement.sprintMaxSpeedMultiplier", GAME_TUNING.movement.sprintMaxSpeedMultiplier);
  requireUnitRange("movement.carryMoveScale", GAME_TUNING.movement.carryMoveScale);
  requireUnitRange("movement.recoveryControlScale", GAME_TUNING.movement.recoveryControlScale);
  requireUnitRange("movement.attackControlScale", GAME_TUNING.movement.attackControlScale);
  requireUnitRange("movement.minBalanceControl", GAME_TUNING.movement.minBalanceControl);

  requireFinitePositive("stamina.sprintDrainPerSecond", GAME_TUNING.stamina.sprintDrainPerSecond);
  requireFinitePositive("stamina.grabDrainPerSecond", GAME_TUNING.stamina.grabDrainPerSecond);
  requireFinitePositive("stamina.recoveryPerSecond", GAME_TUNING.stamina.recoveryPerSecond);
  requireFinitePositive("stamina.recoveryDelayAfterSpendMs", GAME_TUNING.stamina.recoveryDelayAfterSpendMs);
  requireUnitRange("stamina.punchCost", GAME_TUNING.stamina.punchCost);
  requireUnitRange("stamina.heavyCost", GAME_TUNING.stamina.heavyCost);
  requireUnitRange("stamina.throwCost", GAME_TUNING.stamina.throwCost);
  requireUnitRange("stamina.exhaustedThreshold", GAME_TUNING.stamina.exhaustedThreshold);

  requireFinitePositive("punch.cooldownMs", GAME_TUNING.punch.cooldownMs);
  requireFinitePositive("punch.animationHoldMs", GAME_TUNING.punch.animationHoldMs);
  requireFinitePositive("punch.lungeImpulse", GAME_TUNING.punch.lungeImpulse);
  requireFinitePositive("punch.hitRange", GAME_TUNING.punch.hitRange);
  requireFinitePositive("punch.maxStrength", GAME_TUNING.punch.maxStrength);
  requireUnitRange("punch.balanceLoss", GAME_TUNING.punch.balanceLoss);

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

  requireFinitePositive("grab.range", GAME_TUNING.grab.range);
  requireFinitePositive("grab.holdForward", GAME_TUNING.grab.holdForward);
  requireFinitePositive("grab.holdHeight", GAME_TUNING.grab.holdHeight);
  requireFinitePositive("grab.botHoldMs", GAME_TUNING.grab.botHoldMs);
  requireUnitRange("grab.targetBalanceBias", GAME_TUNING.grab.targetBalanceBias);

  requireFinitePositive("environment.lazySusanBaseSpeed", GAME_TUNING.environment.lazySusanBaseSpeed);
  requireFinitePositive("environment.lazySusanMaxSpeed", GAME_TUNING.environment.lazySusanMaxSpeed);
  requireFinitePositive("environment.lazySusanImpulsePerTick", GAME_TUNING.environment.lazySusanImpulsePerTick);
  requireFinitePositive("environment.finalTenSpeedMultiplier", GAME_TUNING.environment.finalTenSpeedMultiplier);
  if (GAME_TUNING.environment.lazySusanMaxSpeed < GAME_TUNING.environment.lazySusanBaseSpeed) {
    throw new Error("Invalid game tuning: lazy Susan max speed must be >= base speed");
  }

  requireFinitePositive("toss.range", GAME_TUNING.toss.range);
  requireUnitRange("toss.maxTargetBalance", GAME_TUNING.toss.maxTargetBalance);
  requireFinitePositive("toss.windupMs", GAME_TUNING.toss.windupMs);
  requireFinitePositive("toss.cooldownMs", GAME_TUNING.toss.cooldownMs);
  requireFinitePositive("toss.holdForward", GAME_TUNING.toss.holdForward);
  requireFinitePositive("toss.holdHeight", GAME_TUNING.toss.holdHeight);
  requireFinitePositive("toss.baseStrength", GAME_TUNING.toss.baseStrength);
  requireFinitePositive("toss.verticalStrength", GAME_TUNING.toss.verticalStrength);
  requireUnitRange("toss.momentumBonus", GAME_TUNING.toss.momentumBonus);
  requireUnitRange("toss.targetBalanceAfter", GAME_TUNING.toss.targetBalanceAfter);
  requireFinitePositive("toss.knockdownMs", GAME_TUNING.toss.knockdownMs);

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

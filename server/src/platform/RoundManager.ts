import { randomInt, randomUUID } from "node:crypto";
import type {
  EntertainmentRound,
  GameManifestV1,
  RoundPlayer,
  RoundStatus,
} from "@waiting/shared";

const ROUND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeRoundCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += ROUND_CODE_ALPHABET[randomInt(ROUND_CODE_ALPHABET.length)];
  }
  return code;
}

function cloneRound(round: EntertainmentRound): EntertainmentRound {
  return structuredClone(round);
}

export class RoundManager {
  private readonly rounds = new Map<string, EntertainmentRound>();

  list(): EntertainmentRound[] {
    this.expireStaleRounds();
    return [...this.rounds.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(cloneRound);
  }

  create(manifest: GameManifestV1, playerLimit?: number): EntertainmentRound {
    this.expireStaleRounds();

    const limit = Math.min(
      manifest.players.max,
      Math.max(manifest.players.min, playerLimit ?? manifest.players.max),
    );

    let code = makeRoundCode();
    while ([...this.rounds.values()].some((round) => round.code === code && round.status === "recruiting")) {
      code = makeRoundCode();
    }

    const now = Date.now();
    const round: EntertainmentRound = {
      id: randomUUID(),
      code,
      gameId: manifest.id,
      status: "recruiting",
      players: [],
      playerLimit: limit,
      createdAt: now,
      expiresAt: now + manifest.round.codeTtlSeconds * 1000,
    };

    this.rounds.set(round.id, round);
    return cloneRound(round);
  }

  joinByCode(code: string, name: string, queueTicketId?: string): EntertainmentRound {
    this.expireStaleRounds();
    const normalized = code.trim().toUpperCase();
    const round = [...this.rounds.values()].find(
      (candidate) => candidate.code === normalized && candidate.status === "recruiting",
    );

    if (!round) {
      throw new Error("round-not-recruiting");
    }
    if (round.players.length >= round.playerLimit) {
      throw new Error("round-full");
    }

    const player: RoundPlayer = {
      id: randomUUID(),
      name: name.trim().slice(0, 24) || `玩家${round.players.length + 1}`,
      joinedAt: Date.now(),
      ...(queueTicketId ? { queueTicketId } : {}),
    };

    round.players.push(player);
    return cloneRound(round);
  }

  transition(roundId: string, next: RoundStatus): EntertainmentRound {
    this.expireStaleRounds();
    const round = this.rounds.get(roundId);
    if (!round) {
      throw new Error("round-not-found");
    }

    const allowed: Record<RoundStatus, readonly RoundStatus[]> = {
      recruiting: ["locked", "cancelled", "expired"],
      locked: ["recruiting", "running", "cancelled"],
      running: ["finished", "cancelled"],
      finished: [],
      cancelled: [],
      expired: [],
    };

    if (!allowed[round.status].includes(next)) {
      throw new Error(`invalid-round-transition:${round.status}->${next}`);
    }

    round.status = next;
    if (next === "running") {
      round.startedAt = Date.now();
    }
    if (next === "finished" || next === "cancelled") {
      round.finishedAt = Date.now();
    }
    return cloneRound(round);
  }

  get(roundId: string): EntertainmentRound | undefined {
    this.expireStaleRounds();
    const round = this.rounds.get(roundId);
    return round ? cloneRound(round) : undefined;
  }

  private expireStaleRounds(): void {
    const now = Date.now();
    for (const round of this.rounds.values()) {
      if (round.status === "recruiting" && round.expiresAt <= now) {
        round.status = "expired";
      }
    }
  }
}

import type { GameEvent, MatchSnapshot, PlayerState } from "@waiting/shared";

export type BroadcastShot =
  | "master"
  | "impact"
  | "edge"
  | "duel"
  | "winner"
  | "replay-master"
  | "replay-reverse";

export type ReplayDirectorContext = {
  actorId?: string;
  targetId?: string;
  reverseAngle: boolean;
  label: string;
};

export type DirectorDecision = {
  shot: BroadcastShot;
  focusIds: string[];
  label: string;
  replay: boolean;
};

type LiveFocus = {
  event: GameEvent;
  until: number;
};

const EVENT_HOLD_MS: Partial<Record<GameEvent["type"], number>> = {
  push_hit: 700,
  toss: 1_350,
  edge_save: 1_050,
  big_fall: 1_000,
  final_elimination: 1_400,
};

export class BroadcastDirector {
  private focus?: LiveFocus;

  reset() {
    this.focus = undefined;
  }

  noteEvent(event: GameEvent, now: number) {
    const hold = EVENT_HOLD_MS[event.type] ?? 0;
    const importantPush =
      event.type === "push_hit" && event.importance >= 0.72;

    if (!hold || (event.type === "push_hit" && !importantPush)) return;

    this.focus = {
      event,
      until: now + hold,
    };
  }

  decide(
    snapshot: MatchSnapshot | undefined,
    now: number,
    replay?: ReplayDirectorContext,
  ): DirectorDecision {
    if (replay) {
      return {
        shot: replay.reverseAngle ? "replay-reverse" : "replay-master",
        focusIds: compactIds(replay.actorId, replay.targetId),
        label: replay.label,
        replay: true,
      };
    }

    if (!snapshot) {
      return {
        shot: "master",
        focusIds: [],
        label: "全场主机位",
        replay: false,
      };
    }

    if (snapshot.phase === "finished") {
      return {
        shot: "winner",
        focusIds: compactIds(snapshot.winnerId),
        label: snapshot.winnerId ? "冠军镜头" : "终场",
        replay: false,
      };
    }

    const alive = snapshot.players.filter((player) => !player.eliminated);
    const edge = alive.find((player) => isEdgeState(player.state));
    if (edge) {
      return {
        shot: "edge",
        focusIds: [edge.id],
        label: edge.state === "edge_hang" ? "边缘救险" : "极限爬回",
        replay: false,
      };
    }

    if (this.focus && now <= this.focus.until) {
      const event = this.focus.event;
      const label =
        event.type === "toss"
          ? "甩人特写"
          : event.type === "big_fall"
            ? "击落跟拍"
            : event.type === "final_elimination"
              ? "决胜瞬间"
              : event.type === "edge_save"
                ? "极限救边"
                : "强力碰撞";

      return {
        shot: event.type === "edge_save" ? "edge" : "impact",
        focusIds: compactIds(event.actorId, event.targetId),
        label,
        replay: false,
      };
    }

    if (this.focus && now > this.focus.until) {
      this.focus = undefined;
    }

    if (snapshot.phase === "playing" && alive.length <= 2 && alive.length > 0) {
      return {
        shot: "duel",
        focusIds: alive.map((player) => player.id),
        label: alive.length === 2 ? "决胜 1V1" : "最后生还者",
        replay: false,
      };
    }

    return {
      shot: "master",
      focusIds: [],
      label:
        snapshot.phase === "countdown"
          ? "比赛准备"
          : snapshot.timeLeftMs <= 10_000
            ? "最后 10 秒"
            : "全场主机位",
      replay: false,
    };
  }
}

function isEdgeState(state: PlayerState) {
  return state === "edge_hang" || state === "climbing";
}

function compactIds(...ids: Array<string | undefined>) {
  return ids.filter((id): id is string => Boolean(id));
}

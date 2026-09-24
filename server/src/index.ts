import { createServer } from "node:http";
import { Server } from "socket.io";
import type { PlayerInput } from "@waiting/shared";
import { GameSession } from "./game/GameSession.js";
import { PlatformHub } from "./platform/PlatformHub.js";
import { handlePlatformRequest } from "./platform/httpApi.js";

const PORT = Number(process.env.PORT ?? 3001);
const platform = new PlatformHub();
let session: GameSession;

const httpServer = createServer(async (req, res) => {
  if (
    await handlePlatformRequest(req, res, platform, {
      onRoundStarted: (round) => {
        if (round.gameId === "table-push-king") {
          session.startHostedRound();
        }
      },
    })
  ) {
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        mode: "authoritative",
        topology: "single-local-session",
        platform: "hub-foundation",
      }),
    );
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Waiting Entertainment authoritative game server");
});

const io = new Server(httpServer, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

session = new GameSession(io);
await session.start();

io.on("connection", (socket) => {
  socket.on(
    "join",
    (
      payload: { sessionId?: string; name?: string; roundCode?: string },
      ack?: (value: unknown) => void,
    ) => {
      const requestedName = payload?.name ?? "";
      const hostedRound = platform.rounds.activeForGame("table-push-king");
      if (
        hostedRound &&
        !platform.rounds.isRegisteredParticipant(
          "table-push-king",
          payload?.roundCode ?? "",
          requestedName,
        )
      ) {
        ack?.({ ok: false, reason: "round-admission-required" });
        return;
      }

      const player = session.join(socket.id, payload?.sessionId, requestedName);
      ack?.(player ? { ok: true, ...player } : { ok: false, reason: "session-full" });
    },
  );

  socket.on("input", (payload: Partial<PlayerInput>) => {
    session.input(socket.id, payload ?? {});
  });

  if (process.env.WAITING_STRESS_MODE === "1") {
    socket.on(
      "stress:force-fall",
      (_payload: unknown, ack?: (value: { ok: boolean }) => void) => {
        ack?.({ ok: session.debugForceFall(socket.id) });
      },
    );
    socket.on(
      "stress:spawn-weapon",
      (
        payload: { kind?: "pan" | "spatula" | "plate" },
        ack?: (value: { ok: boolean }) => void,
      ) => {
        const kind = payload?.kind;
        ack?.({
          ok:
            kind === "pan" || kind === "spatula" || kind === "plate"
              ? session.debugSpawnWeapon(socket.id, kind)
              : false,
        });
      },
    );
  }

  socket.on(
    "latency:ping",
    (_payload: unknown, ack?: (value: { ok: true }) => void) => {
      ack?.({ ok: true });
    },
  );

  socket.on("disconnect", () => {
    session.leave(socket.id);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Waiting Entertainment authoritative server listening on :${PORT}`);
});

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  session.stop();
  await platform.runtime.stopAll();
  io.close();
  httpServer.close(() => process.exit(0));
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

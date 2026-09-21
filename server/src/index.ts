import { createServer } from "node:http";
import { Server } from "socket.io";
import type { PlayerInput } from "@waiting/shared";
import { GameSession } from "./game/GameSession.js";

const PORT = Number(process.env.PORT ?? 3001);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, mode: "authoritative", topology: "single-local-session" }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Waiting Entertainment authoritative game server");
});

const io = new Server(httpServer, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

const session = new GameSession(io);
await session.start();

io.on("connection", (socket) => {
  socket.on(
    "join",
    (payload: { sessionId?: string; name?: string }, ack?: (value: unknown) => void) => {
      const player = session.join(socket.id, payload?.sessionId, payload?.name);
      ack?.(player ? { ok: true, ...player } : { ok: false, reason: "session-full" });
    },
  );

  socket.on("input", (payload: Partial<PlayerInput>) => {
    session.input(socket.id, payload ?? {});
  });

  socket.on("disconnect", () => {
    session.leave(socket.id);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Waiting Entertainment authoritative server listening on :${PORT}`);
});

const shutdown = () => {
  session.stop();
  io.close();
  httpServer.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

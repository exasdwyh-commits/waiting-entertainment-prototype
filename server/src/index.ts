import { createServer } from "node:http";
import { Server } from "socket.io";
import type { PlayerInput } from "@waiting/shared";
import { GameRoom } from "./game/GameRoom.js";

const PORT = Number(process.env.PORT ?? 3001);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, mode: "authoritative", room: "main" }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Waiting Entertainment authoritative game server");
});

const io = new Server(httpServer, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

const room = new GameRoom(io);
await room.start();

io.on("connection", (socket) => {
  // Big-screen clients need snapshots even when they are not players.
  socket.join("main");

  socket.on("join", (payload: { name?: string }, ack?: (value: unknown) => void) => {
    const player = room.join(socket.id, payload?.name);
    ack?.(player ? { ok: true, ...player } : { ok: false, reason: "room-full" });
  });

  socket.on("input", (payload: Partial<PlayerInput>) => {
    room.input(socket.id, payload ?? {});
  });

  socket.on("disconnect", () => {
    room.leave(socket.id);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Waiting Entertainment authoritative server listening on :${PORT}`);
});

const shutdown = () => {
  room.stop();
  io.close();
  httpServer.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

import { createServer } from "node:http";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT ?? 3001);

type ControllerState = {
  id: string;
  name: string;
  moveX: number;
  moveY: number;
  push: boolean;
  lastSeen: number;
};

const controllers = new Map<string, ControllerState>();

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, controllers: controllers.size }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Waiting Entertainment authoritative server");
});

const io = new Server(httpServer, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

io.on("connection", (socket) => {
  socket.on("join", (payload: { name?: string }, ack?: (value: unknown) => void) => {
    const player: ControllerState = {
      id: socket.id,
      name: (payload?.name || "Player").slice(0, 16),
      moveX: 0,
      moveY: 0,
      push: false,
      lastSeen: Date.now(),
    };

    controllers.set(socket.id, player);
    socket.join("main");
    ack?.({ ok: true, playerId: socket.id });
    io.to("main").emit("controllers", [...controllers.values()]);
  });

  socket.on("input", (payload: { moveX?: number; moveY?: number; push?: boolean }) => {
    const player = controllers.get(socket.id);
    if (!player) return;

    player.moveX = Math.max(-1, Math.min(1, Number(payload.moveX) || 0));
    player.moveY = Math.max(-1, Math.min(1, Number(payload.moveY) || 0));
    player.push = Boolean(payload.push);
    player.lastSeen = Date.now();
  });

  socket.on("disconnect", () => {
    controllers.delete(socket.id);
    io.to("main").emit("controllers", [...controllers.values()]);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, player] of controllers) {
    if (now - player.lastSeen > 15_000) controllers.delete(id);
  }
}, 5_000).unref();

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Waiting Entertainment server listening on :${PORT}`);
});

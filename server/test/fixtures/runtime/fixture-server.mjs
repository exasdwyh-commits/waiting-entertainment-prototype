import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 19090);
const roomCode = process.env.ROOM_CODE ?? "NONE";
let starts = 0;

const server = createServer((req, res) => {
  if (req.url === "/info") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, roomCode, starts }));
    return;
  }
  if (req.url === "/api/start" && req.method === "POST") {
    starts += 1;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, starts, roomCode }));
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(port, "127.0.0.1");

const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

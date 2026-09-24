import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { Server as SocketIOServer } from "socket.io";
import {
  CAPACITY,
  applyInput,
  chooseUpgrade,
  makeGame,
  snapshot,
  startGame,
  stepGame,
} from "./game.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const THREE_MODULE = fileURLToPath(import.meta.resolve("three"));
const THREE_CORE = resolve(dirname(THREE_MODULE), "three.core.js");
const THREE_ADDONS = resolve(dirname(THREE_MODULE), "../examples/jsm");
const ASSET_ROOT = resolve(ROOT, "public/assets");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
};

const staticFiles = new Map([
  ["/", ["public/index.html", "text/html; charset=utf-8"]],
  ["/display", ["public/index.html", "text/html; charset=utf-8"]],
  ["/app.mjs", ["public/app.mjs", "text/javascript; charset=utf-8"]],
  ["/style.css", ["public/style.css", "text/css; charset=utf-8"]],
]);

function safeStaticTarget(root, prefix, pathname) {
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }
  if (!relative || relative.includes("\0")) return null;
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(root + "/")) return null;
  return target;
}

async function sendStatic(res, target, cache = "public, max-age=3600") {
  try {
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
      "cache-control": cache,
    });
    res.end(body);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") return false;
    throw error;
  }
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function safeName(value, fallback) {
  return String(value ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, 12) || fallback;
}

export async function createSeaBattle({
  host = "0.0.0.0",
  port = 9020,
  manual = false,
  seconds = Number(process.env.RACE_SECONDS ?? 180),
} = {}) {
  const state = makeGame({ seconds });
  const sessions = new Map();
  const code = process.env.ROOM_CODE || "SEA888";
  let advertised = "";

  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/info") {
        sendJson(res, {
          code,
          join: advertised,
          capacity: CAPACITY,
          protocol: "sea-battle/1",
          // 只读观测字段：让 Hub 注入的 RACE_SECONDS 在重启后可被验收。
          seconds,
        });
        return;
      }
      if (url.pathname === "/api/start" && (req.method === "GET" || req.method === "POST")) {
        startGame(state);
        sendJson(res, { ok: true, phase: state.phase, round: state.round });
        return;
      }
      if (url.pathname === "/qr.svg") {
        res.writeHead(200, { "content-type": "image/svg+xml" });
        res.end(await QRCode.toString(advertised, { type: "svg", margin: 1, width: 180 }));
        return;
      }
      if (
        url.pathname === "/three/three.module.js" ||
        url.pathname === "/three/three.core.js"
      ) {
        res.writeHead(200, {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "public, max-age=3600",
        });
        res.end(await readFile(
          url.pathname.endsWith("three.core.js") ? THREE_CORE : THREE_MODULE,
        ));
        return;
      }
      if (url.pathname.startsWith("/three/addons/")) {
        const target = safeStaticTarget(
          THREE_ADDONS,
          "/three/addons/",
          url.pathname,
        );
        if (target && await sendStatic(res, target)) return;
        res.writeHead(404);
        res.end("Three addon not found");
        return;
      }
      if (url.pathname.startsWith("/assets/")) {
        const target = safeStaticTarget(ASSET_ROOT, "/assets/", url.pathname);
        const cache = url.pathname.endsWith(".json")
          ? "no-store"
          : "public, max-age=300";
        if (target && await sendStatic(res, target, cache)) return;
        res.writeHead(404);
        res.end("Asset not found");
        return;
      }
      const entry = staticFiles.get(url.pathname);
      if (entry) {
        const [relative, type] = entry;
        res.writeHead(200, {
          "content-type": type,
          "cache-control": "no-store",
        });
        res.end(await readFile(resolve(ROOT, relative)));
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    } catch (error) {
      res.writeHead(500);
      res.end(error instanceof Error ? error.message : "Sea Battle server error");
    }
  });

  const io = new SocketIOServer(http, {
    serveClient: true,
    cors: { origin: true, credentials: false },
  });

  io.on("connection", (socket) => {
    const role = socket.handshake.auth?.role === "display" ? "display" : "player";
    socket.data.role = role;

    if (role === "display") {
      socket.emit("welcome", { role: "display" });
      socket.emit("state", snapshot(state));
      socket.on("start", () => startGame(state));
      return;
    }

    socket.on("join", ({ name, token } = {}) => {
      let session = typeof token === "string" ? sessions.get(token) : undefined;
      if (session && session.expires <= state.time) {
        sessions.delete(token);
        session = undefined;
      }

      let sessionToken = token;
      if (!session) {
        const reserved = new Set(
          [...sessions.values()]
            .filter((item) => item.expires > state.time)
            .map((item) => item.boat.id),
        );
        const boat = state.boats.find((candidate) => !reserved.has(candidate.id));
        if (!boat) {
          socket.emit("join-error", { message: "8 个船位已满，请稍后再试" });
          return;
        }
        sessionToken = randomBytes(24).toString("hex");
        session = { boat, expires: Infinity };
        sessions.set(sessionToken, session);
        boat.name = safeName(name, `船长 ${boat.id + 1}`);
      }

      session.expires = Infinity;
      session.socketId = socket.id;
      socket.data.token = sessionToken;
      socket.data.boatId = session.boat.id;
      session.boat.human = true;
      session.boat.connected = true;
      session.boat.ready = true;

      if (state.phase === "demo") state.phase = "lobby";

      socket.emit("welcome", {
        role: "player",
        id: session.boat.id,
        token: sessionToken,
        name: session.boat.name,
      });
      socket.emit("state", snapshot(state));
    });

    socket.on("input", (input) => {
      const id = socket.data.boatId;
      if (!Number.isInteger(id)) return;
      applyInput(state.boats[id], input);
    });

    socket.on("upgrade", ({ id } = {}) => {
      const boatId = socket.data.boatId;
      if (!Number.isInteger(boatId) || typeof id !== "string") return;
      chooseUpgrade(state, boatId, id);
    });

    socket.on("disconnect", () => {
      const token = socket.data.token;
      const boatId = socket.data.boatId;
      if (typeof token === "string") {
        const session = sessions.get(token);
        if (session?.socketId === socket.id) {
          session.socketId = undefined;
          session.expires = state.time + 15;
        }
      }
      if (Number.isInteger(boatId) && state.boats[boatId]) {
        state.boats[boatId].connected = false;
        state.boats[boatId].steer = 0;
        state.boats[boatId].throttle = false;
      }
    });
  });

  await new Promise((resolvePromise, reject) => {
    http.once("error", reject);
    http.listen(port, host, resolvePromise);
  });

  const bound = http.address().port;
  const ips = Object.values(networkInterfaces()).flat().filter(
    (item) => item && item.family === "IPv4" && !item.internal,
  );
  const lan = ips.find((item) => item.address.startsWith("192.168.")) ??
    ips.find((item) => item.address.startsWith("10.")) ??
    ips[0];
  const publicHost = host === "127.0.0.1" ? "127.0.0.1" : (lan?.address ?? "127.0.0.1");
  advertised = `http://${publicHost}:${bound}/?code=${encodeURIComponent(code)}`;

  let tickIndex = 0;
  const timer = manual ? null : setInterval(() => {
    for (const [token, session] of sessions) {
      if (session.expires <= state.time) {
        session.boat.human = false;
        session.boat.connected = false;
        session.boat.name = `船长 ${String(session.boat.id + 1).padStart(2, "0")}`;
        sessions.delete(token);
      }
    }
    stepGame(state, 1 / 30);
    tickIndex += 1;
    if (tickIndex % 2 === 0) io.emit("state", snapshot(state));
  }, 1000 / 30);

  return {
    state,
    code,
    port: bound,
    join: advertised,
    tick: () => stepGame(state, 1 / 30),
    close: async () => {
      if (timer) clearInterval(timer);
      await new Promise((resolvePromise) => io.close(resolvePromise));
      await new Promise((resolvePromise) => http.close(resolvePromise));
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const game = await createSeaBattle({
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 9020),
  });
  console.log(`
海战竞技 · Sea Battle V1
大屏：http://localhost:${game.port}/display
手机：${game.join}
同一 Wi-Fi 扫码加入。Ctrl+C 停止。
`);
  const stop = async () => {
    await game.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

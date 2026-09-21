import "./style.css";
import { LocalPrototype } from "./game/LocalPrototype";
import { NetworkGame } from "./game/NetworkGame";

const root = document.querySelector<HTMLDivElement>("#app")!;
const localMode = new URLSearchParams(location.search).get("mode") === "local";

root.innerHTML = `
  <div id="stage"></div>
  <section class="hud">
    <div>
      <span class="eyebrow">WAITING ENTERTAINMENT</span>
      <h1>餐桌推推王</h1>
      <span id="status">${localMode ? "本地调试模式" : "连接服务器中"}</span>
    </div>
    <div class="timer"><span id="timer">60</span>s</div>
  </section>
  <aside class="join-panel" id="join-panel">
    <canvas id="qr" width="144" height="144"></canvas>
    <div>
      <strong>扫码加入</strong>
      <span id="join-text">正在生成加入码…</span>
    </div>
  </aside>
  <div class="tip">${localMode ? "WASD / 方向键移动　SPACE 冲撞　R 重开" : "手机控制 · 服务器权威物理 · AI自动补位"}</div>
  <div id="message" class="message"></div>
`;

const common = {
  container: document.querySelector<HTMLDivElement>("#stage")!,
  timer: document.querySelector<HTMLSpanElement>("#timer")!,
  message: document.querySelector<HTMLDivElement>("#message")!,
};

if (localMode) {
  document.querySelector<HTMLElement>("#join-panel")!.hidden = true;
  const prototype = new LocalPrototype(common);
  prototype.start().catch((error) => {
    console.error(error);
    common.message.textContent = "物理引擎初始化失败，请查看控制台";
  });
} else {
  const game = new NetworkGame({
    ...common,
    status: document.querySelector<HTMLSpanElement>("#status")!,
    qr: document.querySelector<HTMLCanvasElement>("#qr")!,
    joinText: document.querySelector<HTMLSpanElement>("#join-text")!,
  });
  game.start();
}

import "./style.css";
import { LocalPrototype } from "./game/LocalPrototype";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
  <div id="stage"></div>
  <section class="hud">
    <div>
      <span class="eyebrow">WAITING ENTERTAINMENT</span>
      <h1>餐桌推推王</h1>
    </div>
    <div class="timer"><span id="timer">60</span>s</div>
  </section>
  <div class="tip">WASD / 方向键移动　SPACE 冲撞　R 重开</div>
  <div id="message" class="message"></div>
`;

const prototype = new LocalPrototype({
  container: document.querySelector<HTMLDivElement>("#stage")!,
  timer: document.querySelector<HTMLSpanElement>("#timer")!,
  message: document.querySelector<HTMLDivElement>("#message")!,
});

prototype.start().catch((error) => {
  console.error(error);
  document.querySelector<HTMLDivElement>("#message")!.textContent = "物理引擎初始化失败，请查看控制台";
});

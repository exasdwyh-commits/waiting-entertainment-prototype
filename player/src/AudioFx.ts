import type { GameEventType } from "@waiting/shared";

export class AudioFx {
  private context?: AudioContext;

  constructor() {
    const unlock = () => {
      this.ensureContext()?.resume().catch(() => undefined);
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });
  }

  play(type: GameEventType, importance = 0.5) {
    const context = this.ensureContext();
    if (!context || context.state !== "running") return;

    const strength = Math.max(0.2, Math.min(1, importance));

    if (type === "win") {
      this.tone(523, 659, 0.14, 0.08);
      this.tone(659, 784, 0.14, 0.22);
      this.tone(784, 1047, 0.22, 0.36);
      return;
    }

    if (type === "edge_save") {
      this.tone(330, 740, 0.16, 0, 0.055);
      return;
    }

    if (type === "final_elimination") {
      this.tone(150, 48, 0.34, 0, 0.085);
      this.tone(290, 95, 0.22, 0.04, 0.04);
      return;
    }

    if (type === "big_fall") {
      this.tone(120, 52, 0.2, 0, 0.055);
      return;
    }

    this.tone(150 + strength * 45, 80, 0.075, 0, 0.025 + strength * 0.025);
  }

  private ensureContext() {
    if (this.context) return this.context;

    const Ctor = window.AudioContext;
    if (!Ctor) return undefined;

    this.context = new Ctor();
    return this.context;
  }

  private tone(
    startHz: number,
    endHz: number,
    duration: number,
    delay = 0,
    volume = 0.04,
  ) {
    const context = this.context;
    if (!context) return;

    const start = context.currentTime + delay;
    const end = start + duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(startHz, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), end);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

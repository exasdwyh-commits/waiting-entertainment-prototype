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
      this.noiseBurst(0.72, 0.03, 0.026, 950);
      return;
    }

    if (type === "edge_save") {
      this.tone(330, 740, 0.16, 0, 0.055);
      this.noiseBurst(0.18, 0, 0.012, 1_600);
      return;
    }

    if (type === "final_elimination") {
      this.tone(150, 48, 0.34, 0, 0.085);
      this.tone(290, 95, 0.22, 0.04, 0.04);
      this.noiseBurst(0.62, 0.02, 0.04, 760);
      return;
    }

    if (type === "big_fall") {
      this.tone(120, 52, 0.2, 0, 0.055);
      this.noiseBurst(0.34, 0, 0.024, 880);
      return;
    }

    if (type === "toss") {
      this.tone(260, 72, 0.2, 0, 0.07);
      this.tone(520, 145, 0.12, 0.025, 0.03);
      this.noiseBurst(0.24, 0, 0.032, 1_100);
      return;
    }

    if (type === "heavy_hit") {
      this.tone(190, 58, 0.16, 0, 0.065);
      this.tone(340, 96, 0.11, 0.018, 0.032);
      this.noiseBurst(0.18, 0, 0.036, 1_250);
      return;
    }

    if (type === "dropkick_hit") {
      this.tone(230, 52, 0.2, 0, 0.075);
      this.tone(460, 88, 0.13, 0.015, 0.035);
      this.noiseBurst(0.22, 0, 0.042, 1_350);
      return;
    }

    if (type === "headbutt_hit") {
      this.tone(205, 64, 0.15, 0, 0.062);
      this.noiseBurst(0.13, 0, 0.028, 1_500);
      return;
    }

    if (type === "kick_hit") {
      this.tone(285, 92, 0.1, 0, 0.045);
      this.noiseBurst(0.09, 0, 0.018, 1_850);
      return;
    }

    if (type === "ko") {
      this.tone(170, 42, 0.28, 0, 0.075);
      this.tone(540, 180, 0.12, 0.045, 0.025);
      return;
    }

    if (type === "struggle_break") {
      this.tone(260, 620, 0.12, 0, 0.04);
      this.noiseBurst(0.08, 0, 0.014, 2_000);
      return;
    }

    if (type === "punch_hit" || type === "push_hit") {
      this.tone(250, 110, 0.085, 0, 0.035);
      this.noiseBurst(0.075, 0, 0.012, 2_200);
      return;
    }

    if (type === "grab") {
      this.tone(360, 240, 0.07, 0, 0.02);
      return;
    }

    this.tone(150 + strength * 45, 80, 0.075, 0, 0.025 + strength * 0.025);
    if (strength > 0.72) {
      this.noiseBurst(0.09, 0, 0.01 + strength * 0.008, 1_900);
    }
  }

  private ensureContext() {
    if (this.context) return this.context;

    const Ctor = window.AudioContext;
    if (!Ctor) return undefined;

    this.context = new Ctor();
    return this.context;
  }

  private noiseBurst(
    duration: number,
    delay: number,
    volume: number,
    cutoffHz: number,
  ) {
    const context = this.context;
    if (!context) return;

    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      const envelope = Math.pow(1 - index / length, 0.65);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    const end = start + duration;

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoffHz, start);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(180, cutoffHz * 0.55),
      end,
    );

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start(start);
    source.stop(end + 0.02);
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

// Procedural WebAudio sound effects + ambient loop generator.
export class AudioSystem {
  ctx: AudioContext | null = null;
  sfxEnabled = true;
  ambientEnabled = true;
  masterGain!: GainNode;
  ambientGain!: GainNode;
  sfxGain!: GainNode;
  ambientSource: AudioBufferSourceNode | null = null;
  started = false;

  ensureCtx() {
    if (!this.ctx) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.25;
      this.ambientGain.connect(this.masterGain);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.masterGain);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  start() {
    this.ensureCtx();
    if (this.started) return;
    this.started = true;
    this.startAmbient();
  }

  private startAmbient() {
    const ctx = this.ctx!;
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5; // brownish noise for wind/campus ambience
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    src.connect(filter);
    filter.connect(this.ambientGain);
    src.start();
    this.ambientSource = src;
    this.updateAmbientGain();
  }

  updateAmbientGain() {
    if (this.ambientGain) this.ambientGain.gain.value = this.ambientEnabled ? 0.18 : 0;
  }
  updateSfxGain() {
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxEnabled ? 0.9 : 0;
  }

  private blip(freq: number, duration: number, type: OscillatorType, gainPeak: number, glide = 0) {
    if (!this.ctx || !this.sfxEnabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (glide) osc.frequency.linearRampToValueAtTime(freq + glide, ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  private noiseHit(duration: number, gainPeak: number, filterFreq: number) {
    if (!this.ctx || !this.sfxEnabled) return;
    const ctx = this.ctx;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gainPeak;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  bump() {
    this.noiseHit(0.12, 0.5, 900);
    this.blip(180, 0.08, "sine", 0.3);
  }
  set() {
    this.noiseHit(0.08, 0.35, 1400);
    this.blip(420, 0.07, "sine", 0.25);
  }
  serve() {
    this.noiseHit(0.15, 0.55, 700);
    this.blip(140, 0.12, "sine", 0.3, -40);
  }
  spike() {
    this.noiseHit(0.18, 0.7, 500);
    this.blip(110, 0.14, "sawtooth", 0.25, -60);
  }
  net() {
    this.noiseHit(0.2, 0.3, 2200);
  }
  floor() {
    this.noiseHit(0.25, 0.6, 350);
  }
  whistle() {
    this.blip(1200, 0.35, "square", 0.18, -200);
  }
  footstep() {
    this.noiseHit(0.05, 0.12, 2500);
  }
  crowd() {
    this.noiseHit(0.6, 0.35, 1800);
  }
  point() {
    this.blip(660, 0.12, "triangle", 0.3, 220);
    setTimeout(() => this.blip(880, 0.15, "triangle", 0.25, 220), 90);
  }
  victory() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.25, "triangle", 0.3), i * 130);
    });
  }
}

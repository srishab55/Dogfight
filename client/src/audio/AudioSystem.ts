import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AirframeId } from '@dogfight/shared';
import { AUDIO_CONFIG, ENGINE_SOUND_CONFIG } from '../config/audio';
import { createNoiseBuffer, createSoundBank, type SoundBank, type SoundName } from './soundBank';

/** What the continuous sounds follow, once per frame. */
export interface AudioFrame {
  /** Where the camera (the listener) is, and which way it looks. Babylon's left-handed world frame. */
  readonly listenerPosition: Vector3;
  readonly listenerForward: Vector3;
  readonly listenerUp: Vector3;
  readonly airframe: AirframeId;
  /** Propeller speed 0-1, lagged like the visual's spin-up: drives the engine note. */
  readonly engineSpeed: number;
  /** Engine power actually being made, 0-1 (louder under load). */
  readonly throttle: number;
  readonly airspeed: number;
  readonly stallWarning: boolean;
  readonly pullUp: boolean;
  /** Crashed: everything continuous goes quiet. */
  readonly silent: boolean;
}

/** One voice of the engine: a sawtooth and a square an octave down, plus filtered noise for roughness. */
interface EngineVoice {
  readonly saw: OscillatorNode;
  readonly sub: OscillatorNode;
  readonly rough: BiquadFilterNode;
  readonly roughGain: GainNode;
  readonly gain: GainNode;
}

/** Slight detuning between the engines of a multi-engine aircraft: they beat against each other. */
const ENGINE_DETUNE = [1, 1.027, 0.981, 1.043];
const MUTED_KEY = 'dogfight.audioMuted';

/**
 * The game's sound, all synthesised with the Web Audio API.
 *
 * Browsers only allow audio to start after the user interacts with the
 * page, so nothing is created until the first key press or click; until
 * then every call is silently ignored.
 *
 * Graph: sources -> master gain -> compressor (keeps a dozen explosions
 * from clipping) -> speakers. Positioned sounds pass through a panner placed
 * in the world, so they come from where they happen and fade with distance.
 * Web Audio uses a right-handed frame, so world Z is flipped on the way in.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private bank: SoundBank | null = null;
  private engine: EngineVoice[] = [];
  private engineFilter: BiquadFilterNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private horn: GainNode | null = null;
  private pullUp: GainNode | null = null;
  private pullUpOsc: OscillatorNode | null = null;
  private muted: boolean;
  private time = 0;
  private lastGunshot = -Infinity;
  private lastClick = -Infinity;
  private readonly analyserData = new Float32Array(1024);

  constructor() {
    this.muted = readMuted();
    window.addEventListener('keydown', this.unlock);
    window.addEventListener('pointerdown', this.unlock);
  }

  /** True once audio has started (after the first interaction). */
  get started(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Mutes or unmutes everything. Returns whether it's now muted; the choice is remembered. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTED_KEY, this.muted ? '1' : '0');
    } catch {
      // Private browsing or blocked storage: the choice just isn't remembered.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : AUDIO_CONFIG.masterVolume, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** Overall output level right now (RMS, 0-1): for the debug overlay and tests. */
  level(): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.analyserData);
    let sum = 0;
    for (const v of this.analyserData) sum += v * v;
    return Math.sqrt(sum / this.analyserData.length);
  }

  /** Continuous sounds (engine, wind, warnings) and the listener, once per frame. */
  update(deltaSeconds: number, frame: AudioFrame): void {
    this.time += deltaSeconds;
    const ctx = this.ctx;
    if (!ctx || !this.engineFilter || !this.windFilter || !this.windGain || !this.horn || !this.pullUp || !this.pullUpOsc) return;
    const now = ctx.currentTime;
    const listener = ctx.listener;
    const p = frame.listenerPosition;
    const f = frame.listenerForward;
    const u = frame.listenerUp;
    if (listener.positionX) {
      listener.positionX.setTargetAtTime(p.x, now, 0.02);
      listener.positionY.setTargetAtTime(p.y, now, 0.02);
      listener.positionZ.setTargetAtTime(-p.z, now, 0.02);
      listener.forwardX.setTargetAtTime(f.x, now, 0.02);
      listener.forwardY.setTargetAtTime(f.y, now, 0.02);
      listener.forwardZ.setTargetAtTime(-f.z, now, 0.02);
      listener.upX.setTargetAtTime(u.x, now, 0.02);
      listener.upY.setTargetAtTime(u.y, now, 0.02);
      listener.upZ.setTargetAtTime(-u.z, now, 0.02);
    } else {
      // Older Safari: the deprecated setters.
      listener.setPosition(p.x, p.y, -p.z);
      listener.setOrientation(f.x, f.y, -f.z, u.x, u.y, -u.z);
    }

    // Engine: pitch follows the propeller, loudness the power being made.
    const character = ENGINE_SOUND_CONFIG[frame.airframe];
    const speed = frame.silent ? 0 : Math.max(0, Math.min(1, frame.engineSpeed));
    const running = speed > 0.02;
    const hz = character.idleHz + (character.fullHz - character.idleHz) * speed;
    const level = running ? AUDIO_CONFIG.engineVolume * (0.35 + 0.65 * Math.max(speed * 0.6, frame.throttle)) : 0;
    this.engine.forEach((voice, i) => {
      const on = i < character.engines;
      const voiceHz = hz * (ENGINE_DETUNE[i] ?? 1);
      voice.saw.frequency.setTargetAtTime(voiceHz, now, 0.08);
      voice.sub.frequency.setTargetAtTime(voiceHz / 2, now, 0.08);
      voice.rough.frequency.setTargetAtTime(voiceHz * 3, now, 0.08);
      voice.roughGain.gain.setTargetAtTime(character.roughness * 0.8, now, 0.1);
      voice.gain.gain.setTargetAtTime(on ? level / Math.sqrt(character.engines) : 0, now, 0.12);
    });
    this.engineFilter.frequency.setTargetAtTime(250 + 2_200 * speed, now, 0.1);

    // Wind rises with the square of airspeed past a threshold, brightening as it does.
    const w = AUDIO_CONFIG.wind;
    const windAmount = frame.silent ? 0 : Math.max(0, Math.min(1, (frame.airspeed - w.startSpeed) / (w.fullSpeed - w.startSpeed)));
    this.windGain.gain.setTargetAtTime(w.volume * windAmount * windAmount, now, 0.15);
    this.windFilter.frequency.setTargetAtTime(250 + 9 * frame.airspeed, now, 0.15);

    // Stall horn: a pulsing tone while the stall warning is on.
    const hornOn = frame.stallWarning && !frame.silent && Math.sin(2 * Math.PI * AUDIO_CONFIG.stallHorn.pulseHz * this.time) > -0.2;
    this.horn.gain.setTargetAtTime(hornOn ? AUDIO_CONFIG.stallHorn.volume : 0, now, 0.01);
    // Pull up: alternating high-low beeps.
    const beep = Math.floor(this.time / AUDIO_CONFIG.pullUp.beepSeconds);
    const pullUpOn = frame.pullUp && !frame.silent && beep % 4 !== 3;
    this.pullUpOsc.frequency.setValueAtTime(AUDIO_CONFIG.pullUp.frequencies[beep % 2] ?? 880, now);
    this.pullUp.gain.setTargetAtTime(pullUpOn ? AUDIO_CONFIG.pullUp.volume : 0, now, 0.01);
  }

  /** Your own guns: `rounds` fired this frame, thinned to a rate the ear can follow. */
  gunfire(rounds: number): void {
    if (rounds <= 0) return;
    const interval = 1 / AUDIO_CONFIG.maxGunshotsPerSecond;
    if (this.time - this.lastGunshot < interval) return;
    this.lastGunshot = this.time;
    this.play('gunshot', AUDIO_CONFIG.gunVolume, 0.92 + Math.random() * 0.16);
  }

  /** The trigger pulled with no ammunition left. */
  dryFire(): void {
    if (this.time - this.lastClick < 0.15) return;
    this.lastClick = this.time;
    this.play('click', 0.3);
  }

  /** A sound with no position: in the cockpit with you. */
  play(name: SoundName, gain = 1, rate = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.bank) return;
    const source = ctx.createBufferSource();
    source.buffer = this.bank[name];
    source.playbackRate.value = rate;
    const volume = ctx.createGain();
    volume.gain.value = gain;
    source.connect(volume).connect(this.master);
    source.start();
  }

  /**
   * A sound at a world position: panned to where it is, quieter with
   * distance, and delayed by the time sound takes to get to you.
   */
  playAt(name: SoundName, position: { x: number; y: number; z: number }, listener: Vector3, gain = 1, rate = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.bank) return;
    const distance = Math.hypot(position.x - listener.x, position.y - listener.y, position.z - listener.z);
    if (distance > AUDIO_CONFIG.maxDistance) return;
    const source = ctx.createBufferSource();
    source.buffer = this.bank[name];
    source.playbackRate.value = rate;
    const volume = ctx.createGain();
    volume.gain.value = gain;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = AUDIO_CONFIG.referenceDistance;
    panner.maxDistance = AUDIO_CONFIG.maxDistance;
    panner.rolloffFactor = 1;
    if (panner.positionX) {
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = -position.z;
    } else {
      panner.setPosition(position.x, position.y, -position.z);
    }
    source.connect(volume).connect(panner).connect(this.master);
    source.start(ctx.currentTime + distance / AUDIO_CONFIG.speedOfSound);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.unlock);
    window.removeEventListener('pointerdown', this.unlock);
    void this.ctx?.close();
    this.ctx = null;
  }

  /** First interaction: create the audio graph (browsers block audio before this). */
  private readonly unlock = (): void => {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return; // no Web Audio: play silently
    }
    this.ctx = ctx;
    void ctx.resume();
    this.bank = createSoundBank(ctx);
    const noise = createNoiseBuffer(ctx);

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : AUDIO_CONFIG.masterVolume;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    master.connect(compressor).connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    compressor.connect(this.analyser);
    this.master = master;

    const loop = () => {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      source.start(0, Math.random() * 1.9);
      return source;
    };

    // Engine voices, through one low-pass "muffler".
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 0.8;
    this.engineFilter.connect(master);
    this.engine = ENGINE_DETUNE.map(() => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.engineFilter as BiquadFilterNode);
      const saw = ctx.createOscillator();
      saw.type = 'sawtooth';
      const sub = ctx.createOscillator();
      sub.type = 'square';
      const subGain = ctx.createGain();
      subGain.gain.value = 0.6;
      saw.connect(gain);
      sub.connect(subGain).connect(gain);
      const rough = ctx.createBiquadFilter();
      rough.type = 'bandpass';
      rough.Q.value = 1.5;
      const roughGain = ctx.createGain();
      loop().connect(rough).connect(roughGain).connect(gain);
      saw.start();
      sub.start();
      return { saw, sub, rough, roughGain, gain };
    });

    // Wind.
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    loop().connect(this.windFilter).connect(this.windGain).connect(master);

    // Warnings.
    const tone = (type: OscillatorType, hz: number): [OscillatorNode, GainNode] => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(master);
      osc.start();
      return [osc, gain];
    };
    this.horn = tone('square', AUDIO_CONFIG.stallHorn.frequency)[1];
    [this.pullUpOsc, this.pullUp] = tone('triangle', AUDIO_CONFIG.pullUp.frequencies[0]);
  };
}

function readMuted(): boolean {
  try {
    const saved = localStorage.getItem(MUTED_KEY);
    return saved === null ? AUDIO_CONFIG.startMuted : saved === '1';
  } catch {
    return AUDIO_CONFIG.startMuted;
  }
}

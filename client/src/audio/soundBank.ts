/*
 * Procedurally generated sound effects: short AudioBuffers built sample by
 * sample from noise, decaying sine waves and simple filters. Generated once
 * when audio starts; played many times.
 */

export type SoundName = 'gunshot' | 'cannon' | 'explosion' | 'clank' | 'thud' | 'chirp' | 'whoosh' | 'cable' | 'click';

export type SoundBank = Readonly<Record<SoundName, AudioBuffer>>;

export function createSoundBank(ctx: BaseAudioContext): SoundBank {
  const rate = ctx.sampleRate;
  let seed = 7;
  const noise = () => {
    seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
    return (seed / 4_294_967_296) * 2 - 1;
  };
  /** A mono buffer `seconds` long, filled by `sample(t, i)`, then normalised to `peak`. */
  const make = (seconds: number, peak: number, sample: (t: number) => number): AudioBuffer => {
    const length = Math.ceil(seconds * rate);
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    let max = 1e-6;
    for (let i = 0; i < length; i++) {
      const value = sample(i / rate);
      data[i] = value;
      max = Math.max(max, Math.abs(value));
    }
    const scale = peak / max;
    for (let i = 0; i < length; i++) data[i] = (data[i] ?? 0) * scale;
    return buffer;
  };
  /** One-pole low-pass filter state, for shaping noise. */
  const lowpass = () => {
    let y = 0;
    return (x: number, cutoffHz: number) => {
      const a = 1 - Math.exp((-2 * Math.PI * cutoffHz) / rate);
      y += a * (x - y);
      return y;
    };
  };
  const sine = (t: number, hz: number) => Math.sin(2 * Math.PI * hz * t);

  const gunLp = lowpass();
  const cannonLp = lowpass();
  const explosionLp = lowpass();
  const thudLp = lowpass();
  const chirpLp = lowpass();
  const chirpHp = lowpass();
  const whooshLp = lowpass();
  const whooshHp = lowpass();

  return {
    // Machine gun: a sharp crack over a short thump.
    gunshot: make(0.14, 0.9, (t) => gunLp(noise(), 5_000) * Math.exp(-t / 0.014) + 0.7 * sine(t, 150) * Math.exp(-t / 0.03)),
    // 40 mm cannon: a deeper, rounder "pom".
    cannon: make(0.6, 0.9, (t) => cannonLp(noise(), 1_100) * Math.exp(-t / 0.07) + 0.9 * sine(t, 72 - 20 * t) * Math.exp(-t / 0.13)),
    // Explosion: a roar whose brightness dies away, a sub-bass punch, and crackle.
    explosion: make(2.6, 1, (t) => {
      const roar = explosionLp(noise(), 2_400 * Math.exp(-t / 0.45) + 120) * Math.min(1, t / 0.006) * Math.exp(-t / 0.7);
      const punch = 1.4 * sine(t, 46 - 12 * t) * Math.exp(-t / 0.35);
      const crackle = t < 1.2 && noise() > 0.995 ? noise() * Math.exp(-t / 0.5) : 0;
      return roar * 2.2 + punch + crackle;
    }),
    // Struck metal: inharmonic partials, as in a hit on the airframe.
    clank: make(0.4, 0.9, (t) => (0.5 * sine(t, 523) + 0.35 * sine(t, 1_347) + 0.25 * sine(t, 2_211)) * Math.exp(-t / 0.07) + noise() * Math.exp(-t / 0.004)),
    // Tyres meeting the runway.
    thud: make(0.45, 0.9, (t) => sine(t, 58) * Math.exp(-t / 0.09) + 0.6 * thudLp(noise(), 400) * Math.exp(-t / 0.05)),
    // Tyre chirp: a short band of hiss.
    chirp: make(0.22, 0.6, (t) => {
      const n = noise();
      return (chirpLp(n, 3_500) - chirpHp(n, 1_600)) * Math.sin(Math.min(1, t / 0.22) * Math.PI);
    }),
    // Catapult: a clunk, then a rising rush of air.
    whoosh: make(1.5, 0.9, (t) => {
      const n = noise();
      const band = whooshLp(n, 300 + 2_600 * Math.min(1, t / 1.1)) - whooshHp(n, 150 + 600 * t);
      return 1.2 * band * Math.sin(Math.min(1, t / 1.5) * Math.PI) + 0.8 * sine(t, 55) * Math.exp(-t / 0.08);
    }),
    // Arrestor wire: a clank and a cable singing down as it pays out.
    cable: make(1, 0.9, (t) => 0.6 * (sine(t, 410) + sine(t, 1_130)) * Math.exp(-t / 0.06) + 0.5 * sine(t, 900 * Math.exp(-t * 1.4)) * Math.exp(-t / 0.35)),
    // Dry click: the trigger with no ammunition.
    click: make(0.03, 0.5, (t) => noise() * Math.exp(-t / 0.003)),
  };
}

/** Two seconds of white noise, looped for wind and engine roughness. */
export function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 99;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
    data[i] = (seed / 4_294_967_296) * 2 - 1;
  }
  return buffer;
}

import type { Scene } from '@babylonjs/core/scene';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { ICanvasRenderingContext } from '@babylonjs/core/Engines/ICanvas';
import { GROUND_CONFIG, RUNWAY_VISUAL_CONFIG } from '../config/graphics';

/**
 * Textures painted at startup with the 2D canvas API, so the prototype needs
 * no image downloads. They are drawn once and then behave like any other
 * texture on the GPU.
 */

/**
 * Seamlessly tiling farmland: rectangular fields of varied greens and browns,
 * crop rows and hedgerows. At 400 m per tile it gives the ground enough detail
 * to show speed and altitude, which a flat colour would not.
 */
export function createFarmlandTexture(scene: Scene): DynamicTexture {
  const size = GROUND_CONFIG.textureResolution;
  const texture = new DynamicTexture('farmland-texture', { width: size, height: size }, scene, true);
  const ctx = texture.getContext();
  // Fixed seed: the same "random" farmland on every load and every machine.
  const random = createSeededRandom(1_942);

  const fields: Rect[] = [];
  splitIntoFields({ x: 0, y: 0, width: size, height: size }, 0, random, fields);

  for (const field of fields) {
    ctx.fillStyle = pick(GROUND_CONFIG.fieldColors, random);
    ctx.fillRect(field.x, field.y, field.width, field.height);
    drawCropRows(ctx, field, random);
  }

  // Per-pixel brightness noise so no field is a perfectly flat colour.
  addBrightnessNoise(ctx, size, size, 18, random);

  // Hedgerows along every field border. Borders on the tile edge are drawn
  // half-width, so two neighbouring tiles join into one full-width hedge.
  ctx.fillStyle = GROUND_CONFIG.hedgeColor;
  const hedge = Math.max(2, Math.round(size / 400));
  for (const field of fields) {
    ctx.fillRect(field.x, field.y, field.width, hedge / 2);
    ctx.fillRect(field.x, field.y + field.height - hedge / 2, field.width, hedge / 2);
    ctx.fillRect(field.x, field.y, hedge / 2, field.height);
    ctx.fillRect(field.x + field.width - hedge / 2, field.y, hedge / 2, field.height);
  }

  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  // Keeps the far ground sharp at low viewing angles instead of blurring to mush.
  texture.anisotropicFilteringLevel = 8;
  return texture;
}

/**
 * Asphalt runway with edge lines, centreline dashes and threshold "piano key"
 * markings. The texture is stretched over the whole runway (no tiling): its
 * long side runs along the runway, so `metresPerPixel` differs per axis.
 */
export function createRunwayTexture(scene: Scene, runwayLength: number, runwayWidth: number): DynamicTexture {
  const width = 256;
  const height = 4096;
  const texture = new DynamicTexture('runway-texture', { width, height }, scene, true);
  const ctx = texture.getContext();
  const random = createSeededRandom(7);
  const pxPerMetreAcross = width / runwayWidth;
  const pxPerMetreAlong = height / runwayLength;

  ctx.fillStyle = RUNWAY_VISUAL_CONFIG.asphaltColor;
  ctx.fillRect(0, 0, width, height);
  addBrightnessNoise(ctx, width, height, 10, random);
  ctx.fillStyle = RUNWAY_VISUAL_CONFIG.markingColor;

  // Edge lines, 0.9 m wide, 1 m in from each side.
  const edgeLine = 0.9 * pxPerMetreAcross;
  ctx.fillRect(1 * pxPerMetreAcross, 0, edgeLine, height);
  ctx.fillRect(width - 1 * pxPerMetreAcross - edgeLine, 0, edgeLine, height);

  // Centreline: 30 m dashes with 20 m gaps, kept clear of the threshold markings.
  const centreLineWidth = 0.9 * pxPerMetreAcross;
  const markingZone = 60 * pxPerMetreAlong;
  for (let y = markingZone; y < height - markingZone - 30 * pxPerMetreAlong; y += 50 * pxPerMetreAlong) {
    ctx.fillRect(width / 2 - centreLineWidth / 2, y, centreLineWidth, 30 * pxPerMetreAlong);
  }

  // Threshold "piano keys" at both ends: eight 1.8 m stripes, 30 m long.
  const stripeWidth = 1.8 * pxPerMetreAcross;
  const stripeLength = 30 * pxPerMetreAlong;
  const stripeStart = 6 * pxPerMetreAlong;
  for (let i = 0; i < 8; i++) {
    const offset = (i < 4 ? 4 + i * 3.6 : runwayWidth - 4 - (7 - i) * 3.6 - 1.8) * pxPerMetreAcross;
    ctx.fillRect(offset, stripeStart, stripeWidth, stripeLength);
    ctx.fillRect(offset, height - stripeStart - stripeLength, stripeWidth, stripeLength);
  }

  texture.update(false);
  texture.anisotropicFilteringLevel = 8;
  return texture;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Recursively splits a rectangle into field-sized plots, alternating cut direction. */
function splitIntoFields(rect: Rect, depth: number, random: () => number, out: Rect[]): void {
  const minimum = GROUND_CONFIG.textureResolution / 12;
  const canSplit = rect.width > minimum * 2 || rect.height > minimum * 2;
  if (depth >= 5 || !canSplit || (depth >= 3 && random() < 0.3)) {
    out.push(rect);
    return;
  }
  const splitVertically = rect.width === rect.height ? random() < 0.5 : rect.width > rect.height;
  const fraction = 0.3 + random() * 0.4;
  if (splitVertically) {
    const left = Math.round(rect.width * fraction);
    splitIntoFields({ ...rect, width: left }, depth + 1, random, out);
    splitIntoFields({ ...rect, x: rect.x + left, width: rect.width - left }, depth + 1, random, out);
  } else {
    const top = Math.round(rect.height * fraction);
    splitIntoFields({ ...rect, height: top }, depth + 1, random, out);
    splitIntoFields({ ...rect, y: rect.y + top, height: rect.height - top }, depth + 1, random, out);
  }
}

/** Faint parallel stripes, like ploughed or planted rows, in about half the fields. */
function drawCropRows(ctx: ICanvasRenderingContext, field: Rect, random: () => number): void {
  if (random() < 0.45) return;
  const alongX = random() < 0.5;
  const spacing = 3 + Math.floor(random() * 3);
  ctx.globalAlpha = 0.08 + random() * 0.07;
  ctx.fillStyle = random() < 0.5 ? '#2a3a18' : '#c8c088';
  if (alongX) {
    for (let y = field.y; y < field.y + field.height; y += spacing) ctx.fillRect(field.x, y, field.width, 1);
  } else {
    for (let x = field.x; x < field.x + field.width; x += spacing) ctx.fillRect(x, field.y, 1, field.height);
  }
  ctx.globalAlpha = 1;
}

/**
 * Shifts every pixel's brightness by a random amount in [-amplitude, +amplitude]
 * (0-255 scale). One pass over the raw pixels is far faster than drawing
 * thousands of tiny rectangles.
 */
function addBrightnessNoise(ctx: ICanvasRenderingContext, width: number, height: number, amplitude: number, random: () => number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const shift = (random() * 2 - 1) * amplitude;
    // Uint8ClampedArray clamps to 0-255 on write.
    pixels[i] = (pixels[i] ?? 0) + shift;
    pixels[i + 1] = (pixels[i + 1] ?? 0) + shift;
    pixels[i + 2] = (pixels[i + 2] ?? 0) + shift;
  }
  ctx.putImageData(image, 0, 0);
}

/** Small, fast deterministic PRNG (mulberry32), giving numbers in [0, 1). */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('Cannot pick from an empty list');
  return item;
}

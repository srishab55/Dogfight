/*
 * A soft white puff with a transparent edge, drawn on a canvas and returned
 * as a PNG data URL (no download). Clouds, smoke, flames and explosions all
 * use it as their sprite, tinted by each sprite's colour.
 */

/** A soft, slightly lumpy white blob with a transparent edge, as a PNG data URL. */
export function createPuffTextureUrl(seed = 5): string {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for the puff texture');
  const random = seededRandom(seed);
  // Several overlapping soft circles make a lumpier, more natural puff than one gradient.
  for (let i = 0; i < 14; i++) {
    const x = size / 2 + (random() - 0.5) * size * 0.35;
    const y = size / 2 + (random() - 0.5) * size * 0.3;
    const r = size * (0.22 + random() * 0.16);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  // Fade everything to fully transparent at the edge so no square outline shows.
  ctx.globalCompositeOperation = 'destination-in';
  const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  return canvas.toDataURL('image/png');
}


function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

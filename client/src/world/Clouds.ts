import type { Scene } from '@babylonjs/core/scene';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import '@babylonjs/core/Sprites/spriteSceneComponent';
import { CLOUD_CONFIG } from '../config/graphics';

/**
 * Cumulus clouds: each a cluster of soft, camera-facing puffs (sprites),
 * all drawn by one SpriteManager in one draw call. Lit from above, so puffs
 * near the base are tinted grey. Fog fades distant clouds into the haze.
 *
 * Flying into a cloud, nearby puffs fade out instead of covering the screen
 * with layers of transparent quads, which looks like flying through mist and
 * keeps GPU fill-rate in check.
 */
export class Clouds {
  private readonly manager: SpriteManager;
  private readonly puffs: Array<{ sprite: Sprite; baseAlpha: number }> = [];

  constructor(scene: Scene) {
    const config = CLOUD_CONFIG;
    const random = seededRandom(config.seed);
    const capacity = config.count * config.puffsMax;
    // The puff texture is drawn on a canvas and passed as a data: URL: no download.
    this.manager = new SpriteManager('clouds', createPuffTextureUrl(), capacity, 256, scene);
    this.manager.fogEnabled = true;
    this.manager.disableDepthWrite = true;
    this.manager.isPickable = false;

    const top = Color4.FromHexString(`${config.topColor}ff`);
    const base = Color4.FromHexString(`${config.baseColor}ff`);
    for (let c = 0; c < config.count; c++) {
      const cx = (random() - 0.5) * config.areaSize;
      const cz = (random() - 0.5) * config.areaSize;
      const baseY = lerp(config.baseAltitudeMin, config.baseAltitudeMax, random());
      const radius = lerp(config.clusterRadius[0], config.clusterRadius[1], random());
      const height = lerp(config.clusterHeight[0], config.clusterHeight[1], random());
      const puffCount = Math.round(lerp(config.puffsMin, config.puffsMax, random()));
      for (let p = 0; p < puffCount; p++) {
        // Puffs cluster towards the centre and pile up in the middle (a rough dome).
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * radius;
        const rise = random() * height * (1 - (0.6 * distance) / radius);
        const sprite = new Sprite(`cloud-${c}-${p}`, this.manager);
        sprite.position.set(cx + Math.cos(angle) * distance, baseY + rise, cz + Math.sin(angle) * distance * 0.7);
        sprite.size = lerp(config.puffSize[0], config.puffSize[1], random()) * (1 - (0.4 * distance) / radius);
        sprite.angle = random() * Math.PI * 2;
        // Shade by height within the cloud: grey base, white tops.
        const shade = height > 0 ? rise / height : 1;
        sprite.color = Color4.Lerp(base, top, Math.min(1, shade * 1.4));
        const baseAlpha = config.opacity * lerp(0.75, 1, random());
        sprite.color.a = baseAlpha;
        this.puffs.push({ sprite, baseAlpha });
      }
    }
  }

  /** Fades puffs that are very close to the camera. */
  update(cameraPosition: Vector3): void {
    const { fadeStart, fadeEnd } = CLOUD_CONFIG;
    for (const puff of this.puffs) {
      const p = puff.sprite.position;
      // Distance to the puff's edge, not its centre.
      const distance = Math.hypot(p.x - cameraPosition.x, p.y - cameraPosition.y, p.z - cameraPosition.z) - puff.sprite.size * 0.4;
      const fade = Math.max(0, Math.min(1, (distance - fadeEnd) / (fadeStart - fadeEnd)));
      puff.sprite.color.a = puff.baseAlpha * fade;
      puff.sprite.isVisible = fade > 0.01;
    }
  }

  dispose(): void {
    this.manager.dispose();
  }
}

/** A soft, slightly lumpy white blob with a transparent edge, as a PNG data URL. */
function createPuffTextureUrl(): string {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for cloud texture');
  const random = seededRandom(5);
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

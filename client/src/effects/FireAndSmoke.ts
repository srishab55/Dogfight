import type { Scene } from '@babylonjs/core/scene';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Constants } from '@babylonjs/core/Engines/constants';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import '@babylonjs/core/Sprites/spriteSceneComponent';
import { FIRE_AND_SMOKE_CONFIG } from '../config/combatVisuals';
import { createPuffTextureUrl } from '../rendering/puffTexture';

interface Particle {
  sprite: Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  startSize: number;
  endSize: number;
  /** Starting opacity; fades to 0. */
  alpha: number;
  active: boolean;
}

/** Cheap deterministic-enough jitter for effects (visual only). */
let seed = 12345;
function random(): number {
  seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
  return seed / 4_294_967_296;
}

/**
 * Smoke, flames and explosions, as soft sprites from two pools: smoke
 * (alpha-blended, fogged) and fire (added on top, brighter than white so
 * the bloom makes it glow). Two draw calls however much is burning.
 *
 * Particles are recycled, never created during play: a fixed pool, and the
 * oldest is reused when the pool is full.
 */
export class FireAndSmoke {
  private readonly smoke: Particle[] = [];
  private readonly fire: Particle[] = [];
  private nextSmoke = 0;
  private nextFire = 0;

  constructor(scene: Scene) {
    const config = FIRE_AND_SMOKE_CONFIG;
    const texture = createPuffTextureUrl(11);
    const smokeManager = new SpriteManager('smoke', texture, config.smokeCapacity, 256, scene);
    smokeManager.fogEnabled = true;
    smokeManager.disableDepthWrite = true;
    smokeManager.isPickable = false;
    const fireManager = new SpriteManager('fire', texture, config.fireCapacity, 256, scene);
    fireManager.fogEnabled = true;
    fireManager.disableDepthWrite = true;
    fireManager.isPickable = false;
    fireManager.blendMode = Constants.ALPHA_ADD;
    // Drawn after the smoke, so flames glow through their own smoke.
    fireManager.renderingGroupId = 0;
    const make = (manager: SpriteManager, count: number, into: Particle[], prefix: string) => {
      for (let i = 0; i < count; i++) {
        const sprite = new Sprite(`${prefix}-${i}`, manager);
        sprite.isVisible = false;
        sprite.color = new Color4(1, 1, 1, 0);
        into.push({ sprite, age: 0, life: 1, vx: 0, vy: 0, vz: 0, startSize: 1, endSize: 1, alpha: 1, active: false });
      }
    };
    make(smokeManager, config.smokeCapacity, this.smoke, 'smoke');
    make(fireManager, config.fireCapacity, this.fire, 'fire');
  }

  /**
   * One puff of smoke. `darkness` 0 = light grey (engine damage), 1 = black
   * (burning fuel); `scale` multiplies its size.
   */
  smokePuff(x: number, y: number, z: number, darkness: number, scale = 1, life: number = FIRE_AND_SMOKE_CONFIG.smoke.life): void {
    const c = FIRE_AND_SMOKE_CONFIG;
    const p = this.smoke[this.nextSmoke];
    this.nextSmoke = (this.nextSmoke + 1) % this.smoke.length;
    if (!p) return;
    const shade = c.lightSmokeShade + (c.darkSmokeShade - c.lightSmokeShade) * darkness;
    p.sprite.color.set(shade, shade * 0.97, shade * 0.94, 0);
    this.launch(p, x, y, z, life * (0.8 + 0.4 * random()), c.smoke.startSize * scale, c.smoke.endSize * scale, 0.55 + 0.3 * darkness, c.smoke.drift, c.smoke.rise);
  }

  /** One lick of flame. */
  flame(x: number, y: number, z: number, scale = 1): void {
    const c = FIRE_AND_SMOKE_CONFIG;
    const p = this.fire[this.nextFire];
    this.nextFire = (this.nextFire + 1) % this.fire.length;
    if (!p) return;
    const [r, g, b] = c.flameColor;
    const heat = 0.75 + 0.5 * random();
    p.sprite.color.set(r * heat, g * heat, b, 0);
    this.launch(p, x, y, z, c.flame.life * (0.6 + 0.8 * random()), c.flame.startSize * scale, c.flame.endSize * scale, 0.9, 1.2 * scale, c.flame.rise);
  }

  /** A fireball, flames flung outwards, and a cloud of black smoke. `scale` 1 = an AA gun; 3 = an aircraft's fuel; 6 = a carrier's magazine. */
  explosion(x: number, y: number, z: number, scale = 1): void {
    const e = FIRE_AND_SMOKE_CONFIG.explosion;
    const p = this.fire[this.nextFire];
    this.nextFire = (this.nextFire + 1) % this.fire.length;
    if (p) {
      p.sprite.color.set(4, 2.4, 1, 0);
      this.launch(p, x, y, z, e.life, e.fireballSize * scale * 0.3, e.fireballSize * scale, 1, 0, 2);
    }
    for (let i = 0; i < e.flames; i++) {
      const q = this.fire[this.nextFire];
      this.nextFire = (this.nextFire + 1) % this.fire.length;
      if (!q) continue;
      const [r, g, b] = FIRE_AND_SMOKE_CONFIG.flameColor;
      q.sprite.color.set(r, g, b, 0);
      this.launch(q, x, y, z, e.life * (0.6 + random() * 0.8), 4 * scale, 1.5 * scale, 1, 14 * scale, 8 * scale);
    }
    for (let i = 0; i < e.puffs; i++) this.smokePuff(x + (random() - 0.5) * 4 * scale, y + random() * 3 * scale, z + (random() - 0.5) * 4 * scale, 1, 1.4 * scale, 9);
  }

  update(deltaSeconds: number, camera: Vector3): void {
    this.advance(this.smoke, deltaSeconds, camera);
    this.advance(this.fire, deltaSeconds, camera);
  }

  private launch(p: Particle, x: number, y: number, z: number, life: number, startSize: number, endSize: number, alpha: number, spread: number, rise: number): void {
    p.active = true;
    p.age = 0;
    p.life = life;
    p.startSize = startSize;
    p.endSize = endSize;
    p.alpha = alpha;
    p.vx = (random() - 0.5) * 2 * spread;
    p.vy = rise * (0.7 + 0.6 * random()) + (random() - 0.5) * spread;
    p.vz = (random() - 0.5) * 2 * spread;
    p.sprite.position.set(x, y, z);
    p.sprite.angle = random() * Math.PI * 2;
    p.sprite.size = startSize;
    p.sprite.isVisible = true;
  }

  private advance(particles: Particle[], dt: number, camera: Vector3): void {
    for (const p of particles) {
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.active = false;
        p.sprite.isVisible = false;
        continue;
      }
      // Drifting puffs slow down (air drag) but keep rising.
      const drag = Math.exp(-1.5 * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.size = p.startSize + (p.endSize - p.startSize) * Math.sqrt(t);
      // Fade in quickly, out slowly; also fade puffs right at the camera so they don't fill the screen.
      const near = Math.min(1, Math.hypot(p.sprite.position.x - camera.x, p.sprite.position.y - camera.y, p.sprite.position.z - camera.z) / (p.sprite.size * 1.5));
      p.sprite.color.a = p.alpha * Math.min(1, t * 8) * (1 - t) * near;
    }
  }
}

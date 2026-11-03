import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { Scene } from '@babylonjs/core/scene';
import { hexToColor3 } from './materials';

/**
 * Small celebrations: a shower of sparks when a door opens, fireworks over the stage at the end.
 * One soft round sprite, drawn once, serves every system; each system runs its burst and disposes itself.
 */

let spark: DynamicTexture | null = null;

function sparkTexture(scene: Scene): DynamicTexture {
  if (spark && spark.getScene() === scene) return spark;
  const size = 64;
  spark = new DynamicTexture('spark', size, scene, false);
  spark.hasAlpha = true;
  const g = spark.getContext() as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  spark.update();
  return spark;
}

export interface BurstOptions {
  /** Particles in the burst. Default 120. */
  count?: number;
  /** Seconds the particles live. Default 1.2. */
  life?: number;
  /** World units per second outward. Default 3. */
  speed?: number;
  /** Downward pull. Default 4 (sparks fall); negative rises. */
  gravity?: number;
  /** Extra direction added to every particle, e.g. up for a door's rising shower. */
  lift?: Vector3;
  /** Size of a particle. Default 0.14. */
  size?: number;
  /** A second colour for a two-tone burst. */
  color2?: number;
}

/** A burst of sparks at `at` in the colour `hex`, over and gone within a couple of seconds. */
export function burst(scene: Scene, at: Vector3, hex: number, opts: BurstOptions = {}): void {
  const count = opts.count ?? 120;
  const life = opts.life ?? 1.2;
  const ps = new ParticleSystem('burst', count, scene);
  ps.particleTexture = sparkTexture(scene);
  ps.emitter = at.clone();
  ps.minEmitBox = new Vector3(-0.05, -0.05, -0.05);
  ps.maxEmitBox = new Vector3(0.05, 0.05, 0.05);
  const c1 = hexToColor3(hex);
  const c2 = hexToColor3(opts.color2 ?? hex);
  ps.color1 = new Color4(c1.r, c1.g, c1.b, 1);
  ps.color2 = new Color4(c2.r, c2.g, c2.b, 1);
  ps.colorDead = new Color4(c1.r, c1.g, c1.b, 0);
  ps.minSize = (opts.size ?? 0.14) * 0.6;
  ps.maxSize = (opts.size ?? 0.14) * 1.3;
  ps.minLifeTime = life * 0.6;
  ps.maxLifeTime = life;
  ps.emitRate = 0;
  ps.manualEmitCount = count;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.gravity = new Vector3(0, -(opts.gravity ?? 4), 0);
  const lift = opts.lift ?? Vector3.Zero();
  const speed = opts.speed ?? 3;
  ps.direction1 = new Vector3(-1, -1, -1).scaleInPlace(speed).addInPlace(lift);
  ps.direction2 = new Vector3(1, 1, 1).scaleInPlace(speed).addInPlace(lift);
  ps.minEmitPower = 0.6;
  ps.maxEmitPower = 1.2;
  ps.updateSpeed = 1 / 60;
  ps.disposeOnStop = true;
  ps.targetStopDuration = life + 0.3;
  ps.start();
}

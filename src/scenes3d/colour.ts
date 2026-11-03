import { Constants } from '@babylonjs/core/Engines/constants';
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Nullable } from '@babylonjs/core/types';

/**
 * The grey-to-colour mechanic. Every tile has a "life" from 0 (the world as the player finds
 * it, drained of colour) to 1 (in colour). The world keeps one small texture, one texel per
 * tile, and every world material samples it by world position in the fragment shader, mixing
 * the lit colour with a cool grey. Colour spreads outward from each opened door as the life
 * values bloom (see World.updateColour).
 */
export class LifeMap {
  readonly texture: RawTexture;
  private data: Uint8Array;
  private dirty = true;

  constructor(
    readonly w: number,
    readonly h: number,
    scene: Scene,
  ) {
    this.data = new Uint8Array(w * h);
    this.texture = new RawTexture(this.data, w, h, Constants.TEXTUREFORMAT_R, scene, false, false, Texture.BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this.texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.texture.name = 'life';
  }

  /** Copy per-tile life (row-major, 0..1) into the texture. */
  upload(life: Float32Array): void {
    let changed = false;
    for (let i = 0; i < life.length; i++) {
      const v = Math.max(0, Math.min(255, Math.round(life[i] * 255)));
      if (this.data[i] !== v) {
        this.data[i] = v;
        changed = true;
      }
    }
    if (changed || this.dirty) {
      this.texture.update(this.data);
      this.dirty = false;
    }
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** Attached to each world material: mixes the final colour toward grey by the tile's life. */
export class LifePlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly map: LifeMap,
  ) {
    super(material, 'Life', 250, { LIFE: false });
    this._enable(true);
  }

  override prepareDefines(defines: MaterialDefines, _scene: Scene, _mesh: AbstractMesh): void {
    defines['LIFE'] = true;
  }

  override getClassName(): string {
    return 'LifePlugin';
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('lifeSampler');
  }

  override getUniforms(): { ubo?: Array<{ name: string; size: number; type: string }>; vertex?: string; fragment?: string } {
    return {
      ubo: [{ name: 'lifeSize', size: 2, type: 'vec2' }],
      fragment: `#ifdef LIFE
uniform vec2 lifeSize;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: Engine, _subMesh: SubMesh): void {
    uniformBuffer.updateFloat2('lifeSize', this.map.w, this.map.h);
    uniformBuffer.setTexture('lifeSampler', this.map.texture);
  }

  override getCustomCode(shaderType: string): Nullable<{ [pointName: string]: string }> {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef LIFE
uniform sampler2D lifeSampler;
#endif`,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef LIFE
{
  vec2 lifeUv = vPositionW.xz / lifeSize;
  float life = texture2D(lifeSampler, lifeUv).r;
  // A muted kingdom, not missing materials: the greys sit in a middle range, and the colour front
  // is dithered so it reads as weather rather than a cut.
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 grey = vec3(mix(lum, 0.5, 0.45)) * vec3(0.74, 0.76, 0.82);
  float dither = fract(sin(dot(floor(vPositionW.xz * 4.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  color.rgb = mix(grey, color.rgb, smoothstep(0.0, 1.0, life + dither * 0.35 * (1.0 - abs(life * 2.0 - 1.0))));
}
#endif`,
    };
  }
}

/** Gentle vertex ripple and a brighter crest for the water. */
export class WaterPlugin extends MaterialPluginBase {
  time = 0;

  constructor(material: Material) {
    super(material, 'Water', 240, { WATERWAVE: false });
    this._enable(true);
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines['WATERWAVE'] = true;
  }

  override getClassName(): string {
    return 'WaterPlugin';
  }

  override getUniforms(): { ubo?: Array<{ name: string; size: number; type: string }>; vertex?: string; fragment?: string } {
    return {
      ubo: [{ name: 'waterTime', size: 1, type: 'float' }],
      vertex: `#ifdef WATERWAVE
uniform float waterTime;
#endif`,
      fragment: `#ifdef WATERWAVE
uniform float waterTime;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat('waterTime', this.time);
  }

  override getCustomCode(shaderType: string): Nullable<{ [pointName: string]: string }> {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_UPDATE_POSITION: `#ifdef WATERWAVE
positionUpdated.y += 0.03 * sin(waterTime * 1.6 + positionUpdated.x * 2.1 + positionUpdated.z * 1.3) + 0.02 * sin(waterTime * 2.3 - positionUpdated.x * 1.1 + positionUpdated.z * 2.7);
#endif`,
      };
    }
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef WATERWAVE
{
  float crest = 0.5 + 0.5 * sin(waterTime * 1.4 + vPositionW.x * 3.0 + vPositionW.z * 2.2) * sin(waterTime * 0.9 - vPositionW.x * 1.7 + vPositionW.z * 3.1);
  color.rgb += vec3(0.10, 0.12, 0.14) * smoothstep(0.75, 1.0, crest);
}
#endif`,
    };
  }
}

/**
 * The sky dome: an equirectangular sky (rendered by scripts/blender/build_sky.py) looked up by
 * view direction, faded to the horizon colour below the horizon, and greyed by the area's life.
 */
export class SkyPlugin extends MaterialPluginBase {
  life = 0;
  horizon = [0.5, 0.5, 0.55];
  texture: Nullable<Texture> = null;

  constructor(material: Material) {
    super(material, 'Sky', 260, { SKYDOME: false });
    this._enable(true);
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines['SKYDOME'] = true;
  }

  override getClassName(): string {
    return 'SkyPlugin';
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('skySampler');
  }

  override getUniforms(): { ubo?: Array<{ name: string; size: number; type: string }>; vertex?: string; fragment?: string } {
    return {
      ubo: [
        { name: 'skyLife', size: 1, type: 'float' },
        { name: 'skyHorizon', size: 3, type: 'vec3' },
      ],
      fragment: `#ifdef SKYDOME
uniform float skyLife;
uniform vec3 skyHorizon;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat('skyLife', this.life);
    uniformBuffer.updateFloat3('skyHorizon', this.horizon[0], this.horizon[1], this.horizon[2]);
    if (this.texture) uniformBuffer.setTexture('skySampler', this.texture);
  }

  override getCustomCode(shaderType: string): Nullable<{ [pointName: string]: string }> {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef SKYDOME
uniform sampler2D skySampler;
#endif`,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `#ifdef SKYDOME
{
  // The dome is drawn at infinite distance, centred on the camera, so its world position is the view direction.
  vec3 dir = normalize(vPositionW);
  float u = atan(dir.x, -dir.z) / 6.2831853 + 0.5;
  // The camera rarely looks far up, so the band just above the horizon shows the sky from higher up.
  float el = asin(clamp(dir.y, -1.0, 1.0));
  float v = 0.5 - sign(el) * pow(abs(el) / 1.5707963, 0.45) * 0.5;
  vec3 sky = texture2D(skySampler, vec2(u, v)).rgb;
  float below = smoothstep(0.02, -0.08, dir.y);
  sky = mix(sky, skyHorizon, below);
  float lum = dot(sky, vec3(0.299, 0.587, 0.114));
  vec3 grey = vec3(mix(lum, 0.55, 0.5)) * vec3(0.74, 0.76, 0.82);
  color.rgb = mix(grey, sky, smoothstep(0.0, 1.0, skyLife));
}
#endif`,
    };
  }
}

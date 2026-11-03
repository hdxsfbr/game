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
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 grey = vec3(lum) * vec3(0.72, 0.74, 0.80);
  color.rgb = mix(grey, color.rgb, smoothstep(0.0, 1.0, life));
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

import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import { SkyPlugin } from './colour';

/**
 * The sky: an inverted sphere showing the area's rendered sky (public/sky/<area>.jpg), faded to
 * the horizon colour below the horizon and greyed while the area is still silent. Without the
 * picture it falls back to a vertex gradient. It sits at infinite distance and ignores fog.
 */
export class SkyDome {
  readonly mesh: Mesh;
  private ys: Float32Array;
  private lastKey = '';
  private plugin: SkyPlugin | null = null;

  constructor(scene: Scene, areaId?: string) {
    this.mesh = CreateSphere('sky', { diameter: 200, segments: 12, sideOrientation: 1 }, scene);
    this.mesh.infiniteDistance = true;
    this.mesh.applyFog = false;
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = false;
    const mat = new StandardMaterial('sky', scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.backFaceCulling = false;
    mat.fogEnabled = false;
    this.mesh.material = mat;
    if (areaId) {
      const tex = new Texture(`sky/${areaId}.jpg`, scene, true, false);
      this.plugin = new SkyPlugin(mat);
      this.plugin.texture = tex;
    }
    const pos = this.mesh.getVerticesData(VertexBuffer.PositionKind)!;
    this.ys = new Float32Array(pos.length / 3);
    for (let i = 0; i < this.ys.length; i++) this.ys[i] = pos[i * 3 + 1] / 100; // -1..1
    this.mesh.setVerticesData(VertexBuffer.ColorKind, new Float32Array(this.ys.length * 4), true);
    this.setColours(new Color3(0.3, 0.3, 0.35), new Color3(0.5, 0.5, 0.55));
  }

  /** Colour the dome: `zenith` straight up, `horizon` at eye level, darker below. */
  setColours(zenith: Color3, horizon: Color3): void {
    if (this.plugin) this.plugin.horizon = [horizon.r, horizon.g, horizon.b];
    const key = `${zenith.toHexString()}${horizon.toHexString()}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const cols = new Float32Array(this.ys.length * 4);
    const below = horizon.scale(0.8);
    for (let i = 0; i < this.ys.length; i++) {
      const y = this.ys[i];
      let c: Color3;
      if (y >= 0) {
        const t = Math.pow(Math.min(1, y), 0.6);
        c = Color3.Lerp(horizon, zenith, t);
      } else c = Color3.Lerp(horizon, below, Math.min(1, -y * 3));
      cols[i * 4] = c.r;
      cols[i * 4 + 1] = c.g;
      cols[i * 4 + 2] = c.b;
      cols[i * 4 + 3] = 1;
    }
    this.mesh.updateVerticesData(VertexBuffer.ColorKind, cols);
  }

  /** How much of the area's colour has returned, 0..1. */
  setLife(life: number): void {
    if (this.plugin) this.plugin.life = life;
  }
}

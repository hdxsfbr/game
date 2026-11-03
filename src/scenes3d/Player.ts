import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { toStandard } from './materials';
import { Rig } from './Rig';

export type Facing = 'north' | 'south' | 'east' | 'west';

const TRIPO_SCALE = 1.3;
const TRIPO_FACE = Math.PI;

/**
 * The player: a node at the feet, driven in tile units. Until the Tripo character arrives this is
 * the Blender mannequin with a procedural walk on its limb nodes (see scripts/blender/build_mannequin.py).
 */
export class Player {
  readonly root: TransformNode;
  readonly meshes: AbstractMesh[] = [];
  x = 0;
  z = 0;
  private yaw = Math.PI;
  private targetYaw = Math.PI;
  private phase = 0;
  private moving = false;
  private blend = 0;
  rig: Rig | null = null;
  /** Yaw to add so the model's front faces -Z like the mannequin. */
  private faceOffset = 0;
  private limbs: Partial<Record<'Hips' | 'Torso' | 'Head' | 'ArmL' | 'ArmR' | 'LegL' | 'LegR', TransformNode>> = {};
  private rest = new Map<TransformNode, Vector3>();

  private constructor(scene: Scene) {
    this.root = new TransformNode('player', scene);
  }

  static async load(scene: Scene, matCache: Map<Material, StandardMaterial>): Promise<Player> {
    const p = new Player(scene);
    // The Tripo singer (rigged, no clips, driven by Rig); the Blender mannequin if it is missing.
    let container: Awaited<ReturnType<typeof LoadAssetContainerAsync>> | null = null;
    try {
      container = await LoadAssetContainerAsync('character/listening-kingdom-singer.glb', scene);
    } catch {
      container = null;
    }
    const tripo = !!container;
    if (!container) container = await LoadAssetContainerAsync('character/mannequin.glb', scene);
    container.addAllToScene();
    const top = container.rootNodes[0] as TransformNode;
    top.parent = p.root;
    for (const m of container.meshes) {
      toStandard(m, scene, matCache);
      m.isPickable = false;
      p.meshes.push(m);
    }
    if (tripo) {
      // About a tile tall, facing the way the mannequin does.
      top.scaling.setAll(TRIPO_SCALE);
      p.faceOffset = TRIPO_FACE;
      p.rig = new Rig(scene);
      if (!p.rig.ok) p.rig = null;
    }
    for (const n of container.transformNodes) {
      const name = n.name as keyof typeof p.limbs;
      if (name in { Hips: 1, Torso: 1, Head: 1, ArmL: 1, ArmR: 1, LegL: 1, LegR: 1 }) {
        n.rotationQuaternion = null;
        p.limbs[name] = n;
        p.rest.set(n, n.position.clone());
      }
    }
    return p;
  }

  setPosition(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.root.position.set(x, 0, z);
  }

  /** Point the model along (dx, dz). The mannequin faces -Z (north) at rest. */
  face(dx: number, dz: number): void {
    if (dx === 0 && dz === 0) return;
    this.targetYaw = Math.atan2(-dx, -dz);
  }

  get facing(): Facing {
    const a = this.targetYaw;
    const q = Math.round(a / (Math.PI / 2));
    return (['north', 'west', 'south', 'east'] as const)[((q % 4) + 4) % 4] ?? 'south';
  }

  setMoving(moving: boolean): void {
    this.moving = moving;
  }

  /** Advance the walk. Returns true on a footfall. */
  update(dt: number, timeMs: number): boolean {
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 14);
    this.root.rotation.y = this.yaw + this.faceOffset;
    this.root.position.set(this.x, 0, this.z);

    const L = this.limbs;
    let footfall = false;
    if (this.rig) {
      const before = Math.floor(this.phase / Math.PI);
      if (this.moving) this.phase += dt * 9.5;
      footfall = this.moving && Math.floor(this.phase / Math.PI) !== before;
      this.blend += ((this.moving ? 1 : 0) - this.blend) * Math.min(1, dt * 8);
      if (!this.moving && this.blend < 0.02) this.phase = 0;
      this.rig.pose(this.phase, this.blend, timeMs);
      return footfall;
    }
    if (this.moving) {
      const before = Math.floor(this.phase / Math.PI);
      this.phase += dt * 11;
      footfall = Math.floor(this.phase / Math.PI) !== before;
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      if (L.LegL) L.LegL.rotation.x = s * 0.6;
      if (L.LegR) L.LegR.rotation.x = -s * 0.6;
      if (L.ArmL) L.ArmL.rotation.x = -s * 0.45;
      if (L.ArmR) L.ArmR.rotation.x = s * 0.45;
      if (L.Hips) {
        const rest = this.rest.get(L.Hips)!;
        L.Hips.position.y = rest.y + Math.abs(c) * 0.035;
        L.Hips.rotation.y = s * 0.08;
      }
      if (L.Torso) L.Torso.rotation.x = -0.06;
      if (L.Head) L.Head.rotation.x = 0.03 * c;
    } else {
      // Settle to rest and breathe.
      const k = Math.min(1, dt * 10);
      for (const n of [L.LegL, L.LegR, L.ArmL, L.ArmR, L.Torso, L.Head]) if (n) n.rotation.x += (0 - n.rotation.x) * k;
      if (L.Hips) {
        const rest = this.rest.get(L.Hips)!;
        L.Hips.position.y += (rest.y - L.Hips.position.y) * k;
        L.Hips.rotation.y += (0 - L.Hips.rotation.y) * k;
      }
      if (L.Torso) L.Torso.scaling.y = 1 + 0.012 * Math.sin(timeMs / 600);
      this.phase = 0;
    }
    return footfall;
  }

  dispose(): void {
    this.root.dispose(false, true);
  }
}

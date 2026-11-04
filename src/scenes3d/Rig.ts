import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Procedural walk and idle for a Mixamo-style rig (the Tripo character has no animation clips).
 * Each joint's rest rotation is kept and a swing is composed on top of it, so the pose always
 * returns to the modelled stance.
 */
export class Rig {
  private joints = new Map<string, { node: TransformNode; rest: Quaternion }>();
  private hipsRest = new Vector3();
  /** The arms hang from the T-pose: about the upper arm's x axis (its z swings the arm forward). */
  armDrop = -1.25;

  constructor(scene: Scene, prefix = 'mixamorig:') {
    const names = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftShoulder', 'RightShoulder'];
    for (const n of names) {
      const node = scene.getTransformNodeByName(prefix + n);
      if (!node) continue;
      if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
      this.joints.set(n, { node, rest: node.rotationQuaternion.clone() });
    }
    const hips = this.joints.get('Hips');
    if (hips) this.hipsRest.copyFrom(hips.node.position);
  }

  get ok(): boolean {
    return this.joints.has('LeftUpLeg') && this.joints.has('RightUpLeg');
  }

  /** Rotate a joint about its local axes (radians) on top of its rest pose. */
  private set(name: string, x: number, y = 0, z = 0): void {
    const j = this.joints.get(name);
    if (!j) return;
    const delta = Quaternion.FromEulerAngles(x, y, z);
    j.rest.multiplyToRef(delta, j.node.rotationQuaternion!);
  }

  /** phase advances with distance walked; blend 0 = idle, 1 = full stride. */
  pose(phase: number, blend: number, timeMs: number): void {
    const s = Math.sin(phase) * blend;
    const c = Math.cos(phase) * blend;
    const breathe = Math.sin(timeMs / 700) * 0.015;
    // Legs swing from the hip and bend at the knee on the way forward.
    this.set('LeftUpLeg', -s * 0.85);
    this.set('RightUpLeg', s * 0.85);
    this.set('LeftLeg', Math.max(0, -c) * 0.9 * blend + 0.05 * blend);
    this.set('RightLeg', Math.max(0, c) * 0.9 * blend + 0.05 * blend);
    this.set('LeftFoot', s * 0.2);
    this.set('RightFoot', -s * 0.2);
    // Arms swing opposite the legs, elbows slightly bent.
    // Mirrored joints share the drop sign and take opposite swings.
    this.set('LeftArm', this.armDrop, 0, s * 0.75);
    this.set('RightArm', this.armDrop, 0, -s * 0.75);
    this.set('LeftForeArm', 0, 0, 0.3 * blend + 0.15);
    this.set('RightForeArm', 0, 0, 0.3 * blend + 0.15);
    // The torso leans into the walk and sways; the head stays level.
    this.set('Spine', 0.06 * blend + breathe, c * 0.05, s * 0.04);
    this.set('Spine1', breathe * 0.5, 0, 0);
    this.set('Head', -0.04 * blend - breathe, -c * 0.06, 0);
    const hips = this.joints.get('Hips');
    if (hips) {
      hips.node.position.copyFrom(this.hipsRest);
      hips.node.position.y += Math.abs(c) * 0.03 - 0.01 * blend;
      this.set('Hips', 0, s * 0.08, 0);
    }
  }
}

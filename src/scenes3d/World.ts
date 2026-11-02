import { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Material } from '@babylonjs/core/Materials/material';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import '@babylonjs/loaders/glTF';
import { footstep } from '../audio/sfx';
import { progress, saveProgress } from '../state';
import { AREAS, type AreaDef } from '../world/areas';
import { GREY, PALETTES, lerpColor, type Palette } from '../world/palette';
import { Grid } from './grid';
import { hexToColor3 } from './materials';
import { toStandard } from './materials';
import { Player } from './Player';

/** Camera offset from the player, in tiles: high and to the south, looking north over the player's shoulder. */
const CAM_OFFSET = new Vector3(0, 8.6, 7.6);
const CAM_LOOK = new Vector3(0, 0.6, -0.4);
const WALK_SPEED = 4.7; // tiles per second, the 2D game's 150 px/s

export interface WorldStart {
  area?: string;
  at?: { x: number; y: number };
}

export interface WorldHooks {
  /** Walked onto an exit: load the next area. */
  onExit(to: string, at: { x: number; y: number }): void;
}

/**
 * One area in 3D: the Blender-built glb, the tile grid, the player, a follow camera and the sun.
 * Interactions, puzzles and colour arrive in later phases; the names the glb uses for doors,
 * gates and the bench are listed in scripts/blender/build_area.py.
 */
export class World {
  readonly scene: Scene;
  readonly area: AreaDef;
  readonly palette: Palette;
  readonly grid: Grid;
  player!: Player;
  camera!: TargetCamera;
  private sun!: DirectionalLight;
  private shadows!: ShadowGenerator;
  private container!: AssetContainer;
  private matCache = new Map<Material, StandardMaterial>();
  private keys = new Set<string>();
  private camPos = new Vector3();
  private transitioning = false;
  /** Set by the app while an overlay owns the keyboard. */
  inputLocked = false;
  ready = false;
  private onKey = (e: KeyboardEvent) => this.keyEvent(e);

  private constructor(
    readonly engine: Engine,
    areaId: string,
    private hooks: WorldHooks,
  ) {
    this.area = AREAS[areaId] ?? AREAS.hub;
    this.palette = PALETTES[this.area.palette];
    this.grid = new Grid(this.area);
    this.scene = new Scene(engine);
    this.scene.useRightHandedSystem = true;
  }

  static async create(engine: Engine, start: WorldStart, hooks: WorldHooks): Promise<World> {
    const areaId = start.area ?? progress.area ?? 'hub';
    const w = new World(engine, areaId, hooks);
    await w.build(start);
    return w;
  }

  private async build(start: WorldStart): Promise<void> {
    const scene = this.scene;
    const sky = hexToColor3(lerpColor(GREY.sky, this.palette.sky, 0));
    scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    scene.ambientColor = new Color3(0.25, 0.25, 0.28);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.016;
    scene.fogColor = sky;

    // Lights: a warm sun from the south-west and a cool sky fill.
    const hemi = new HemisphericLight('sky', new Vector3(0.1, 1, 0.2), scene);
    hemi.intensity = 0.42;
    hemi.diffuse = new Color3(0.78, 0.82, 0.95);
    hemi.groundColor = new Color3(0.35, 0.3, 0.28);
    this.sun = new DirectionalLight('sun', new Vector3(-0.45, -1, -0.35).normalize(), scene);
    this.sun.intensity = 0.95;
    this.sun.diffuse = new Color3(1, 0.93, 0.8);
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 60;
    this.sun.autoUpdateExtends = false;
    const ext = 16;
    this.sun.orthoLeft = -ext;
    this.sun.orthoRight = ext;
    this.sun.orthoTop = ext;
    this.sun.orthoBottom = -ext;
    this.shadows = new ShadowGenerator(2048, this.sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadows.bias = 0.0015;
    this.shadows.normalBias = 0.02;
    this.shadows.darkness = 0.35;

    // The camera is placed by hand every frame; no inputs.
    this.camera = new TargetCamera('cam', new Vector3(0, 10, 10), scene);
    this.camera.fov = 0.62;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 120;

    // The area.
    this.container = await LoadAssetContainerAsync(`world/${this.area.id}.glb`, scene);
    this.container.addAllToScene();
    for (const m of this.container.meshes) {
      toStandard(m, scene, this.matCache);
      // RGBA vertex colours would otherwise put the mesh in the transparent pass.
      m.hasVertexAlpha = false;
      m.isPickable = false;
      m.receiveShadows = true;
      if (m.getTotalVertices() > 0 && m.name !== 'water') this.shadows.addShadowCaster(m, false);
      if (m.name === 'ground') m.freezeWorldMatrix();
    }

    // Open doors and gates from saved progress (phase 2 animates these; here they are just removed).
    for (const e of this.area.entities) {
      if (e.kind === 'door' && progress.solved.includes(e.puzzle.id)) {
        for (const t of e.tiles) this.grid.setBlocked(t.x, t.y, false);
        this.meshesNamed(`door:${e.puzzle.id}:`).forEach((m) => m.setEnabled(false));
      }
      if (e.kind === 'practice') this.grid.setBlocked(e.tile.x, e.tile.y, true);
    }

    // The player.
    this.player = await Player.load(scene, this.matCache);
    for (const m of this.player.meshes) this.shadows.addShadowCaster(m, false);
    const at = start.at ?? (progress.area === this.area.id && progress.x > 0 ? { x: progress.x, y: progress.y } : this.area.start);
    this.player.setPosition(at.x + 0.5, at.y + 0.5);
    this.player.face(0, 1);
    progress.area = this.area.id;
    saveProgress(progress);
    this.camPos.copyFrom(this.player.root.position).addInPlace(CAM_OFFSET);
    this.placeCamera(1);

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', () => this.keys.clear());
    this.ready = true;
  }

  meshesNamed(prefix: string): AbstractMesh[] {
    return this.scene.meshes.filter((m) => m.name.startsWith(prefix));
  }

  private keyEvent(e: KeyboardEvent): void {
    if (e.type === 'keydown') {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    } else this.keys.delete(e.code);
  }

  private placeCamera(k: number): void {
    const target = this.player.root.position.add(CAM_OFFSET);
    this.camPos.addInPlace(target.subtract(this.camPos).scale(k));
    this.camera.position.copyFrom(this.camPos);
    this.camera.setTarget(this.camPos.subtract(CAM_OFFSET).add(CAM_LOOK));
    // The sun's shadow box follows the player.
    this.sun.position = this.player.root.position.subtract(this.sun.direction.scale(30));
  }

  /** Called every frame by the app. dt in seconds. */
  update(dt: number, timeMs: number): void {
    if (!this.ready) return;
    const k = this.keys;
    let dx = 0;
    let dz = 0;
    if (!this.inputLocked && !this.transitioning) {
      if (k.has('ArrowLeft') || k.has('KeyA')) dx -= 1;
      if (k.has('ArrowRight') || k.has('KeyD')) dx += 1;
      if (k.has('ArrowUp') || k.has('KeyW')) dz -= 1;
      if (k.has('ArrowDown') || k.has('KeyS')) dz += 1;
    }
    const moving = dx !== 0 || dz !== 0;
    if (moving) {
      if (dx && dz) (dx *= Math.SQRT1_2), (dz *= Math.SQRT1_2);
      const step = WALK_SPEED * dt;
      const r = this.grid.move(this.player.x, this.player.z, dx * step, dz * step);
      this.player.setPosition(r.x, r.z);
      this.player.face(dx, dz);
      this.checkExit();
    }
    this.player.setMoving(moving);
    if (this.player.update(dt, timeMs)) footstep();
    this.placeCamera(Math.min(1, dt * 6));
  }

  playerTile(): { x: number; y: number } {
    return this.grid.tileOf(this.player.x, this.player.z);
  }

  private checkExit(): void {
    if (this.transitioning) return;
    const pt = this.playerTile();
    for (const e of this.area.entities) {
      if (e.kind !== 'exit') continue;
      if (e.tiles.some((t) => t.x === pt.x && t.y === pt.y)) {
        this.transitioning = true;
        progress.area = e.to;
        progress.x = e.at.x;
        progress.y = e.at.y;
        saveProgress(progress);
        this.hooks.onExit(e.to, e.at);
        return;
      }
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.scene.dispose();
  }
}

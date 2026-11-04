import { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF';
import { type BandCue, type BandPart, bandCue, setBandListener } from '../audio/bandBus';
import { AudioEngine } from '../audio/engine';
import { MusicPlayer } from '../audio/music';
import { AREA_PIECE, Tracks } from '../audio/tracks';
import { doorOpen, footstep, gateLocked, panelOpen } from '../audio/sfx';
import { playCadence, playChord, playNote, playSequence } from '../audio/synth';
import { hzToMidi } from '../ear/pitchMath';
import { pipeForCode } from '../ear/pipes';
import type { Hud } from '../overlay/Hud';
import type { LessonOverlay } from '../overlay/LessonOverlay';
import type { MapOverlay } from '../overlay/MapOverlay';
import type { PuzzlePanel } from '../overlay/PuzzlePanel';
import type { StoryCard } from '../overlay/StoryCard';
import { mic } from '../overlay/Title';
import { el } from '../overlay/dom';
import { VOICE_AFTER_QUIET, VOICE_DRILL_CAP, VOICE_MAX, progress, saveProgress } from '../state';
import { AREAS, type AreaDef, type DoorDef, type GateDef, type NpcDef, type PracticeDef } from '../world/areas';
import { LESSONS, type Demo, type LessonPage } from '../world/lessons';
import { GREY, PALETTES, lerpColor, type Palette } from '../world/palette';
import { PuzzleRunner } from '../world/puzzleRunner';
import { CHORD_NAMES, CHORD_QUALITIES, CHORD_TONES, makeQuestion, type ChordQuality, type PuzzleSpec, type Step } from '../world/puzzles';
import { LifeMap, LifePlugin, WaterPlugin, CutawayPlugin, CutawayState } from './colour';
import { burst, sparkler } from './fx';
import type { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Grid } from './grid';
import { setMoveSpeed } from './Player';
import { SkyDome } from './sky';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { hexToColor3, toStandard } from './materials';
import { Player } from './Player';
import { listeningStatus, playPrompt, playSongLayers } from './prompts';

/** Where a slow machine's decision to drop the ambient occlusion is kept for the session. */
const AO_KEY = 'listening-kingdom.ao';

/** Camera offset from the player, in tiles: high and to the south, looking north over the player's shoulder. */
const CAM_OFFSET = new Vector3(0, 7.6, 9.2);
const CAM_LOOK = new Vector3(0, 0.7, -1.2);
/** Height of a stage deck (scripts/blender/build_area.py STAGE_H): people on stage tiles stand this much higher. */
const STAGE_H = 0.24;
/** The band: which model plays which part, and where over each one the sparks of a played note rise. */
const BAND: Record<BandPart, { model: string; at: [number, number, number] }> = {
  bass: { model: 'bassist', at: [0.12, 1.0, 0.22] },
  drums: { model: 'drummer', at: [0, 0.75, 0.3] },
  horn: { model: 'hornplayer', at: [0.05, 1.15, 0.4] },
};
// Tiles per second. The 2D game walked at 4.7 and the feet slid badly. The singer now runs when moving
// (Player.ts measures the clip's stride and picks its rate); 3.4 keeps the areas quick to cross without
// the feet skating more than the run clip's short steps allow.
const WALK_SPEED = 3.4;
setMoveSpeed(WALK_SPEED);

export interface WorldStart {
  area?: string;
  at?: { x: number; y: number };
}

export interface WorldHooks {
  /** Walked onto an exit: load the next area. */
  onExit(to: string, at: { x: number; y: number }): void;
  /** The song was sung: show the results. */
  onFinished(): void;
  /** Fade the screen to black (on) or back (off); resolves when done. */
  fade(on: boolean, ms: number): Promise<void>;
}

export interface Overlays {
  ui: HTMLDivElement;
  hud: Hud;
  panel: PuzzlePanel;
  mapView: MapOverlay;
  lessonView: LessonOverlay;
  storyCard: StoryCard;
}

interface DoorView {
  def: DoorDef;
  /** Meshes per tile, in the order of def.tiles. */
  tiles: AbstractMesh[][];
  solved: boolean;
}

interface GateView {
  def: GateDef;
  tiles: AbstractMesh[][];
  open: boolean;
}

interface Bloom {
  cx: number;
  cy: number;
  t0: number;
  speed: number; // tiles per second
  max: number;
}

interface Anim {
  mesh: AbstractMesh;
  from: Vector3;
  to: Vector3;
  t0: number;
  dur: number;
  onDone?: () => void;
}

/**
 * One area in 3D: the Blender-built glb, the tile grid, the player, a follow camera and the sun,
 * and everything the player can do there: doors, gates, the bench, the fragment, the exits.
 * The names the glb uses for doors, gates and the bench are listed in scripts/blender/build_area.py.
 */
export class World {
  readonly scene: Scene;
  readonly area: AreaDef;
  readonly palette: Palette;
  readonly grid: Grid;
  player!: Player;
  camera!: TargetCamera;
  runner: PuzzleRunner | null = null;
  readonly panel: PuzzlePanel;
  readonly storyCard: StoryCard;
  ready = false;
  /** Per-tile life, 0 (grey) to 1 (in colour), row-major. Read by the colour pass. */
  readonly life: Float32Array;
  private lifeTarget: Float32Array;
  private blooms: Bloom[] = [];
  private sun!: DirectionalLight;
  private shadows!: ShadowGenerator;
  private container!: AssetContainer;
  private matCache = new Map<Material, StandardMaterial>();
  private lifeMap!: LifeMap;
  private water: WaterPlugin | null = null;
  private sky!: SkyDome;
  private pipeline: DefaultRenderingPipeline | null = null;
  private ssao: SSAO2RenderingPipeline | null = null;
  /** Frame-time check for the ambient occlusion: null once decided. */
  private aoCheck: { startAt: number; frames: number; ms: number } | null = null;
  private keys = new Set<string>();
  private camPos = new Vector3();
  private shakeUntil = 0;
  private transitioning = false;
  private doors: DoorView[] = [];
  private gates: GateView[] = [];
  /** The shared material of every closed door's glowing edge (see build_area.py); pulsed each frame. */
  private glow: StandardMaterial | null = null;
  private glowBase = new Color3(0, 0, 0);
  /** Singing an opened door again: no voice lost or gained, nothing recorded. */
  private resing = false;
  /** A door the camera pushes in on for a moment, and until when. */
  private focus: { x: number; z: number; until: number } | null = null;
  /** People standing about, with the clip they play while their door is sung. */
  private npcs: Array<{ def: NpcDef; top: TransformNode; baseY: number; idle: AnimationGroup | null; action: AnimationGroup | null; acting: boolean; sway: number; phase: number; frozen: boolean; hitAt: number; hitUntil: number; hitStrong: boolean; sparks: ParticleSystem | null; restYaw: number }> = [];
  /** Camera-to-player cutaway shared by the wall, tree and prop materials. */
  private cutaway = new CutawayState();
  /** The door whose puzzle is running, for the people who react to it. */
  private activeDoor: string | null = null;
  /** What loadExtras did, one line per person or prop, for the headless checks. */
  readonly extrasLog: string[] = [];
  /** The singer keeps singing until this time (after a door opens, during the finale). */
  private celebrateUntil = 0;
  /** The finale walks the singer to centre stage. */
  private walkTo: { x: number; z: number } | null = null;
  private practice: PracticeDef | null = null;
  private fragment: Mesh | null = null;
  private fragmentT = 0;
  private anims: Anim[] = [];
  private timers = new Set<number>();
  private drilling = false;
  private voiceMidi: number | null = null;
  private voiceMuteUntil = 0;
  private lastBump = 0;
  private bubble: HTMLDivElement;
  private hud: Hud;
  private mapView: MapOverlay;
  private lessonView: LessonOverlay;
  private disposed = false;
  private onKey = (e: KeyboardEvent) => this.keyEvent(e);
  private onBlur = () => this.keys.clear();

  private constructor(
    readonly engine: Engine,
    areaId: string,
    private hooks: WorldHooks,
    overlays: Overlays,
  ) {
    this.area = AREAS[areaId] ?? AREAS.hub;
    this.palette = PALETTES[this.area.palette];
    this.grid = new Grid(this.area);
    this.life = new Float32Array(this.grid.w * this.grid.h);
    this.lifeTarget = new Float32Array(this.grid.w * this.grid.h);
    this.scene = new Scene(engine);
    this.scene.useRightHandedSystem = true;
    this.hud = overlays.hud;
    this.panel = overlays.panel;
    this.mapView = overlays.mapView;
    this.lessonView = overlays.lessonView;
    this.storyCard = overlays.storyCard;
    this.bubble = el('div', 'bubble hidden', 'Space');
    overlays.ui.appendChild(this.bubble);
  }

  static async create(engine: Engine, start: WorldStart, hooks: WorldHooks, overlays: Overlays): Promise<World> {
    const areaId = start.area ?? progress.area ?? 'hub';
    const w = new World(engine, areaId, hooks, overlays);
    await w.build(start);
    return w;
  }

  // ---------- building ----------

  private async build(start: WorldStart): Promise<void> {
    const scene = this.scene;
    const sky = hexToColor3(lerpColor(GREY.sky, this.palette.sky, 0));
    scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    scene.ambientColor = new Color3(0.25, 0.25, 0.28);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.014;
    scene.fogColor = sky;

    const hemi = new HemisphericLight('sky', new Vector3(0.1, 1, 0.2), scene);
    hemi.intensity = 0.45;
    hemi.diffuse = new Color3(0.78, 0.82, 0.95);
    hemi.groundColor = new Color3(0.35, 0.3, 0.28);
    this.sun = new DirectionalLight('sun', new Vector3(-0.45, -1, -0.35).normalize(), scene);
    this.sun.intensity = 0.92;
    this.sun.diffuse = new Color3(1, 0.93, 0.8);
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 60;
    this.sun.autoUpdateExtends = false;
    // The camera sees about 20 by 12 tiles: a tight frustum spends the shadow map on what is on screen.
    const ext = 12;
    this.sun.orthoLeft = -ext;
    this.sun.orthoRight = ext;
    this.sun.orthoTop = ext;
    this.sun.orthoBottom = -ext;
    this.shadows = new ShadowGenerator(2048, this.sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH;
    this.shadows.bias = 0.001;
    // Enough normal bias that the wall tops, lit at a grazing angle, do not pick up a fringe of acne.
    this.shadows.normalBias = 0.05;
    this.shadows.darkness = 0.35;

    this.camera = new TargetCamera('cam', new Vector3(0, 10, 10), scene);
    this.camera.fov = 0.62;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 120;

    this.container = await LoadAssetContainerAsync(`world/${this.area.id}.glb`, scene);
    if (this.disposed) return;
    this.container.addAllToScene();
    for (const m of this.container.meshes) {
      toStandard(m, scene, this.matCache);
      m.hasVertexAlpha = false;
      m.isPickable = false;
      m.receiveShadows = true;
      if (m.getTotalVertices() > 0 && m.name !== 'water') this.shadows.addShadowCaster(m, false);
      if (m.name === 'ground') m.freezeWorldMatrix();
    }
    // Colour: every world material mixes toward grey by the tile's life.
    this.lifeMap = new LifeMap(this.grid.w, this.grid.h, scene);
    for (const mat of this.matCache.values()) {
      // The door glow is the one thing that keeps its colour in a grey area: it is what marks a door.
      if (mat.name === 'door-glow') {
        this.glow = mat;
        this.glowBase = hexToColor3(this.palette.accent);
        mat.diffuseColor = this.glowBase.scale(0.5);
        continue;
      }
      new LifePlugin(mat, this.lifeMap);
      if (mat.name === 'water') this.water = new WaterPlugin(mat);
    }
    // Whatever stands between the camera and the player is cut open; the ground, water and doors are not.
    const cutMats = new Set<Material>();
    for (const m of this.container.meshes) if (/^(walls|trees|props)(_primitive\d+)?$/.test(m.name) && m.material) cutMats.add(m.material);
    for (const mat of cutMats) if (mat.name !== 'door-glow') new CutawayPlugin(mat, this.cutaway);
    this.sky = new SkyDome(scene, this.area.id);
    // A warm lamp at the bench and a little bloom on everything that glows.
    for (const e of this.area.entities) {
      if (e.kind === 'practice') {
        const lamp = new PointLight('lamp', new Vector3(e.tile.x + 0.5 + 0.62, 1.3, e.tile.y + 0.5), scene);
        lamp.diffuse = hexToColor3(this.palette.accent);
        lamp.intensity = 1.3;
        lamp.range = 4;
      } else if (e.kind === 'stage') {
        // Nobody walks onto the stage, and a warm light hangs over it so the band is lit like a band.
        for (const t of e.tiles) this.grid.setBlocked(t.x, t.y, true);
        const xs = e.tiles.map((t) => t.x);
        const ys = e.tiles.map((t) => t.y);
        const lamp = new PointLight('stage-lamp', new Vector3((Math.min(...xs) + Math.max(...xs) + 1) / 2, 2.6, (Math.min(...ys) + Math.max(...ys) + 1) / 2 + 0.3), scene);
        lamp.diffuse = hexToColor3(0xffd9a0);
        lamp.intensity = 1.6;
        lamp.range = 6;
      }
    }
    // Ambient occlusion: a soft contact shadow where walls meet the ground and props meet the walls.
    // Off unless ?ao=on asks for it: at half resolution it painted dark fuzzy bands along wall bases and a
    // halo round the character (Andre, 2026-11-03), which read as broken shadows, not as depth.
    // With ?ao=on it runs before bloom and FXAA and the first seconds of play may still switch it off (see checkAo).
    const aoParam = new URLSearchParams(location.search).get('ao');
    const aoOff = aoParam !== 'on' || sessionStorage.getItem(AO_KEY) === 'off';
    if (!aoOff && SSAO2RenderingPipeline.IsSupported) {
      this.ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [this.camera], true);
      this.ssao.radius = 1.1;
      this.ssao.totalStrength = 1.25;
      this.ssao.base = 0.1;
      this.ssao.samples = 8;
      this.ssao.maxZ = 40;
      this.ssao.minZAspect = 0.3;
      this.ssao.expensiveBlur = true;
      this.ssao.bilateralSamples = 8;
      this.ssao.bilateralSoften = 0.2;
      this.aoCheck = { startAt: performance.now() + 2500, frames: 0, ms: 0 };
    }
    this.pipeline = new DefaultRenderingPipeline('pipe', false, scene, [this.camera]);
    this.pipeline.imageProcessingEnabled = false;
    this.pipeline.bloomEnabled = true;
    // Bloom is for the glowing things (door strips, rings, lamps, neon). At 0.75 it caught sunlit grass and
    // wall tops and smeared a haze along every edge.
    this.pipeline.bloomThreshold = 0.92;
    this.pipeline.bloomWeight = 0.25;
    this.pipeline.bloomKernel = 32;
    this.pipeline.bloomScale = 0.5;
    this.pipeline.fxaaEnabled = true;
    this.buildEntities();

    this.player = await Player.load(scene, new Map());
    if (this.disposed) return;
    await this.loadExtras();
    if (this.disposed) return;
    for (const m of this.player.meshes) this.shadows.addShadowCaster(m, false);
    const at = start.at ?? (progress.area === this.area.id && progress.x > 0 ? { x: progress.x, y: progress.y } : this.area.start);
    this.player.setPosition(at.x + 0.5, at.y + 0.5);
    this.player.face(0, 1);
    progress.area = this.area.id;
    this.camPos.copyFrom(this.player.root.position).addInPlace(CAM_OFFSET);
    this.placeCamera(1);

    // Colour already won: solved doors light their surroundings at once.
    for (const d of this.doors) if (d.solved) this.blooms.push({ cx: d.def.tiles[0].x, cy: d.def.tiles[0].y, t0: -1e9, speed: 1e9, max: 14 });
    if (this.areaComplete() || progress.finished) this.blooms.push({ cx: 0, cy: 0, t0: -1e9, speed: 1e9, max: 1e9 });
    this.updateColour(1000, performance.now());
    this.refreshGates(true);

    this.panel.setPalette(this.palette);
    this.lessonView.setPalette(this.palette);
    this.lessonView.onHear = (page) => this.playDemo(page);
    this.lessonView.onDrill = () => this.startDrill();
    this.lessonView.onLeave = () => this.closeLesson();
    this.hud.show(this.area.name);
    if (!progress.cardsSeen.includes(this.area.id)) {
      const ok = await this.storyCard.show(this.area.id, this.area.name);
      if (ok) progress.cardsSeen.push(this.area.id);
    }
    saveProgress(progress);
    if (this.storyCard.visible) {
      // The story piece under the card; the area's music starts when the card goes.
      MusicPlayer.get().stop();
      Tracks.get().play('story', { loop: true, fade: 600 });
      this.storyCard.onDone = () => {
        this.storyCard.onDone = null;
        if (!this.disposed) this.startMusic();
        Tracks.get().stop('story', 900);
      };
    } else this.startMusic();
    MusicPlayer.get().setLife(this.areaLife());
    Tracks.get().setLife(this.areaLife());
    setBandListener((c) => this.onBandCue(c));

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
    this.ready = true;
  }

  private buildEntities(): void {
    for (const e of this.area.entities) {
      if (e.kind === 'door') {
        const solved = progress.solved.includes(e.puzzle.id);
        const tiles = e.tiles.map((_, i) => this.meshesNamed(`door:${e.puzzle.id}:${i}`));
        if (solved) {
          for (const t of e.tiles) this.grid.setBlocked(t.x, t.y, false);
          for (const ms of tiles) for (const m of ms) m.setEnabled(false);
        }
        this.doors.push({ def: e, tiles, solved });
      } else if (e.kind === 'gate') {
        const tiles = e.tiles.map((_, i) => this.meshesNamed(`gate:${e.flag}:${i}`));
        this.gates.push({ def: e, tiles, open: false });
      } else if (e.kind === 'practice') {
        this.grid.setBlocked(e.tile.x, e.tile.y, true);
        this.practice = e;
      } else if (e.kind === 'fragment' && !progress.solved.includes(e.id)) {
        const gem = CreatePolyhedron('fragment', { type: 1, size: 0.22 }, this.scene);
        const mat = new StandardMaterial('fragment', this.scene);
        mat.diffuseColor = hexToColor3(this.palette.accent);
        mat.emissiveColor = hexToColor3(this.palette.accent).scale(0.7);
        mat.specularColor = new Color3(0.4, 0.4, 0.4);
        gem.material = mat;
        gem.position.set(e.tile.x + 0.5, 0.7, e.tile.y + 0.5);
        this.shadows.addShadowCaster(gem, false);
        this.fragment = gem;
      }
    }
  }

  /** Meshes whose glTF name starts with `prefix` (a node with several materials splits into `_primitiveN` meshes). */
  meshesNamed(prefix: string): AbstractMesh[] {
    return this.scene.meshes.filter((m) => m.name === prefix || m.name.startsWith(prefix + '_primitive') || m.name.startsWith(prefix + '.'));
  }

  // ---------- helpers ----------

  private later(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(id);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.later(ms, r));
  }

  /** Slide a mesh from where it is to `to` over `dur` ms. */
  private slide(mesh: AbstractMesh, to: Vector3, dur: number, onDone?: () => void): void {
    this.anims.push({ mesh, from: mesh.position.clone(), to, t0: performance.now(), dur, onDone });
  }

  private setVoice(v: number, flash = -1): void {
    progress.voice = Math.max(0, Math.min(VOICE_MAX, v));
    this.hud.refresh(flash);
    saveProgress(progress);
  }

  private toast(text: string, ms = 3200): void {
    this.hud.toast(text, ms);
  }

  private shake(): void {
    this.shakeUntil = performance.now() + 120;
  }

  get inputLocked(): boolean {
    return !!this.runner || this.transitioning || this.mapView.visible || this.lessonView.visible || this.storyCard.visible;
  }

  // ---------- colour ----------

  areaLife(): number {
    const doors = this.doors.length || 1;
    return this.doors.filter((d) => d.solved).length / doors;
  }

  private areaComplete(): boolean {
    return this.doors.every((d) => d.solved);
  }

  private bloomAt(x: number, y: number, max = 14): void {
    this.blooms.push({ cx: x, cy: y, t0: performance.now(), speed: 9, max });
  }

  /** Spread the blooms through the tile targets and ease each tile's life toward its target. */
  private updateColour(dt: number, now: number): void {
    const { w, h } = this.grid;
    for (const b of this.blooms) {
      const r = Math.min(b.max, ((now - b.t0) / 1000) * b.speed);
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor(b.cx - r));
      const x1 = Math.min(w - 1, Math.ceil(b.cx + r));
      const y0 = Math.max(0, Math.floor(b.cy - r));
      const y1 = Math.min(h - 1, Math.ceil(b.cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - b.cx;
          const dy = y - b.cy;
          if (dx * dx + dy * dy <= r2) this.lifeTarget[y * w + x] = 1;
        }
      }
    }
    this.blooms = this.blooms.filter((b) => ((now - b.t0) / 1000) * b.speed < b.max + 1);
    const k = Math.min(1, dt / 220);
    for (let i = 0; i < this.life.length; i++) {
      const d = this.lifeTarget[i] - this.life[i];
      if (Math.abs(d) < 0.004) {
        this.life[i] = this.lifeTarget[i];
        continue;
      }
      this.life[i] += d * k;
    }
    this.lifeMap.upload(this.life);
    const sky = hexToColor3(lerpColor(GREY.sky, this.palette.sky, this.areaLife()));
    const horizon = Color3.Lerp(sky, new Color3(0.85, 0.82, 0.78), 0.45);
    this.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    this.scene.fogColor = horizon;
    this.sky.setColours(sky, horizon);
    this.sky.setLife(this.areaLife());
  }

  // ---------- movement ----------

  private keyEvent(e: KeyboardEvent): void {
    if (e.type === 'keydown') {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.onKeyDown(e);
    } else this.keys.delete(e.code);
  }

  /** Where the player is heading, eased, so the camera leads a little into the walk. */
  private lookAhead = new Vector3();

  private placeCamera(k: number): void {
    const target = this.player.root.position.add(CAM_OFFSET).addInPlace(this.lookAhead);
    if (this.focus) {
      // Push in toward the door: the target slides halfway to it and the camera comes a little closer.
      const t = Math.max(0, Math.min(1, (this.focus.until - performance.now()) / 1600));
      const w = Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) * 0.5;
      target.x += (this.focus.x - this.player.root.position.x) * w;
      target.z += (this.focus.z - this.player.root.position.z) * w;
      target.subtractInPlace(CAM_OFFSET.scale(0.22 * w));
      if (t <= 0) this.focus = null;
    }
    this.camPos.addInPlace(target.subtract(this.camPos).scale(k));
    const jitter = performance.now() < this.shakeUntil ? new Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0) : Vector3.Zero();
    this.camera.position.copyFrom(this.camPos).addInPlace(jitter);
    this.camera.setTarget(this.camPos.subtract(CAM_OFFSET).add(CAM_LOOK));
    this.cutaway.cam.copyFrom(this.camera.position);
    this.cutaway.target.copyFrom(this.player.root.position);
    this.cutaway.target.y += 0.8;
    this.sun.position = this.player.root.position.subtract(this.sun.direction.scale(30));
  }

  playerTile(): { x: number; y: number } {
    return this.grid.tileOf(this.player.x, this.player.z);
  }

  private bump(tile: { x: number; y: number }): void {
    const now = performance.now();
    if (now - this.lastBump < 1200) return;
    for (const g of this.gates) {
      if (!g.open && g.def.tiles.some((t) => t.x === tile.x && t.y === tile.y)) {
        this.lastBump = now;
        gateLocked();
        this.toast(g.def.lockedLine);
        playNote(45, { timbre: 'bass', duration: 0.2, gain: 0.3 });
      }
    }
  }

  /** The closest door within reach. An opened door counts too (it can be sung again), but a closed one wins. */
  private nearestDoor(): DoorView | null {
    const pt = this.playerTile();
    let best: DoorView | null = null;
    let bestD = 2.2;
    for (const d of this.doors) {
      for (const t of d.def.tiles) {
        const dist = Math.hypot(t.x - pt.x, t.y - pt.y) + (d.solved ? 1 : 0);
        if (dist < bestD) {
          bestD = dist;
          best = d;
        }
      }
    }
    return best;
  }

  private nearPractice(): boolean {
    if (!this.practice) return false;
    const pt = this.playerTile();
    const t = this.practice.tile;
    return Math.hypot(t.x - pt.x, t.y - pt.y) < 2.2;
  }

  // ---------- practice ----------

  private openLesson(): void {
    const p = this.practice;
    if (!p) return;
    const lesson = LESSONS[p.lesson];
    if (!lesson) return;
    void AudioEngine.get().unlock();
    panelOpen();
    // The music steps aside at the bench as it does at a door, so the examples are heard alone.
    MusicPlayer.get().setPaused(true);
    Tracks.get().setPaused(true);
    this.lessonView.show(lesson);
    this.hud.setHint('');
  }

  /** Leave the lesson pages without a drill: the music comes back. */
  private closeLesson(): void {
    this.lessonView.hide();
    if (!this.runner) this.resumeMusic();
  }

  private playDemo(page: LessonPage): void {
    const d: Demo | undefined = page.demo;
    if (!d) return;
    const engine = AudioEngine.get();
    const base = 60;
    let t = engine.now + 0.06;
    if (d.cadence) t = playCadence(base, { at: t, speed: 1 }) + 0.3;
    if (d.notes) {
      const beat = d.gap ?? 0.42;
      d.notes.forEach((o, i) => {
        const len = (d.beats?.[i] ?? 1) * beat;
        playNote(base + o, { timbre: d.timbre ?? 'pipe', at: t, duration: Math.min(1.4, len * 0.9), gain: 0.5 });
        t += len;
      });
    }
    if (d.chord) t = playChord(d.chord.map((o) => base + o), { timbre: d.timbre ?? 'chord', at: t, duration: 1.4, gain: 0.8 });
    if (d.chords) {
      // Each chord stops, and a short rest passes, before the next one starts.
      const gap = d.gap ?? 1.1;
      for (const c of d.chords) {
        playNote(base - 24 + c[0], { timbre: 'bass', at: t, duration: gap - 0.35, gain: 0.22 });
        playChord(c.map((o) => base + o), { timbre: d.timbre ?? 'chord', at: t, duration: gap - 0.35, gain: 0.8 });
        t += gap;
      }
    }
  }

  private startDrill(): void {
    const p = this.practice;
    if (!p) return;
    const lesson = LESSONS[p.lesson];
    this.lessonView.hide();
    void this.startPuzzle(null, lesson.drill);
  }

  /** The voice ran out: the door closes and the player wakes at the bench with a little voice back. */
  private async goQuiet(): Promise<void> {
    const p = this.practice;
    progress.quiets = (progress.quiets ?? 0) + 1;
    this.endPuzzle(false);
    this.setVoice(VOICE_AFTER_QUIET);
    this.transitioning = true;
    playSequence([52, 48, 45], { timbre: 'bass', duration: 0.5, gap: 0.3, gain: 0.35 });
    await this.hooks.fade(true, 900);
    if (this.disposed) return;
    if (p) this.player.setPosition(p.at.x + 0.5, p.at.y + 0.5);
    this.camPos.copyFrom(this.player.root.position).addInPlace(CAM_OFFSET);
    this.placeCamera(1);
    await this.hooks.fade(false, 700);
    this.transitioning = false;
    this.toast(p ? 'Your voice gave out. You wake at the practice bench. Space: a lesson and a free drill to get it back.' : 'Your voice gave out. Rest a moment.', 6000);
  }

  // ---------- puzzles ----------

  /** The map. The area's piece plays on under it; where the synth is playing instead, the story piece takes its place. */
  private openMap(): void {
    this.mapView.show(this.area);
    if (Tracks.get().area) return;
    MusicPlayer.get().setPaused(true);
    Tracks.get().play('story', { loop: true, fade: 500 });
  }

  private closeMap(): void {
    this.mapView.hide();
    if (Tracks.get().area) return;
    Tracks.get().stop('story', 600);
    if (!this.runner) MusicPlayer.get().setPaused(false);
  }

  private onKeyDown(ev: KeyboardEvent): void {
    if (this.storyCard.visible) {
      if (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'Escape') this.storyCard.hide();
      return;
    }
    if (this.mapView.visible) {
      if (ev.code === 'KeyM' || ev.code === 'Escape' || ev.code === 'Space') this.closeMap();
      return;
    }
    if (this.lessonView.visible) {
      if (ev.code === 'Escape') this.closeLesson();
      else if (ev.code === 'Space') this.lessonView.hear();
      else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') this.lessonView.go(1);
      else if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') this.lessonView.go(-1);
      else if (ev.code === 'Enter') this.startDrill();
      return;
    }
    if (!this.runner && ev.code === 'KeyM') {
      this.openMap();
      return;
    }
    if (this.runner) {
      if (ev.code === 'Space') {
        void this.runner.replay();
        return;
      }
      if (ev.code === 'Escape') {
        this.endPuzzle(false);
        return;
      }
      if (this.runner.isChoice) {
        const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(ev.code);
        if (i >= 0) void this.runner.attemptChoice(CHORD_QUALITIES[i]);
        return;
      }
      if (ev.code === 'Enter') {
        void this.runner.confirm();
        return;
      }
      const hit = pipeForCode(ev.code);
      if (hit !== null) this.playPipe(hit);
      return;
    }
    if (ev.code === 'Space') {
      if (this.transitioning) return;
      const d = this.nearestDoor();
      if (d) void this.startPuzzle(d, d.def.puzzle);
      else if (this.nearPractice()) this.openLesson();
    }
  }

  /** A key pressed or clicked: sound it and hold it as the note Enter will answer with. */
  private playPipe(midi: number): void {
    if (!this.runner) return;
    playNote(midi, { duration: 0.5, gain: 0.5, out: AudioEngine.get().keys });
    this.voiceMuteUntil = performance.now() + 700;
    this.panel.flashPipe(midi);
    this.runner.audition(midi);
  }

  private async startPuzzle(d: DoorView | null, spec: PuzzleSpec): Promise<void> {
    await AudioEngine.get().unlock();
    if (this.disposed) return;
    const question = makeQuestion(spec, Math.random, progress.misses);
    this.drilling = d === null;
    this.resing = !!d?.solved;
    this.activeDoor = d?.def.puzzle.id ?? null;
    const runner = new PuzzleRunner(question, {
      playPrompt: (step, slow, again) => playPrompt(runner, step, slow, again, (s) => this.panel.setStatus(s)),
      onListening: () => this.panel.setStatus(listeningStatus(runner)),
      onStepSolved: (i) => this.onStepSolved(d, i),
      onSolved: () => (d ? this.onSolved(d) : this.onDrillSolved()),
      onMiss: (midi) => this.onMiss(midi),
    });
    runner.hintOffset = d ? -2 : 1;
    this.runner = runner;
    if (d?.def.puzzle.id === 'jazz-bandstand' && !d.solved) this.toast('The band picks up their instruments.', 2600);
    MusicPlayer.get().setPaused(true);
    Tracks.get().setPaused(true);
    panelOpen();
    this.panel.onSign = (q) => void runner.attemptChoice(q);
    this.panel.onKey = (midi) => this.playPipe(midi);
    this.panel.onAnswer = () => void runner.confirm();
    this.panel.show(runner);
    this.hud.setHint('');
    this.player.setMoving(false);
    if (d) {
      // Half toward the door, half toward the camera, so the face stays in view while singing.
      const t = d.def.tiles[0];
      const dx = t.x + 0.5 - this.player.x;
      const dz = t.y + 0.5 - this.player.z;
      const len = Math.hypot(dx, dz) || 1;
      this.player.face(dx / len + 0.4 * Math.sign(dx || 1), dz / len + 1.0);
    }
    void runner.start();
  }

  private onStepSolved(d: DoorView | null, index: number): Promise<void> {
    const engine = AudioEngine.get();
    engine.setDuck(1);
    const step = this.runner!.question.steps[index];
    if (!d && progress.voice < VOICE_DRILL_CAP) {
      this.setVoice(progress.voice + 1);
      this.panel.setStatus(`Yes: ${step.label.toLowerCase()}. A note of voice back.`);
    } else this.panel.setStatus(`Yes: ${step.label.toLowerCase()}.`);
    if (d?.def.puzzle.id === 'stage-song') playSongLayers(index, step);
    else if (step.mode === 'melody') {
      /* No echo mid-tune: a single note played back sounded like a new prompt. The status line confirms. */
    } else if (step.spec.kind === 'chordName') playChord(CHORD_TONES[step.spec.quality].map((o) => step.refMidi + o), { timbre: 'bell', duration: 0.6, gain: 0.7 });
    else if (step.spec.kind === 'chordTone') {
      playChord(CHORD_TONES[step.spec.quality].map((o) => step.refMidi + o), { timbre: 'chord', duration: 0.8, gain: 0.6 });
      playNote(step.targetMidi, { timbre: 'bell', duration: 0.6, gain: 0.5 });
    } else if (step.spec.kind === 'resolve') {
      const t0 = engine.now + 0.05;
      playNote(step.refMidi - 24, { timbre: 'bass', at: t0, duration: 1.4, gain: 0.25 });
      playChord(CHORD_TONES.maj7.map((o) => step.refMidi + o), { timbre: 'chord', at: t0, duration: 1.4, gain: 0.8 });
      playNote(step.refMidi + 12, { timbre: 'bell', at: t0, duration: 1.0, gain: 0.45 });
      // The band lands the one with the player.
      bandCue('bass', t0, 1.4, true);
      bandCue('drums', t0, 0.2, true);
      bandCue('horn', t0, 1.0, true);
    } else if (step.spec.kind === 'degree') playNote(step.targetMidi, { timbre: 'bell', duration: 0.5, gain: 0.5 });
    else playSequence([step.refMidi, step.targetMidi], { timbre: 'bell', duration: 0.35, gap: 0.18, gain: 0.5 });
    // A multi-tile door (the serpent) sinks one segment per step.
    if (d && d.def.tiles.length > 1 && index < d.tiles.length) for (const m of d.tiles[index]) this.slide(m, m.position.add(new Vector3(0, -0.3, 0)), 400);
    const lick = this.area.id === 'jazz' && this.bandAwake() && (step.spec.kind === 'chordTone' || step.spec.kind === 'chordName');
    if (lick) this.bandLick(step);
    return this.wait(lick ? 1900 : step.mode === 'melody' ? 250 : step.spec.kind === 'resolve' ? 1500 : 900);
  }

  /**
   * The finale. The band plays the whole song with every layer while the stage lights come on bar by bar,
   * the singer walks to centre stage and holds the last note, fireworks go up over the stage, colour
   * floods the kingdom, and the results follow.
   */
  private finishKingdom(d: DoorView): void {
    const q = this.runner!.question;
    const engine = AudioEngine.get();
    const beat = 0.42;
    const t0 = engine.now + 0.4;
    q.steps.forEach((st, i) => playSongLayers(i, st, t0 + i * beat));
    const last = q.steps[q.steps.length - 1];
    const tEnd = t0 + q.steps.length * beat;
    playChord([last.refMidi - 24, last.refMidi - 12, last.refMidi + 4, last.refMidi + 7, last.refMidi + 12], { timbre: 'pad', at: tEnd, duration: 3.5, gain: 0.8 });
    playNote(last.refMidi + 12, { timbre: 'bell', at: tEnd, duration: 1.5, gain: 0.5 });
    // A rising fanfare of bells over the fireworks.
    [0, 4, 7, 12, 16, 19, 24].forEach((o, i) => playNote(last.refMidi + o, { timbre: 'bell', at: tEnd + 1.2 + i * 0.16, duration: 0.6, gain: 0.35 }));
    progress.finished = true;
    progress.finishedAt = Date.now();
    saveProgress(progress);
    this.endPuzzle(true);
    this.toast('Three fragments, one song. Listen: the kingdom answers.', 6000);
    const t = d.def.tiles[0];
    const msTo = (time: number) => Math.max(0, (time - engine.now) * 1000);
    // Centre stage is the middle of the floor below the door; the singer walks there as the band starts.
    this.walkTo = { x: t.x + 0.5, z: t.y + 1.7 };
    this.celebrateUntil = performance.now() + msTo(tEnd) + 12000;
    // Stage lights, one per bar, in the kingdom's colours, with a spark where each comes on.
    const colours = [PALETTES.valley.accent, PALETTES.town.accent, PALETTES.jazz.accent, this.palette.accent];
    colours.forEach((hex, bar) => {
      this.later(msTo(t0 + bar * 4 * beat), () => {
        const x = t.x + 0.5 + (bar - 1.5) * 2.2;
        const pos = new Vector3(x, 2.6, t.y + 1.2);
        const light = new PointLight(`stage-light-${bar}`, pos, this.scene);
        light.diffuse = hexToColor3(hex);
        light.intensity = 0;
        light.range = 9;
        const start = performance.now();
        const fade = () => {
          const k = Math.min(1, (performance.now() - start) / 600);
          light.intensity = 1.6 * k;
          if (k < 1 && !this.disposed) requestAnimationFrame(fade);
        };
        fade();
        burst(this.scene, pos, hex, { count: 50, life: 0.9, speed: 1.2, gravity: 1.5, size: 0.1 });
      });
    });
    // Fireworks over the stage, from the last note until the fade.
    const firework = () => {
      const hex = colours[Math.floor(Math.random() * colours.length)];
      const pos = new Vector3(t.x + 0.5 + (Math.random() - 0.5) * 9, 3.5 + Math.random() * 2.5, t.y + 0.5 + Math.random() * 5);
      burst(this.scene, pos, hex, { count: 160, life: 1.6, speed: 3.2, gravity: 2.5, size: 0.16, color2: 0xfff2c0 });
      playNote(84 + Math.floor(Math.random() * 12), { timbre: 'bell', duration: 0.3, gain: 0.12 });
    };
    for (let i = 0; i < 17; i++) this.later(msTo(tEnd) + 200 + i * 650 + Math.random() * 200, firework);
    this.later(msTo(tEnd) - 400, () => this.bloomAt(t.x, t.y, 1e9));
    // Once the held chord has died away, the recorded finale takes over from the synth and carries on under the results.
    this.later(msTo(tEnd) + 4000, () => {
      MusicPlayer.get().stop();
      Tracks.get().stopArea(1500);
      Tracks.get().play('finale', { fade: 1500, then: 'credits' });
    });
    this.later(msTo(tEnd) + 12000, () => {
      this.transitioning = true;
      void this.hooks.fade(true, 900).then(() => this.hooks.onFinished());
    });
  }

  private onMiss(attempt: number | ChordQuality): Promise<void> {
    const engine = AudioEngine.get();
    engine.setDuck(1);
    const r = this.runner!;
    if (!this.drilling && !this.resing) {
      progress.areaMisses[this.area.id] = (progress.areaMisses[this.area.id] ?? 0) + 1;
      this.setVoice(progress.voice - 1, progress.voice - 1);
      if (progress.voice <= 0) {
        this.panel.setStatus('Your voice gives out…');
        return this.wait(700).then(() => void this.goQuiet());
      }
    }
    if (r.step.spec.kind === 'degree') {
      const key = `degree-${r.step.spec.degree}`;
      progress.misses[key] = (progress.misses[key] ?? 0) + 1;
    }
    if (typeof attempt === 'string') {
      const key = `chord-${attempt}`;
      progress.misses[key] = (progress.misses[key] ?? 0) + 1;
      this.panel.setStatus(r.hintLevel >= 3 ? 'The sign is lit. Pick it.' : `Not ${CHORD_NAMES[attempt].toLowerCase()}. Listen again.`);
      playNote(r.step.refMidi - 12, { timbre: 'bass', duration: 0.25, gain: 0.25 });
      this.shake();
      return this.wait(700);
    }
    const midi = attempt;
    const dist = (((midi - r.step.refMidi) % 12) + 12) % 12;
    const target = r.step.targetMidi - r.step.refMidi;
    const dir = dist < target || (target === 12 && dist === 0) ? 'a little higher' : 'a little lower';
    const left = r.triesLeft;
    this.panel.setStatus(r.hintLevel >= 3 ? 'The note is marked on the ladder. Match it.' : left > 0 ? `Not that one. Try ${dir}. ${left} ${left === 1 ? 'try' : 'tries'} left before you hear it.` : `Not that one. Try ${dir}.`);
    playNote(midi, { timbre: 'bass', duration: 0.25, gain: 0.25 });
    this.shake();
    return this.wait(700);
  }

  private onDrillSolved(): void {
    const q = this.runner!.question;
    doorOpen(q.steps[0].refMidi);
    this.endPuzzle(true);
    if (this.practice && !progress.drilled.includes(this.practice.lesson)) {
      progress.drilled.push(this.practice.lesson);
    }
    const v = progress.voice;
    this.toast(v >= VOICE_DRILL_CAP ? `Practice done. Voice ${v} of ${VOICE_MAX}. Doors give the rest. Space: practise again.` : `Practice done. Voice ${v} of ${VOICE_MAX}. Space: practise again.`, 5000);
    saveProgress(progress);
  }

  private onSolved(d: DoorView): void {
    const q = this.runner!.question;
    if (this.resing) {
      doorOpen(q.steps[0].refMidi);
      this.later(500, () => playSequence(q.steps.map((s) => s.targetMidi).concat([q.steps[0].targetMidi + 12]), { timbre: 'bell', duration: 0.3, gap: 0.14, gain: 0.45 }));
      this.endPuzzle(true);
      this.toast('Sung again, note for note.');
      return;
    }
    d.solved = true;
    this.setVoice(VOICE_MAX);
    if (!progress.solved.includes(d.def.puzzle.id)) progress.solved.push(d.def.puzzle.id);
    const stars = Math.round(this.runner!.points / q.steps.length);
    progress.scores[d.def.puzzle.id] = stars;
    for (const t of d.def.tiles) this.grid.setBlocked(t.x, t.y, false);
    // The door sinks into the ground and is gone.
    for (const ms of d.tiles) for (const m of ms) this.slide(m, m.position.add(new Vector3(0, -1.8, 0)), 700, () => m.setEnabled(false));
    const t0 = d.def.tiles[0];
    if (d.def.puzzle.id === 'stage-song') {
      this.finishKingdom(d);
      return;
    }
    this.bloomAt(t0.x, t0.y, this.areaComplete() ? 1e9 : 14);
    this.doorMoment(d);
    doorOpen(q.steps[0].refMidi);
    this.later(700, () => playSequence(q.steps.map((s) => s.targetMidi).concat([q.steps[0].targetMidi + 12]), { timbre: 'bell', duration: 0.3, gap: 0.14, gain: 0.45 }));
    this.endPuzzle(true);
    const starText = '  ' + '★'.repeat(stars) + '☆'.repeat(3 - stars);
    this.toast((d.def.tiles.length > 1 ? 'The serpent lies down. A bridge.' : d.def.puzzle.id === 'jazz-boss' ? 'The band plays the whole set. The door is yours.' : 'The way opens.') + starText, 4000);
    saveProgress(progress);
  }

  /**
   * People and hero props whose files have arrived: public/character/index.json and public/props/index.json
   * list the models present (scripts/assets-index.mjs writes them), so nothing is fetched that is not there.
   */
  private async loadExtras(): Promise<void> {
    const list = async (url: string): Promise<Set<string>> => {
      try {
        const r = await fetch(url);
        return new Set(r.ok ? ((await r.json()) as string[]) : []);
      } catch {
        return new Set();
      }
    };
    const [people, props] = await Promise.all([list('character/index.json'), list('props/index.json')]);
    if (this.disposed) return;
    this.extrasLog.push(`index: ${[...people].join(',')} | ${[...props].join(',')}`);
    const place = (top: TransformNode, tile: { x: number; y: number }, scale: number, yaw: number) => {
      top.position.set(tile.x + 0.5, 0, tile.y + 0.5);
      top.scaling.setAll(scale);
      top.rotationQuaternion = null;
      top.rotation.y = yaw;
    };
    const world = (c: AssetContainer) => {
      // World materials, so they grey out and come back with the area.
      const fresh = new Set<Material>();
      for (const m of c.meshes) {
        const before = this.matCache.get(m.material!);
        toStandard(m, this.scene, this.matCache);
        if (!before && m.material) fresh.add(m.material);
        m.isPickable = false;
        m.receiveShadows = true;
        if (m.getTotalVertices() > 0) this.shadows.addShadowCaster(m, false);
      }
      for (const mat of fresh) if (this.lifeMap) new LifePlugin(mat, this.lifeMap);
    };
    const YAW: Record<string, number> = { south: 0, west: -Math.PI / 2, north: Math.PI, east: Math.PI / 2 };
    const stageTiles = new Set(this.area.entities.filter((e) => e.kind === 'stage').flatMap((e) => (e as { tiles: { x: number; y: number }[] }).tiles.map((t) => `${t.x},${t.y}`)));
    for (const e of this.area.entities) {
      if (e.kind === 'npc' && people.has(e.model)) {
        try {
          const c = await LoadAssetContainerAsync(`character/${e.model}.glb`, this.scene);
          if (this.disposed) return c.dispose();
          c.addAllToScene();
          world(c);
          const top = c.rootNodes[0] as TransformNode;
          // Tripo rigs face -Z (toward the camera at yaw 0), unlike the singer, whose own rig is turned in Player.ts.
          place(top, e.tile, e.scale ?? 1.3, YAW[e.face ?? 'south']);
          const baseY = stageTiles.has(`${e.tile.x},${e.tile.y}`) ? STAGE_H : 0;
          top.position.y = baseY;
          this.grid.setBlocked(e.tile.x, e.tile.y, true);
          const idle = c.animationGroups.find((g) => /idle/i.test(g.name)) ?? c.animationGroups[0] ?? null;
          const action = c.animationGroups.find((g) => g !== idle) ?? null;
          for (const g of c.animationGroups) {
            g.start(true, 1.0);
            g.setWeightForAllAnimatables(g === idle ? 1 : 0);
          }
          const part = (Object.keys(BAND) as BandPart[]).find((k) => BAND[k].model === e.model);
          const at = part ? BAND[part].at : null;
          const sparks = at ? sparkler(this.scene, new Vector3(top.position.x + at[0], baseY + at[1], top.position.z + at[2]), this.palette.accent) : null;
          this.npcs.push({ def: e, top, baseY, idle, action, acting: false, sway: 0, phase: Math.random() * 6.28, frozen: false, hitAt: -1e9, hitUntil: 0, hitStrong: false, sparks, restYaw: top.rotation.y });
          this.extrasLog.push(`npc ${e.model} loaded`);
        } catch (err) {
          this.extrasLog.push(`npc ${e.model} failed: ${String(err).slice(0, 120)}`);
          console.warn(`character ${e.model} did not load`, err);
        }
      } else if (e.kind === 'prop' && props.has(e.model)) {
        try {
          const c = await LoadAssetContainerAsync(`props/${e.model}.glb`, this.scene);
          if (this.disposed) return c.dispose();
          c.addAllToScene();
          world(c);
          place(c.rootNodes[0] as TransformNode, e.tile, e.scale ?? 1, ((e.turn ?? 0) * Math.PI) / 2);
          if (!e.walkable) this.grid.setBlocked(e.tile.x, e.tile.y, true);
          this.extrasLog.push(`prop ${e.model} loaded`);
        } catch (err) {
          this.extrasLog.push(`prop ${e.model} failed: ${String(err).slice(0, 120)}`);
          console.warn(`prop ${e.model} did not load`, err);
        }
      }
    }
  }

  /**
   * Each person: crossfade between idle and their action clip as their door starts and stops being sung.
   * People exported without clips (the instrument players, whose instrument is part of the mesh and would
   * not follow retargeted arms) get a whole-body sway instead: a small bounce and lean in time, stronger
   * while their door is sung.
   *
   * The Jazz Quarter's band is the exception. Frozen (no sway, clips paused) until the Band Stand is
   * reached, like the rest of a silent kingdom; awake from then on, and every note they play (a chord
   * question, the vamp, a lick) lands as a cue: a pop of scale, sparks over the instrument, and for the
   * trumpeter the playing clip for the length of the note.
   */
  private updateNpcs(dt: number, timeMs: number): void {
    const k = Math.min(1, dt * 5);
    const now = performance.now();
    const awake = this.bandAwake();
    for (const n of this.npcs) {
      const band = this.area.id === 'jazz' && this.bandPart(n.def.model) !== null;
      const frozen = band && !awake;
      if (frozen !== n.frozen) {
        n.frozen = frozen;
        for (const g of [n.idle, n.action]) {
          if (!g) continue;
          if (!frozen) g.play(true);
          else {
            // Frozen partway into the clip: the first frame is the rig's rest pose, arms out.
            g.pause();
            g.goToFrame(g.from + (g.to - g.from) * 0.45);
          }
        }
        if (!frozen && n.sparks) n.sparks.manualEmitCount = 24;
      }
      const base = n.def.scale ?? 1.3;
      const since = (now - n.hitAt) / 1000;
      const pop = since < 0.6 ? Math.exp(-since * 9) * (n.hitStrong ? 0.1 : 0.05) : 0;
      n.top.scaling.setAll(base * (1 + pop));
      // People on the ground turn to the singer when she is near and back to their resting facing when
      // she goes; performers on a stage keep facing the audience. Yaw 0 faces south (+z), yaw grows eastward (checked in screenshots).
      if (n.baseY === 0) {
        const dx = this.player.x - n.top.position.x;
        const dz = this.player.z - n.top.position.z;
        const goal = Math.hypot(dx, dz) < 3.5 ? Math.atan2(dx, dz) : n.restYaw;
        const d = goal - n.top.rotation.y;
        n.top.rotation.y += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 4);
      }
      if (frozen) continue;
      const hit = now < n.hitUntil;
      const live = band ? awake : !!n.def.door && (n.def.door === this.activeDoor || (progress.finished && n.def.door === 'stage-song'));
      if (!n.idle && !n.action) {
        n.sway += ((live ? 1 : 0.25) - n.sway) * Math.min(1, dt * 2);
        const t = timeMs / 1000 * (live ? 3.6 : 1.6) + n.phase;
        const s = base * 0.012 * n.sway;
        n.top.position.y = n.baseY + Math.abs(Math.sin(t)) * s * 4 + (hit ? 0.03 : 0);
        n.top.rotation.z = Math.sin(t * 0.5) * 0.05 * n.sway;
        continue;
      }
      const want = !!n.action && (band ? hit || now < n.hitUntil + 350 : live);
      if (want === n.acting && !n.action) continue;
      n.acting = want;
      const w = n.action?.animatables[0]?.weight ?? 0;
      const target = want ? 1 : 0;
      if (n.action && Math.abs(target - w) > 0.001) {
        n.action.setWeightForAllAnimatables(w + (target - w) * k);
        n.idle?.setWeightForAllAnimatables(1 - (w + (target - w) * k));
      }
    }
  }

  private bandPart(model: string): BandPart | null {
    return (Object.keys(BAND) as BandPart[]).find((p) => BAND[p].model === model) ?? null;
  }

  /** The Jazz Quarter's band wakes when the Band Stand is sung at, and stays awake once it is open. */
  private bandAwake(): boolean {
    return progress.solved.includes('jazz-bandstand') || this.activeDoor === 'jazz-bandstand' || this.activeDoor === 'jazz-boss';
  }

  /** A note is about to sound from one of the band: move that player when it does. */
  private onBandCue(c: BandCue): void {
    const n = this.npcs.find((p) => p.def.model === BAND[c.part].model);
    if (!n || (this.area.id === 'jazz' && !this.bandAwake())) return;
    this.later(Math.max(0, (c.at - AudioEngine.get().now) * 1000), () => {
      n.hitAt = performance.now();
      n.hitUntil = n.hitAt + Math.max(160, c.dur * 1000);
      n.hitStrong = c.strong;
      if (n.sparks) n.sparks.manualEmitCount = c.strong ? 18 : 6;
    });
  }

  /** After a right answer in the quarter: the horn answers with the chord's five, three, one, over a bass turn. */
  private bandLick(step: Step): void {
    const engine = AudioEngine.get();
    const t0 = engine.now + 0.9;
    const spec = step.spec;
    const quality = spec.kind === 'chordTone' || spec.kind === 'chordName' ? spec.quality : 'maj7';
    const tones = CHORD_TONES[quality];
    const root = step.refMidi;
    [tones[2], tones[1], tones[0]].forEach((o, i) => {
      const dur = i === 2 ? 0.55 : 0.16;
      playNote(root + 12 + o, { timbre: 'horn', at: t0 + i * 0.18, duration: dur, gain: 0.28 });
      bandCue('horn', t0 + i * 0.18, dur, i === 2);
    });
    playNote(root - 24 + 7, { timbre: 'bass', at: t0, duration: 0.16, gain: 0.22 });
    playNote(root - 24, { timbre: 'bass', at: t0 + 0.36, duration: 0.6, gain: 0.26 });
    bandCue('bass', t0, 0.16);
    bandCue('bass', t0 + 0.36, 0.6, true);
    bandCue('drums', t0, 0.1);
    bandCue('drums', t0 + 0.36, 0.1, true);
  }

  /**
   * The area's recorded piece, or the synth where the music is part of the play: the quarter's band
   * once it is on stage, the stage once the song has been given back, and any area whose piece is missing.
   */
  private startMusic(): void {
    const band = this.area.id === 'jazz' && progress.solved.includes('jazz-bandstand');
    const synth = () => MusicPlayer.get().play(this.area.id, progress.finished, band);
    const piece = band || (this.area.id === 'stage' && progress.finished) ? null : AREA_PIECE[this.area.id];
    if (!piece) {
      Tracks.get().stopArea();
      synth();
      return;
    }
    MusicPlayer.get().stop();
    void Tracks.get().playArea(piece).then((ok) => {
      if (!ok && !this.disposed && !this.runner) synth();
    });
  }

  /** Music back after a puzzle or lesson; in the quarter it may now be the band's vamp. */
  private resumeMusic(): void {
    this.startMusic();
    MusicPlayer.get().setPaused(false);
    Tracks.get().setPaused(false);
  }

  /** The moment a door opens: a shower of sparks from the frame, the camera leans in, the singer holds the note, the music swells. */
  private doorMoment(d: DoorView): void {
    const accent = this.palette.accent;
    const now = performance.now();
    const t = d.def.tiles[Math.floor(d.def.tiles.length / 2)];
    this.focus = { x: t.x + 0.5, z: t.y + 0.5, until: now + 1600 };
    this.celebrateUntil = now + 1900;
    const at = new Vector3(t.x + 0.5, 1.2, t.y + 0.5);
    burst(this.scene, at, accent, { count: 140, life: 1.4, speed: 2.2, gravity: 3, lift: new Vector3(0, 3.5, 0), color2: 0xfff2c0 });
    this.later(350, () => burst(this.scene, at.add(new Vector3(0, 0.4, 0)), accent, { count: 60, life: 1.0, speed: 1.6, gravity: 2, lift: new Vector3(0, 2.5, 0), size: 0.1 }));
    this.later(1900, () => MusicPlayer.get().swell(1.5, 3200));
  }

  private endPuzzle(solved: boolean): void {
    this.runner?.abort();
    this.runner = null;
    this.drilling = false;
    this.resing = false;
    this.panel.hide();
    this.later(solved ? 2500 : 0, () => {
      if (!this.runner) this.activeDoor = null;
    });
    AudioEngine.get().setDuck(1);
    this.later(solved ? 1800 : 300, () => {
      if (!this.runner) this.resumeMusic();
    });
  }

  // ---------- pickups, exits, gates ----------

  flags(): Set<string> {
    const flags = new Set<string>();
    if (AREAS.valley.entities.filter((e) => e.kind === 'door').every((e) => progress.solved.includes((e as DoorDef).puzzle.id)) && progress.solved.includes('fragment-valley')) flags.add('valley-complete');
    if (progress.solved.includes('fragment-town')) flags.add('town-complete');
    if (progress.fragments >= 3) flags.add('all-fragments');
    return flags;
  }

  private refreshGates(instant = false): void {
    const flags = this.flags();
    for (const g of this.gates) {
      const open = flags.has(g.def.flag);
      if (open !== g.open) {
        g.open = open;
        for (const t of g.def.tiles) this.grid.setBlocked(t.x, t.y, !open);
        for (const ms of g.tiles) {
          for (const m of ms) {
            if (open && instant) m.setEnabled(false);
            else if (open) this.slide(m, m.position.add(new Vector3(0, -1.6, 0)), 900, () => m.setEnabled(false));
          }
        }
      }
    }
  }

  private checkPickup(): void {
    const f = this.fragment;
    if (!f) return;
    if (Math.hypot(f.position.x - this.player.x, f.position.z - this.player.z) < 0.7) {
      const e = this.area.entities.find((x) => x.kind === 'fragment');
      if (e && e.kind === 'fragment' && !progress.solved.includes(e.id)) {
        progress.solved.push(e.id);
        progress.fragments++;
        this.setVoice(VOICE_MAX);
        saveProgress(progress);
      }
      this.fragment = null;
      this.slide(f, f.position.add(new Vector3(0, 1.4, 0)), 700, () => f.dispose());
      playSequence([64, 67, 71, 76], { timbre: 'bell', duration: 0.3, gap: 0.12, gain: 0.5 });
      const lines: Record<string, string> = {
        valley: 'A melody fragment. Your voice has grown: the valley is yours.',
        town: 'A melody fragment. The town keeps its key, and so do you.',
        jazz: 'The last fragment. The quarter plays again, and the stage is waiting.',
      };
      this.toast(lines[this.area.id] ?? 'A melody fragment.', 4000);
      this.bloomAt(this.playerTile().x, this.playerTile().y, 1e9);
      this.hud.refresh();
      this.refreshGates();
    }
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

  // ---------- loop ----------

  /** Called every frame by the app. dt in seconds, timeMs from performance.now(). */
  update(dt: number, timeMs: number): void {
    if (!this.ready || this.disposed) return;
    if (this.aoCheck) this.checkAo(dt, timeMs);

    // Voice.
    let hz: number | null = null;
    if (mic?.isLive) hz = mic.read().hz;
    const midiNow = hz ? hzToMidi(hz) : null;
    this.voiceMidi = midiNow === null ? null : this.voiceMidi === null ? midiNow : this.voiceMidi + (midiNow - this.voiceMidi) * 0.35;
    if (this.runner) {
      this.runner.feedVoice(timeMs < this.voiceMuteUntil ? null : hz, timeMs);
      this.panel.update(this.voiceMidi);
    }
    if (this.mapView.visible) {
      const flags = this.flags();
      this.mapView.update(progress, this.playerTile(), (f) => flags.has(f), timeMs);
    }

    // Movement.
    const k = this.keys;
    let dx = 0;
    let dz = 0;
    if (!this.inputLocked) {
      if (k.has('ArrowLeft') || k.has('KeyA')) dx -= 1;
      if (k.has('ArrowRight') || k.has('KeyD')) dx += 1;
      if (k.has('ArrowUp') || k.has('KeyW')) dz -= 1;
      if (k.has('ArrowDown') || k.has('KeyS')) dz += 1;
    }
    const moving = dx !== 0 || dz !== 0;
    // The camera leads into the walk by about a tile and settles back when the player stops.
    const ahead = moving ? new Vector3(dx * 1.3, 0, dz * 1.3) : Vector3.Zero();
    this.lookAhead.addInPlace(ahead.subtract(this.lookAhead).scale(Math.min(1, dt * 2.2)));
    if (moving) {
      if (dx && dz) (dx *= Math.SQRT1_2), (dz *= Math.SQRT1_2);
      const step = WALK_SPEED * dt;
      const r = this.grid.move(this.player.x, this.player.z, dx * step, dz * step);
      this.player.setPosition(r.x, r.z);
      this.player.face(dx, dz);
      if (r.hit) this.bump(r.hit);
      this.checkPickup();
      this.checkExit();
    }
    this.player.setMoving(moving);
    this.player.setSinging((!!this.runner && this.runner.phase === 'listening') || timeMs < this.celebrateUntil);
    if (this.walkTo && !moving) {
      // The finale: the singer walks to centre stage on their own.
      const ddx = this.walkTo.x - this.player.x;
      const ddz = this.walkTo.z - this.player.z;
      const dist = Math.hypot(ddx, ddz);
      if (dist < 0.08) {
        this.walkTo = null;
        this.player.face(0, 1); // to the audience
      } else {
        const step = Math.min(dist, WALK_SPEED * 0.8 * dt);
        this.player.setPosition(this.player.x + (ddx / dist) * step, this.player.z + (ddz / dist) * step);
        this.player.face(ddx, ddz);
        this.player.setMoving(true);
        if (this.player.update(dt, timeMs)) footstep();
        this.placeCamera(Math.min(1, dt * 6));
        return;
      }
    }
    if (this.player.update(dt, timeMs)) footstep();

    // What Space would do here.
    if (!this.inputLocked) {
      const d = this.nearestDoor();
      if (d) {
        const t = d.def.tiles[0];
        this.placeBubble(t.x + 0.5, d.solved ? 1.0 : 1.7, t.y + 0.5);
        this.hud.setHint(d.solved ? 'Space: sing this door again' : 'Space: listen to the door');
      } else if (this.practice && this.nearPractice()) {
        const t = this.practice.tile;
        this.placeBubble(t.x + 0.5, 1.2, t.y + 0.5);
        this.hud.setHint('Space: practise here');
      } else {
        this.bubble.classList.add('hidden');
        this.hud.setHint(this.area.id === 'hub' && progress.solved.length === 0 ? 'Arrow keys or WASD to walk. Find the humming door.  M: map' : 'M: map');
      }
    } else this.bubble.classList.add('hidden');

    // Animations.
    for (const a of this.anims) {
      const t = Math.min(1, (timeMs - a.t0) / a.dur);
      const e = t * t * (3 - 2 * t);
      a.mesh.position.copyFrom(Vector3.Lerp(a.from, a.to, e));
      if (t >= 1) a.onDone?.();
    }
    this.anims = this.anims.filter((a) => timeMs - a.t0 < a.dur);
    if (this.fragment) {
      this.fragmentT += dt;
      this.fragment.position.y = 0.7 + Math.sin(this.fragmentT * 2.2) * 0.12;
      this.fragment.rotation.y += dt * 1.4;
    }
    if (this.water) this.water.time = timeMs / 1000;
    if (this.glow) this.glow.emissiveColor = this.glowBase.scale(0.55 + 0.45 * Math.sin(timeMs / 420));
    this.updateNpcs(dt, timeMs);
    this.updateColour(dt * 1000, timeMs);
    MusicPlayer.get().setLife(this.areaLife());
    Tracks.get().setLife(this.areaLife());
    this.placeCamera(Math.min(1, dt * 6));
  }

  private placeBubble(x: number, y: number, z: number): void {
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    const p = Vector3.Project(new Vector3(x, y, z), Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(w, h));
    this.bubble.style.left = `${(p.x / w) * window.innerWidth}px`;
    this.bubble.style.top = `${(p.y / h) * window.innerHeight}px`;
    this.bubble.classList.remove('hidden');
  }

  /**
   * Ambient occlusion costs a second geometry pass and a few screen-sized passes. After the world has
   * settled, the average frame time over about three seconds decides: below 40 frames a second, it goes,
   * for this area and the rest of the session.
   */
  private checkAo(dt: number, timeMs: number): void {
    const c = this.aoCheck!;
    if (timeMs < c.startAt || document.hidden) return;
    c.frames++;
    c.ms += dt * 1000;
    if (c.ms < 3000) return;
    this.aoCheck = null;
    if (c.ms / c.frames > 1000 / 40 && this.ssao) {
      this.ssao.dispose();
      this.ssao = null;
      sessionStorage.setItem(AO_KEY, 'off');
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.runner?.abort();
    this.runner = null;
    this.panel.hide();
    this.bubble.remove();
    setBandListener(null);
    MusicPlayer.get().stop();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    this.scene.dispose();
  }
}

import Phaser from 'phaser';
import { AudioEngine } from '../audio/engine';
import { MusicPlayer } from '../audio/music';
import { doorOpen, footstep, gateLocked, panelOpen } from '../audio/sfx';
import { playCadence, playChord, playNote, playSequence } from '../audio/synth';
import type { MicPitchDetector } from '../ear/pitchDetector';
import { hzToMidi } from '../ear/pitchMath';
import { pipeForCode } from '../ear/pipes';
import { VOICE_AFTER_QUIET, VOICE_DRILL_CAP, VOICE_MAX, progress, saveProgress } from '../state';
import { AREAS, type AreaDef, type DoorDef, type GateDef, type PracticeDef } from '../world/areas';
import { LESSONS, type Demo, type LessonPage } from '../world/lessons';
import { LessonOverlay } from '../ui/LessonOverlay';
import { GREY, PALETTES, lerpColor, type Palette } from '../world/palette';
import { PuzzleRunner } from '../world/puzzleRunner';
import { CHORD_NAMES, CHORD_QUALITIES, CHORD_TONES, makeQuestion, type ChordQuality, type PuzzleSpec, type Step } from '../world/puzzles';
import { TILE, ensureTextures } from '../world/textures';
import { PuzzlePanel } from '../ui/PuzzlePanel';
import { MapOverlay } from '../ui/MapOverlay';

const FONT = 'Georgia, "Times New Roman", serif';

interface TileView {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  kind: string;
  life: number;
  target: number;
}

interface Bloom {
  cx: number;
  cy: number;
  t0: number;
  speed: number; // tiles per second
  max: number;
}

interface DoorView {
  def: DoorDef;
  imgs: Phaser.GameObjects.Image[];
  solved: boolean;
}

interface GateView {
  def: GateDef;
  imgs: Phaser.GameObjects.Image[];
  open: boolean;
}

export interface WorldData {
  area?: string;
  at?: { x: number; y: number };
}

export class WorldScene extends Phaser.Scene {
  private area!: AreaDef;
  private palette!: Palette;
  private blocked: boolean[][] = [];
  private tiles: TileView[] = [];
  private tileAt = new Map<string, TileView>();
  private blooms: Bloom[] = [];
  private doors: DoorView[] = [];
  private gates: GateView[] = [];
  private player!: Phaser.GameObjects.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private panel!: PuzzlePanel;
  private mapView!: MapOverlay;
  private lessonView!: LessonOverlay;
  private practice: { def: PracticeDef; img: Phaser.GameObjects.Image } | null = null;
  /** True while a bench drill runs: misses are free and right answers restore voice. */
  private drilling = false;
  private hudVoice!: Phaser.GameObjects.Graphics;
  private voiceFlashUntil = 0;
  /** The mic is ignored until this time after a key sounds, so a speaker cannot answer for the player. */
  private voiceMuteUntil = 0;
  private runner: PuzzleRunner | null = null;
  private mic: MicPitchDetector | null = null;
  private voiceMidi: number | null = null;
  private hudFragments!: Phaser.GameObjects.Text;
  private hudHint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private toastUntil = 0;
  private promptBubble!: Phaser.GameObjects.Text;
  private fragment: Phaser.GameObjects.Image | null = null;
  private walkPhase = 0;
  private transitioning = false;

  constructor() {
    super('world');
  }

  create(data: WorldData): void {
    // scene.restart() reuses this instance, so per-area collections must be reset here.
    this.tiles = [];
    this.tileAt = new Map();
    this.blooms = [];
    this.doors = [];
    this.gates = [];
    this.fragment = null;
    this.practice = null;
    this.drilling = false;
    this.runner = null;
    this.transitioning = false;
    this.voiceMidi = null;
    this.input.keyboard?.removeAllListeners('keydown');
    ensureTextures(this);
    this.mic = (this.registry.get('mic') as MicPitchDetector | undefined) ?? null;
    const areaId = data.area ?? progress.area ?? 'hub';
    this.area = AREAS[areaId] ?? AREAS.hub;
    this.palette = PALETTES[this.area.palette];
    progress.area = this.area.id;

    this.buildTiles();
    this.buildEntities();

    const at = data.at ?? (progress.area === this.area.id && progress.x > 0 ? { x: progress.x, y: progress.y } : this.area.start);
    this.player = this.add.image(at.x * TILE + TILE / 2, at.y * TILE + TILE / 2 + 4, 'player').setDepth(10).setTint(this.palette.accent);

    const w = this.area.map[0].length * TILE;
    const h = this.area.map.length * TILE;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, w, h);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setBackgroundColor(GREY.sky);
    cam.fadeIn(500, 0, 0, 0);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN]);
    kb.on('keydown', (ev: KeyboardEvent) => this.onKeyDown(ev));

    this.panel = new PuzzlePanel(this, this.palette);
    this.mapView = new MapOverlay(this);
    this.lessonView = new LessonOverlay(this, this.palette);
    this.lessonView.onHear = (page) => this.playDemo(page);
    this.lessonView.onDrill = () => this.startDrill();
    this.lessonView.onLeave = () => this.lessonView.hide();
    this.buildHud();

    // Restore life for already-solved doors instantly.
    for (const d of this.doors) if (d.solved) this.blooms.push({ cx: d.def.tiles[0].x, cy: d.def.tiles[0].y, t0: -1e9, speed: 1e9, max: 14 });
    if (this.areaComplete() || progress.finished) this.blooms.push({ cx: 0, cy: 0, t0: -1e9, speed: 1e9, max: 1e9 });
    this.refreshGates();
    saveProgress(progress);
    MusicPlayer.get().play(this.area.id, progress.finished);
    MusicPlayer.get().setLife(this.areaLife());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => MusicPlayer.get().stop());
    if (import.meta.env.DEV) (window as unknown as { __lk: unknown }).__lk = this;
  }

  // ---------- building ----------

  private buildTiles(): void {
    const map = this.area.map;
    this.blocked = map.map((row) => [...row].map((c) => c === '#' || c === '~' || c === 'T' || c === 'D' || c === 'G'));
    map.forEach((row, y) => {
      [...row].forEach((c, x) => {
        let key = 'tile-ground';
        let kind = 'ground';
        if (c === '#') (key = 'tile-wall'), (kind = 'wall');
        else if (c === '~') (key = 'tile-water'), (kind = 'water');
        else if (c === 'T') (key = 'tile-tree'), (kind = 'tree');
        else if (c === '=') (key = 'tile-bridge'), (kind = 'bridge');
        else if ((x * 7 + y * 13) % 5 === 0) key = 'tile-ground-alt';
        const img = this.add.image(x * TILE, y * TILE, key).setOrigin(0).setDepth(kind === 'tree' ? 5 : 0);
        const tv: TileView = { img, x, y, kind, life: 0, target: 0 };
        this.applyTint(tv);
        this.tiles.push(tv);
        this.tileAt.set(`${x},${y}`, tv);
      });
    });
  }

  private buildEntities(): void {
    for (const e of this.area.entities) {
      if (e.kind === 'door') {
        const solved = progress.solved.includes(e.puzzle.id);
        const imgs = e.tiles.map((t, i) => {
          const base = this.tileAt.get(`${t.x},${t.y}`)!;
          base.img.setTexture(this.openTextureFor(e));
          const img = this.add.image(t.x * TILE, t.y * TILE, e.texture ?? 'door-closed').setOrigin(0).setDepth(6).setVisible(!solved);
          if (e.texture === 'serpent') img.setScale(1).setAngle(i === 1 ? 0 : 0);
          return img;
        });
        if (solved) for (const t of e.tiles) this.blocked[t.y][t.x] = false;
        this.doors.push({ def: e, imgs, solved });
      } else if (e.kind === 'gate') {
        const imgs = e.tiles.map((t) => {
          const base = this.tileAt.get(`${t.x},${t.y}`)!;
          base.img.setTexture('tile-ground');
          return this.add.image(t.x * TILE, t.y * TILE, 'door-closed').setOrigin(0).setDepth(6);
        });
        this.gates.push({ def: e, imgs, open: false });
      } else if (e.kind === 'practice') {
        this.blocked[e.tile.y][e.tile.x] = true;
        const img = this.add.image(e.tile.x * TILE, e.tile.y * TILE, 'practice').setOrigin(0).setDepth(6);
        this.practice = { def: e, img };
      } else if (e.kind === 'fragment') {
        if (!progress.solved.includes(e.id)) {
          this.fragment = this.add.image(e.tile.x * TILE + TILE / 2, e.tile.y * TILE + TILE / 2, 'fragment').setDepth(7).setTint(this.palette.accent);
          this.add.image(e.tile.x * TILE + TILE / 2, e.tile.y * TILE + TILE / 2, 'glow').setDepth(6).setTint(this.palette.accent).setScale(1.6);
          this.tweens.add({ targets: this.fragment, y: this.fragment.y - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        }
      }
    }
  }

  private openTextureFor(d: DoorDef): string {
    if (d.texture === 'serpent') return 'tile-bridge';
    if (d.texture === 'tile-tree') return 'tile-ground';
    return 'door-open';
  }

  private buildHud(): void {
    const style = { fontFamily: FONT, fontSize: '18px', color: '#f6efe2' };
    this.add.text(20, 14, this.area.name, style).setScrollFactor(0).setDepth(50);
    this.hudFragments = this.add.text(this.scale.width - 20, 14, '', style).setOrigin(1, 0).setScrollFactor(0).setDepth(50);
    this.add.text(20, 42, 'Voice', { ...style, fontSize: '13px', color: '#b9b2a6' }).setScrollFactor(0).setDepth(50);
    this.hudVoice = this.add.graphics().setScrollFactor(0).setDepth(50);
    this.hudHint = this.add.text(this.scale.width / 2, this.scale.height - 22, '', { ...style, fontSize: '15px', color: '#d9d2c4' }).setOrigin(0.5).setScrollFactor(0).setDepth(50);
    this.toast = this.add
      .text(this.scale.width / 2, this.scale.height - 60, '', { ...style, fontSize: '17px', backgroundColor: '#15141aee', padding: { x: 14, y: 8 }, wordWrap: { width: 700 }, align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(60)
      .setVisible(false);
    this.promptBubble = this.add.text(0, 0, 'Space', { fontFamily: FONT, fontSize: '13px', color: '#15141a', backgroundColor: '#f6efe2', padding: { x: 6, y: 2 } }).setOrigin(0.5, 1).setDepth(20).setVisible(false);
    this.updateHud();
  }

  private updateHud(): void {
    this.hudFragments.setText(`Melody fragments  ${progress.fragments} / 3`);
    this.drawVoice();
  }

  /** Five notes under the area name: filled while you have them, hollow once spent. */
  private drawVoice(): void {
    const g = this.hudVoice;
    g.clear();
    const flashing = this.time.now < this.voiceFlashUntil && Math.floor(this.time.now / 90) % 2 === 0;
    for (let i = 0; i < VOICE_MAX; i++) {
      const x = 72 + i * 20;
      const y = 50;
      const have = i < progress.voice;
      const colour = flashing && i === progress.voice ? 0xe06c75 : this.palette.accent;
      if (have) {
        g.fillStyle(colour, 1).fillEllipse(x, y + 3, 11, 8);
        g.fillRect(x + 3, y - 9, 2, 12);
      } else {
        g.lineStyle(1.5, flashing && i === progress.voice ? 0xe06c75 : 0x6e6878, 1).strokeEllipse(x, y + 3, 11, 8);
      }
    }
  }

  private setVoice(v: number): void {
    progress.voice = Math.max(0, Math.min(VOICE_MAX, v));
    this.drawVoice();
    saveProgress(progress);
  }

  private showToast(text: string, ms = 3200): void {
    this.toast.setText(text).setVisible(true);
    this.toastUntil = this.time.now + ms;
  }

  // ---------- colour ----------

  private applyTint(tv: TileView): void {
    const grey = tv.kind === 'wall' ? GREY.wall : tv.kind === 'water' ? GREY.water : tv.kind === 'tree' ? GREY.tree : tv.kind === 'bridge' ? GREY.bridge : GREY.ground;
    const p = this.palette;
    const col = tv.kind === 'wall' ? p.wall : tv.kind === 'water' ? p.water : tv.kind === 'tree' ? p.tree : tv.kind === 'bridge' ? p.bridge : p.ground;
    tv.img.setTint(lerpColor(grey, col, tv.life));
  }

  private areaLife(): number {
    const doors = this.doors.length || 1;
    return this.doors.filter((d) => d.solved).length / doors;
  }

  private areaComplete(): boolean {
    return this.doors.every((d) => d.solved);
  }

  private updateColour(dt: number): void {
    const now = this.time.now;
    for (const b of this.blooms) {
      const r = Math.min(b.max, ((now - b.t0) / 1000) * b.speed);
      for (const tv of this.tiles) {
        if (tv.target >= 1) continue;
        const dx = tv.x - b.cx;
        const dy = tv.y - b.cy;
        if (dx * dx + dy * dy <= r * r) tv.target = 1;
      }
    }
    this.blooms = this.blooms.filter((b) => ((now - b.t0) / 1000) * b.speed < b.max + 1);
    const k = Math.min(1, dt / 220);
    for (const tv of this.tiles) {
      if (Math.abs(tv.target - tv.life) < 0.004) continue;
      tv.life += (tv.target - tv.life) * k;
      this.applyTint(tv);
    }
    this.cameras.main.setBackgroundColor(lerpColor(GREY.sky, this.palette.sky, this.areaLife()));
    for (const d of this.doors) for (const img of d.imgs) img.setTint(lerpColor(GREY.accent, this.palette.accent, d.solved ? 1 : 0.35 + 0.65 * this.areaLife()));
    for (const g of this.gates) for (const img of g.imgs) img.setTint(g.open ? this.palette.accent : lerpColor(GREY.wall, this.palette.wall, this.areaLife()));
  }

  private bloomAt(x: number, y: number, max = 14): void {
    this.blooms.push({ cx: x, cy: y, t0: this.time.now, speed: 9, max });
  }

  // ---------- movement ----------

  private isBlocked(px: number, py: number): boolean {
    const x = Math.floor(px / TILE);
    const y = Math.floor(py / TILE);
    return this.blocked[y]?.[x] ?? true;
  }

  private tryMove(dx: number, dy: number): void {
    // Feet box: 18 wide, 10 tall, centred at the player's base.
    const hw = 9;
    const top = 2;
    const bottom = 11;
    const p = this.player;
    const nx = p.x + dx;
    if (dx !== 0 && !this.isBlocked(nx - hw, p.y + top) && !this.isBlocked(nx + hw, p.y + top) && !this.isBlocked(nx - hw, p.y + bottom) && !this.isBlocked(nx + hw, p.y + bottom)) p.x = nx;
    else if (dx !== 0) this.bump(p.x + Math.sign(dx) * (hw + 2), p.y + 7);
    const ny = p.y + dy;
    if (dy !== 0 && !this.isBlocked(p.x - hw, ny + top) && !this.isBlocked(p.x + hw, ny + top) && !this.isBlocked(p.x - hw, ny + bottom) && !this.isBlocked(p.x + hw, ny + bottom)) p.y = ny;
    else if (dy !== 0) this.bump(p.x, ny + (dy > 0 ? bottom + 2 : top - 2));
  }

  private lastBump = 0;
  private bump(px: number, py: number): void {
    if (this.time.now - this.lastBump < 1200) return;
    const x = Math.floor(px / TILE);
    const y = Math.floor(py / TILE);
    for (const g of this.gates) {
      if (!g.open && g.def.tiles.some((t) => t.x === x && t.y === y)) {
        this.lastBump = this.time.now;
        gateLocked();
        this.showToast(g.def.lockedLine);
        playNote(45, { timbre: 'bass', duration: 0.2, gain: 0.3 });
      }
    }
  }

  private playerTile(): { x: number; y: number } {
    return { x: Math.floor(this.player.x / TILE), y: Math.floor((this.player.y + 7) / TILE) };
  }

  private nearestDoor(): DoorView | null {
    const pt = this.playerTile();
    let best: DoorView | null = null;
    let bestD = 2.2;
    for (const d of this.doors) {
      if (d.solved) continue;
      for (const t of d.def.tiles) {
        const dist = Math.hypot(t.x - pt.x, t.y - pt.y);
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
    const t = this.practice.def.tile;
    return Math.hypot(t.x - pt.x, t.y - pt.y) < 2.2;
  }

  // ---------- practice ----------

  private openLesson(): void {
    const p = this.practice;
    if (!p) return;
    const lesson = LESSONS[p.def.lesson];
    if (!lesson) return;
    void AudioEngine.get().unlock();
    panelOpen();
    this.lessonView.setPalette(this.palette);
    this.lessonView.show(lesson);
    this.hudHint.setText('');
  }

  /** Play a lesson page's sound. */
  private playDemo(page: LessonPage): void {
    const d: Demo | undefined = page.demo;
    if (!d) return;
    const engine = AudioEngine.get();
    const base = 60;
    let t = engine.now + 0.06;
    if (d.cadence) t = playCadence(base, { at: t, speed: 1 }) + 0.3;
    if (d.notes) t = playSequence(d.notes.map((o) => base + o), { timbre: d.timbre ?? 'pipe', at: t, duration: Math.min(0.7, (d.gap ?? 0.42) * 0.9), gap: d.gap ?? 0.42, gain: 0.5 });
    if (d.chord) t = playChord(d.chord.map((o) => base + o), { timbre: d.timbre ?? 'pad', at: t, duration: 1.4, gain: 0.8 });
    if (d.chords) {
      for (const c of d.chords) {
        playNote(base - 12 + c[0], { timbre: 'bass', at: t, duration: (d.gap ?? 1.1) * 0.95, gain: 0.3 });
        playChord(c.map((o) => base + o), { timbre: d.timbre ?? 'pad', at: t, duration: (d.gap ?? 1.1) * 0.95, gain: 0.8 });
        t += d.gap ?? 1.1;
      }
    }
  }

  private startDrill(): void {
    const p = this.practice;
    if (!p) return;
    const lesson = LESSONS[p.def.lesson];
    this.lessonView.hide();
    void this.startPuzzle(null, lesson.drill);
  }

  /** The voice ran out: the door closes and the player wakes at the bench with a little voice back. */
  private goQuiet(): void {
    const p = this.practice;
    progress.quiets = (progress.quiets ?? 0) + 1;
    this.endPuzzle(false);
    this.setVoice(VOICE_AFTER_QUIET);
    this.transitioning = true;
    playSequence([52, 48, 45], { timbre: 'bass', duration: 0.5, gap: 0.3, gain: 0.35 });
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.time.delayedCall(950, () => {
      if (p) this.player.setPosition(p.def.at.x * TILE + TILE / 2, p.def.at.y * TILE + TILE / 2 + 4);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.cameras.main.fadeIn(700, 0, 0, 0);
      this.transitioning = false;
      this.showToast(p ? 'Your voice gave out. You wake at the practice bench. Space: a lesson and a free drill to get it back.' : 'Your voice gave out. Rest a moment.', 6000);
    });
  }

  // ---------- puzzles ----------

  private onKeyDown(ev: KeyboardEvent): void {
    if (ev.repeat) return;
    if (this.mapView.visible) {
      if (ev.code === 'KeyM' || ev.code === 'Escape' || ev.code === 'Space') this.mapView.hide();
      return;
    }
    if (this.lessonView.visible) {
      if (ev.code === 'Escape') this.lessonView.hide();
      else if (ev.code === 'Space') {
        ev.preventDefault();
        this.lessonView.hear();
      } else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') this.lessonView.go(1);
      else if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') this.lessonView.go(-1);
      else if (ev.code === 'Enter') this.startDrill();
      return;
    }
    if (!this.runner && ev.code === 'KeyM') {
      this.mapView.show(this.area);
      return;
    }
    if (this.runner) {
      if (ev.code === 'Space') {
        ev.preventDefault();
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
      ev.preventDefault();
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
    this.voiceMuteUntil = this.time.now + 700;
    this.panel.flashPipe(midi);
    this.runner.audition(midi);
  }

  private async startPuzzle(d: DoorView | null, spec: PuzzleSpec): Promise<void> {
    await AudioEngine.get().unlock();
    const question = makeQuestion(spec, Math.random, progress.misses);
    this.drilling = d === null;
    const runner = new PuzzleRunner(question, {
      playPrompt: (step, slow) => this.playPrompt(step, slow),
      onListening: () => {
        const step = runner.step;
        if (step.spec.kind === 'chordName') this.panel.setStatus(`Chord ${runner.stepIndex + 1} of ${runner.stepCount}. Which is it?`);
        else if (step.spec.kind === 'chordTone') this.panel.setStatus(`Your turn: ${step.label.toLowerCase()}. Sing it, or find it on the keys, then Enter.`);
        else if (step.spec.kind === 'resolve') this.panel.setStatus('Your turn: the one. Sing it, or find it on the keys, then Enter.');
        else if (step.spec.kind === 'degree') {
          if (step.mode === 'melody') this.panel.setStatus(`Your turn: note ${runner.stepIndex + 1} of ${runner.stepCount}. Sing it, or keys then Enter.`);
          else if (step.mode === 'echo' || runner.misses > 0) this.panel.setStatus('Your turn: give the note back. Sing it, or keys then Enter.');
          else this.panel.setStatus(`Your turn: ${step.label}. Sing it, or find it on the keys, then Enter.`);
        } else if (step.mode === 'echo') {
          if (runner.stepCount === 1) this.panel.setStatus('Your turn: give the note back. Sing it, or keys then Enter.');
          else this.panel.setStatus(step.part === 'first' ? 'Your turn: give back the first note. Sing it, or keys then Enter.' : 'Your turn: now the second note. Sing it, or keys then Enter.');
        }
        else if (runner.misses > 0) this.panel.setStatus('Your turn: give back the second note. Sing it, or keys then Enter.');
        else this.panel.setStatus(`Your turn: ${step.label.toLowerCase()} above it. Sing it, or find it on the keys, then Enter.`);
      },
      onStepSolved: (i) => this.onStepSolved(d, i),
      onSolved: () => (d ? this.onSolved(d) : this.onDrillSolved()),
      onMiss: (midi) => this.onMiss(midi),
    });
    if (!d) runner.hintOffset = 1;
    this.runner = runner;
    MusicPlayer.get().setPaused(true);
    panelOpen();
    this.panel.onSign = (q) => void runner.attemptChoice(q);
    this.panel.onKey = (midi) => this.playPipe(midi);
    this.panel.onAnswer = () => void runner.confirm();
    this.panel.show(runner);
    this.hudHint.setText('');
    void runner.start();
  }

  private playPrompt(step: Step, slow: boolean): Promise<void> {
    if (step.spec.kind === 'degree') return this.playDegreePrompt(step, slow);
    if (step.spec.kind === 'chordTone' || step.spec.kind === 'chordName') return this.playChordPrompt(step, slow);
    if (step.spec.kind === 'resolve') return this.playResolvePrompt(step, slow);
    const engine = AudioEngine.get();
    engine.setDuck(1);
    // Produce mode plays only the reference. After a miss the prompt becomes an echo, slower,
    // so the player hears the answer before the ladder shows it.
    const echo = step.mode === 'echo' || slow;
    const r = this.runner!;
    const pairJustPlayed = r.stepIndex > 0 && r.question.steps[r.stepIndex - 1].part === 'first';
    if (step.mode === 'echo' && step.part === 'second' && pairJustPlayed && !slow) {
      // The pair was just heard for the first note; go straight to the second.
      engine.setDuck(0.12);
      return Promise.resolve();
    }
    this.panel.setStatus(slow ? 'Once more, with the answer, slower…' : echo ? 'Listen to both notes…' : 'Listen to the note…');
    const k = slow ? 1.5 : 1;
    const t0 = engine.now + 0.08;
    let end = playNote(step.refMidi, { at: t0, duration: 0.7 * k, gain: 0.55 });
    if (echo) {
      const second = step.mode === 'echo' && step.part === 'first' ? this.runner!.question.steps[this.runner!.stepIndex + 1].targetMidi : step.targetMidi;
      end = playNote(second, { at: t0 + 0.95 * k, duration: 0.7 * k, gain: 0.55 });
    }
    const waitMs = Math.max(0, (end - engine.now) * 1000) + 120;
    return new Promise((resolve) => {
      this.time.delayedCall(waitMs, () => {
        engine.setDuck(0.12);
        resolve();
      });
    });
  }

  private waitUntil(end: number): Promise<void> {
    const engine = AudioEngine.get();
    const waitMs = Math.max(0, (end - engine.now) * 1000) + 120;
    return new Promise((resolve) => {
      this.time.delayedCall(waitMs, () => {
        engine.setDuck(0.12);
        resolve();
      });
    });
  }

  /** The chord as a block. After a miss, its notes one by one, slower, and the asked note last. */
  private playChordPrompt(step: Step, slow: boolean): Promise<void> {
    const engine = AudioEngine.get();
    engine.setDuck(1);
    const spec = step.spec;
    if (spec.kind !== 'chordTone' && spec.kind !== 'chordName') return Promise.resolve();
    const notes = CHORD_TONES[spec.quality].map((o) => step.refMidi + o);
    const named = spec.kind === 'chordTone';
    this.panel.setStatus(slow ? 'Once more, note by note…' : named ? `Listen: ${CHORD_NAMES[spec.quality].toLowerCase()}…` : 'Listen to the chord…');
    const k = slow ? 1.4 : 1;
    const t0 = engine.now + 0.08;
    playNote(step.refMidi - 12, { timbre: 'bass', at: t0, duration: 1.3 * k, gain: 0.35 });
    let end = playChord(notes, { timbre: 'pad', at: t0, duration: 1.3 * k, gain: 0.8 });
    if (slow) {
      end = playSequence(notes, { timbre: 'pipe', at: end + 0.2, duration: 0.5 * k, gap: 0.55 * k, gain: 0.45 });
      if (named) end = playNote(step.targetMidi, { at: end + 0.3, duration: 0.8 * k, gain: 0.55 });
    }
    return this.waitUntil(end);
  }

  /** ii then V, and the room waits. After a miss, the I is played too. */
  private playResolvePrompt(step: Step, slow: boolean): Promise<void> {
    const engine = AudioEngine.get();
    engine.setDuck(1);
    this.panel.setStatus(slow ? 'Once more, with the answer…' : 'Listen: two, five…');
    const k = slow ? 1.3 : 1;
    const t0 = engine.now + 0.08;
    const tonic = step.refMidi;
    const ii = CHORD_TONES.min7.map((o) => tonic + 2 + o);
    const v = CHORD_TONES.dom7.map((o) => tonic + 7 - 12 + o);
    const beat = 0.9 * k;
    playNote(tonic + 2 - 12, { timbre: 'bass', at: t0, duration: beat, gain: 0.35 });
    playChord(ii, { timbre: 'pad', at: t0, duration: beat, gain: 0.8 });
    playNote(tonic + 7 - 12, { timbre: 'bass', at: t0 + beat, duration: beat, gain: 0.35 });
    let end = playChord(v, { timbre: 'pad', at: t0 + beat, duration: beat, gain: 0.8 });
    if (slow) end = playNote(tonic, { at: end + 0.2, duration: 0.9 * k, gain: 0.55 });
    return this.waitUntil(end);
  }

  /** Cadence first, so the key is in the ear. Echo adds the note; melody adds the whole tune. */
  private playDegreePrompt(step: Step, slow: boolean): Promise<void> {
    const engine = AudioEngine.get();
    engine.setDuck(1);
    const r = this.runner!;
    const k = slow ? 1.4 : 1;
    const tonic = step.refMidi;
    let end = engine.now;
    if (step.mode === 'melody' && r.stepIndex > 0 && !slow) {
      // Mid-tune: the next note is sung without a new prompt.
      engine.setDuck(0.12);
      return Promise.resolve();
    }
    if (step.mode === 'melody' && slow) {
      // A missed note: the tune again up to that note, slower. The key is already in the ear.
      const n = r.stepIndex + 1;
      this.panel.setStatus(`Up to note ${n}, slower…`);
      const notes = r.question.steps.slice(0, n).map((st) => st.targetMidi);
      end = playSequence(notes, { at: engine.now + 0.08, duration: 0.55 * k, gap: 0.65 * k, gain: 0.55 });
    } else {
      this.panel.setStatus(slow ? 'Once more, slower…' : 'Listen to the key…');
      end = playCadence(tonic, { at: engine.now + 0.08, speed: k });
      if (step.mode === 'echo' || slow) {
        end = playNote(step.targetMidi, { at: end + 0.25 * k, duration: 0.8 * k, gain: 0.55 });
      } else if (step.mode === 'melody') {
        const notes = r.question.steps.map((st) => st.targetMidi);
        end = playSequence(notes, { at: end + 0.25 * k, duration: 0.55 * k, gap: 0.65 * k, gain: 0.55 });
      }
    }
    const waitMs = Math.max(0, (end - engine.now) * 1000) + 120;
    return new Promise((resolve) => {
      this.time.delayedCall(waitMs, () => {
        engine.setDuck(0.12);
        resolve();
      });
    });
  }

  private onStepSolved(d: DoorView | null, index: number): Promise<void> {
    const engine = AudioEngine.get();
    engine.setDuck(1);
    const step = this.runner!.question.steps[index];
    if (!d && progress.voice < VOICE_DRILL_CAP) {
      this.setVoice(progress.voice + 1);
      this.panel.setStatus(`Yes: ${step.label.toLowerCase()}. A note of voice back.`);
    } else if (!d) this.panel.setStatus(`Yes: ${step.label.toLowerCase()}.`);
    else this.panel.setStatus(`Yes: ${step.label.toLowerCase()}.`);
    if (d?.def.puzzle.id === 'stage-song') this.playSongLayers(index, step);
    else if (step.mode === 'melody') playNote(step.targetMidi, { timbre: 'pad', duration: 0.6, gain: 0.5 });
    else if (step.spec.kind === 'chordName') playChord(CHORD_TONES[step.spec.quality].map((o) => step.refMidi + o), { timbre: 'bell', duration: 0.6, gain: 0.7 });
    else if (step.spec.kind === 'chordTone') {
      playChord(CHORD_TONES[step.spec.quality].map((o) => step.refMidi + o), { timbre: 'pad', duration: 0.8, gain: 0.6 });
      playNote(step.targetMidi, { timbre: 'bell', duration: 0.6, gain: 0.5 });
    } else if (step.spec.kind === 'resolve') {
      // The band lands the I with the player's note on top.
      const t0 = AudioEngine.get().now + 0.05;
      playNote(step.refMidi - 12, { timbre: 'bass', at: t0, duration: 1.4, gain: 0.4 });
      playChord(CHORD_TONES.maj7.map((o) => step.refMidi + o), { timbre: 'pad', at: t0, duration: 1.4, gain: 0.8 });
      playNote(step.refMidi + 12, { timbre: 'bell', at: t0, duration: 1.0, gain: 0.45 });
    } else if (step.spec.kind === 'degree') playNote(step.targetMidi, { timbre: 'bell', duration: 0.5, gain: 0.5 });
    else playSequence([step.refMidi, step.targetMidi], { timbre: 'bell', duration: 0.35, gap: 0.18, gain: 0.5 });
    if (d && d.def.tiles.length > 1 && index < d.imgs.length) {
      const img = d.imgs[index];
      this.tweens.add({ targets: img, alpha: 0.35, duration: 400 });
    }
    return new Promise((resolve) => this.time.delayedCall(step.mode === 'melody' ? 350 : step.spec.kind === 'resolve' ? 1500 : 900, resolve));
  }

  /** The song's harmony, one triad per bar of four notes, as offsets from the tonic. */
  private static readonly SONG_BARS = [
    [0, 4, 7], // I
    [5, 9, 12], // IV
    [7, 11, 14], // V
    [0, 4, 7], // I
  ];

  /** One note of the finale: the band layers come in bar by bar as the areas did. */
  private playSongLayers(index: number, step: Step, at?: number): void {
    const t0 = at ?? AudioEngine.get().now + 0.03;
    const tonic = step.refMidi;
    const bar = Math.min(3, Math.floor(index / 4));
    const chord = WorldScene.SONG_BARS[bar];
    playNote(step.targetMidi, { timbre: 'pad', at: t0, duration: 0.6, gain: 0.5 });
    if (index % 4 === 0 || at === undefined) playNote(tonic - 24 + chord[0], { timbre: 'bass', at: t0, duration: 0.9, gain: 0.35 }); // Valley
    if (bar >= 1 && (index % 4 === 0 || at === undefined)) playChord(chord.map((o) => tonic - 12 + o), { timbre: 'pad', at: t0, duration: 1.2, gain: 0.55 }); // Town
    if (bar >= 2) playNote(step.targetMidi + 12, { timbre: 'horn', at: t0, duration: 0.45, gain: 0.22 }); // Quarter
  }

  /** The whole song with every layer, then the kingdom's colour and the results. */
  private finishKingdom(d: DoorView): void {
    const q = this.runner!.question;
    const engine = AudioEngine.get();
    const beat = 0.42;
    const t0 = engine.now + 0.4;
    q.steps.forEach((st, i) => this.playSongLayers(i, st, t0 + i * beat));
    const last = q.steps[q.steps.length - 1];
    const tEnd = t0 + q.steps.length * beat;
    playChord([last.refMidi - 24, last.refMidi - 12, last.refMidi + 4, last.refMidi + 7, last.refMidi + 12], { timbre: 'pad', at: tEnd, duration: 2.5, gain: 0.8 });
    playNote(last.refMidi + 12, { timbre: 'bell', at: tEnd, duration: 1.5, gain: 0.5 });
    progress.finished = true;
    progress.finishedAt = Date.now();
    saveProgress(progress);
    this.endPuzzle(true);
    this.showToast('Three fragments, one song. Listen: the kingdom answers.', 6000);
    const t = d.def.tiles[0];
    this.time.delayedCall((tEnd - engine.now) * 1000 - 400, () => this.bloomAt(t.x, t.y, 1e9));
    this.time.delayedCall((tEnd - engine.now) * 1000 + 2600, () => {
      this.cameras.main.fadeOut(700, 0, 0, 0);
      this.time.delayedCall(720, () => this.scene.start('results', {}));
    });
  }

  private onMiss(attempt: number | ChordQuality): Promise<void> {
    const engine = AudioEngine.get();
    engine.setDuck(1);
    const r = this.runner!;
    if (!this.drilling) {
      progress.areaMisses[this.area.id] = (progress.areaMisses[this.area.id] ?? 0) + 1;
      this.setVoice(progress.voice - 1);
      this.voiceFlashUntil = this.time.now + 900;
      if (progress.voice <= 0) {
        this.panel.setStatus('Your voice gives out…');
        return new Promise((resolve) => this.time.delayedCall(700, () => (this.goQuiet(), resolve())));
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
      this.cameras.main.shake(120, 0.002);
      return new Promise((resolve) => this.time.delayedCall(700, resolve));
    }
    const midi = attempt;
    const dist = ((((midi - r.step.refMidi) % 12) + 12) % 12);
    const target = r.step.targetMidi - r.step.refMidi;
    const dir = dist < target || (target === 12 && dist === 0) ? 'a little higher' : 'a little lower';
    this.panel.setStatus(r.hintLevel >= 3 ? 'The note is marked on the ladder. Match it.' : `Not that one. Try ${dir}.`);
    playNote(midi, { timbre: 'bass', duration: 0.25, gain: 0.25 });
    this.cameras.main.shake(120, 0.002);
    return new Promise((resolve) => this.time.delayedCall(700, resolve));
  }

  private onDrillSolved(): void {
    const q = this.runner!.question;
    doorOpen(q.steps[0].refMidi);
    this.endPuzzle(true);
    const v = progress.voice;
    this.showToast(v >= VOICE_DRILL_CAP ? `Practice done. Voice ${v} of ${VOICE_MAX}. Doors give the rest. Space: practise again.` : `Practice done. Voice ${v} of ${VOICE_MAX}. Space: practise again.`, 5000);
    saveProgress(progress);
  }

  private onSolved(d: DoorView): void {
    d.solved = true;
    this.setVoice(VOICE_MAX);
    if (!progress.solved.includes(d.def.puzzle.id)) progress.solved.push(d.def.puzzle.id);
    for (const t of d.def.tiles) this.blocked[t.y][t.x] = false;
    for (const img of d.imgs) this.tweens.add({ targets: img, alpha: 0, scale: 1.2, duration: 500, onComplete: () => img.setVisible(false) });
    const t0 = d.def.tiles[0];
    if (d.def.puzzle.id === 'stage-song') {
      this.finishKingdom(d);
      return;
    }
    this.bloomAt(t0.x, t0.y, this.areaComplete() ? 1e9 : 14);
    const q = this.runner!.question;
    doorOpen(q.steps[0].refMidi);
    this.time.delayedCall(700, () => playSequence(q.steps.map((s) => s.targetMidi).concat([q.steps[0].targetMidi + 12]), { timbre: 'bell', duration: 0.3, gap: 0.14, gain: 0.45 }));
    this.endPuzzle(true);
    this.showToast(d.def.tiles.length > 1 ? 'The serpent lies down. A bridge.' : d.def.puzzle.id === 'jazz-boss' ? 'The band plays the whole set. The door is yours.' : 'The way opens.');
    saveProgress(progress);
  }

  private endPuzzle(_solved: boolean): void {
    this.runner?.abort();
    this.runner = null;
    this.drilling = false;
    this.panel.hide();
    AudioEngine.get().setDuck(1);
    // Give the solved-door flourish a moment before the music comes back.
    this.time.delayedCall(_solved ? 1800 : 300, () => {
      if (!this.runner) MusicPlayer.get().setPaused(false);
    });
  }

  // ---------- pickups, exits, gates ----------

  /** Flags gates read, from progress. */
  private flags(): Set<string> {
    const flags = new Set<string>();
    if (AREAS.valley.entities.filter((e) => e.kind === 'door').every((e) => progress.solved.includes((e as DoorDef).puzzle.id)) && progress.solved.includes('fragment-valley')) flags.add('valley-complete');
    if (progress.solved.includes('fragment-town')) flags.add('town-complete');
    if (progress.fragments >= 3) flags.add('all-fragments');
    return flags;
  }

  private refreshGates(): void {
    const flags = this.flags();
    for (const g of this.gates) {
      const open = flags.has(g.def.flag);
      if (open !== g.open) {
        g.open = open;
        for (const t of g.def.tiles) this.blocked[t.y][t.x] = !open;
        for (const img of g.imgs) img.setTexture(open ? 'door-open' : 'door-closed');
      }
    }
  }

  private checkPickup(): void {
    if (!this.fragment) return;
    if (Math.hypot(this.fragment.x - this.player.x, this.fragment.y - (this.player.y + 4)) < 22) {
      const e = this.area.entities.find((x) => x.kind === 'fragment');
      if (e && e.kind === 'fragment' && !progress.solved.includes(e.id)) {
        progress.solved.push(e.id);
        progress.fragments++;
        this.setVoice(VOICE_MAX);
        saveProgress(progress);
      }
      const f = this.fragment;
      this.fragment = null;
      this.tweens.add({ targets: f, y: f.y - 40, alpha: 0, duration: 700, onComplete: () => f.destroy() });
      playSequence([64, 67, 71, 76], { timbre: 'bell', duration: 0.3, gap: 0.12, gain: 0.5 });
      const lines: Record<string, string> = {
        valley: 'A melody fragment. Your voice has grown: the valley is yours.',
        town: 'A melody fragment. The town keeps its key, and so do you.',
        jazz: 'The last fragment. The quarter plays again, and the stage is waiting.',
      };
      this.showToast(lines[this.area.id] ?? 'A melody fragment.', 4000);
      this.bloomAt(this.playerTile().x, this.playerTile().y, 1e9);
      this.updateHud();
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
        this.cameras.main.fadeOut(350, 0, 0, 0);
        this.time.delayedCall(360, () => this.scene.restart({ area: e.to, at: e.at } satisfies WorldData));
        return;
      }
    }
  }

  // ---------- loop ----------

  update(time: number, delta: number): void {
    // Voice.
    let hz: number | null = null;
    if (this.mic?.isLive) {
      const f = this.mic.read();
      hz = f.hz;
    }
    const midiNow = hz ? hzToMidi(hz) : null;
    this.voiceMidi = midiNow === null ? null : this.voiceMidi === null ? midiNow : this.voiceMidi + (midiNow - this.voiceMidi) * 0.35;
    if (this.runner) {
      this.runner.feedVoice(time < this.voiceMuteUntil ? null : hz, time);
      this.panel.update(this.voiceMidi);
    }

    if (this.mapView.visible) {
      const flags = this.flags();
      this.mapView.update(progress, this.playerTile(), (f) => flags.has(f));
      this.player.setScale(1, 1);
    }

    // Movement.
    if (this.voiceFlashUntil > time - 200) this.drawVoice();
    if (!this.runner && !this.transitioning && !this.mapView.visible && !this.lessonView.visible) {
      const speed = 150 * (delta / 1000);
      let dx = 0;
      let dy = 0;
      if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;
      if (dx && dy) (dx *= Math.SQRT1_2), (dy *= Math.SQRT1_2);
      if (dx || dy) {
        this.tryMove(dx * speed, dy * speed);
        const before = Math.floor(this.walkPhase / Math.PI);
        this.walkPhase += delta / 90;
        if (Math.floor(this.walkPhase / Math.PI) !== before) footstep();
        this.player.setScale(1 + Math.sin(this.walkPhase) * 0.04, 1 - Math.sin(this.walkPhase) * 0.04);
        if (dx) this.player.setFlipX(dx < 0);
      } else {
        this.player.setScale(1, 1);
      }
      this.player.setDepth(10 + this.player.y / 10000);
      this.checkPickup();
      this.checkExit();

      const d = this.nearestDoor();
      if (d) {
        const t = d.def.tiles[0];
        this.promptBubble.setPosition(t.x * TILE + TILE / 2, t.y * TILE - 4).setVisible(true);
        this.hudHint.setText('Space: listen to the door');
      } else if (this.practice && this.nearPractice()) {
        const t = this.practice.def.tile;
        this.promptBubble.setPosition(t.x * TILE + TILE / 2, t.y * TILE - 4).setVisible(true);
        this.hudHint.setText('Space: practise here');
      } else {
        this.promptBubble.setVisible(false);
        this.hudHint.setText(this.area.id === 'hub' && progress.solved.length === 0 ? 'Arrow keys or WASD to walk. Find the humming door.  M: map' : 'M: map');
      }
    }

    if (this.toast.visible && time > this.toastUntil) this.toast.setVisible(false);
    this.updateColour(delta);
    MusicPlayer.get().setLife(this.areaLife());
  }
}

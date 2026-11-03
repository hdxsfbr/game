import { Engine } from '@babylonjs/core/Engines/engine';
import { Hud } from '../overlay/Hud';
import { LessonOverlay } from '../overlay/LessonOverlay';
import { MapOverlay } from '../overlay/MapOverlay';
import { PuzzlePanel } from '../overlay/PuzzlePanel';
import { Results } from '../overlay/Results';
import { StoryCard } from '../overlay/StoryCard';
import { Title } from '../overlay/Title';
import { clearProgress, defaultProgress, progress, saveProgress } from '../state';
import { PALETTES } from '../world/palette';
import { World, type Overlays, type WorldStart } from './World';

/**
 * Owns the engine, the current world and the HTML overlays, and moves between the title, the
 * world and the results.
 */
export class App {
  readonly engine: Engine;
  world: World | null = null;
  private overlays: Overlays;
  private title: Title;
  private results: Results;
  private fade: HTMLDivElement;
  private last = performance.now();

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly ui: HTMLDivElement,
  ) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
    this.fade = document.createElement('div');
    this.fade.className = 'fade';
    ui.appendChild(this.fade);
    this.overlays = {
      ui,
      hud: new Hud(ui),
      panel: new PuzzlePanel(ui, PALETTES.hub),
      mapView: new MapOverlay(ui),
      lessonView: new LessonOverlay(ui),
      storyCard: new StoryCard(ui),
    };
    this.title = new Title(ui);
    this.results = new Results(ui);
    window.addEventListener('resize', () => this.engine.resize());
    this.engine.runRenderLoop(() => this.frame());
    if (import.meta.env.DEV) (window as unknown as { __lkApp: App }).__lkApp = this;
  }

  async start(startAt: WorldStart): Promise<void> {
    this.overlays.hud.hide();
    this.title.show(startAt, (mode, at) => {
      progress.inputMode = mode;
      if (!progress.startedAt) progress.startedAt = Date.now();
      saveProgress(progress);
      void this.enterWorld(at);
    });
  }

  private async enterWorld(start: WorldStart): Promise<void> {
    await this.setFade(true, 350);
    this.results.hide();
    this.world?.dispose();
    this.world = null;
    const world = await World.create(
      this.engine,
      start,
      {
        onExit: (to, at) => void this.enterWorld({ area: to, at }),
        onFinished: () => this.showResults(),
        fade: (on, ms) => this.setFade(on, ms),
      },
      this.overlays,
    );
    this.world = world;
    this.canvas.focus();
    (window as unknown as { __lk: unknown }).__lk = world; // read by scripts/smoke.mjs and playthrough.mjs
    await this.setFade(false, 500);
  }

  private showResults(): void {
    this.world?.dispose();
    this.world = null;
    this.overlays.hud.hide();
    this.results.show(
      () => void this.enterWorld({ area: 'hub' }),
      () => {
        clearProgress();
        Object.assign(progress, defaultProgress());
        this.results.hide();
        void this.start({});
      },
    );
    void this.setFade(false, 600);
  }

  private setFade(on: boolean, ms: number): Promise<void> {
    this.fade.style.transitionDuration = `${ms}ms`;
    this.fade.style.opacity = on ? '1' : '0';
    this.fade.style.pointerEvents = on ? 'auto' : 'none';
    return new Promise((r) => setTimeout(r, ms));
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const w = this.world;
    if (w && w.ready) {
      w.update(dt, now);
      w.scene.render();
    }
  }
}

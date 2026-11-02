import { Engine } from '@babylonjs/core/Engines/engine';
import { Hud } from '../overlay/Hud';
import { Title } from '../overlay/Title';
import { progress, saveProgress } from '../state';
import { World, type WorldStart } from './World';

/**
 * Owns the engine, the current scene and the HTML overlays, and moves between the title, the
 * world and (phase 2) the results.
 */
export class App {
  readonly engine: Engine;
  world: World | null = null;
  private hud: Hud;
  private title: Title;
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
    this.hud = new Hud(ui);
    this.title = new Title(ui);
    window.addEventListener('resize', () => this.engine.resize());
    this.engine.runRenderLoop(() => this.frame());
    if (import.meta.env.DEV) (window as unknown as { __lkApp: App }).__lkApp = this;
  }

  async start(startAt: WorldStart): Promise<void> {
    this.hud.hide();
    this.title.show(startAt, (mode, at) => {
      progress.inputMode = mode;
      if (!progress.startedAt) progress.startedAt = Date.now();
      saveProgress(progress);
      void this.enterWorld(at);
    });
  }

  private async enterWorld(start: WorldStart): Promise<void> {
    await this.setFade(true, 350);
    this.world?.dispose();
    this.world = null;
    const world = await World.create(this.engine, start, {
      onExit: (to, at) => void this.enterWorld({ area: to, at }),
    });
    this.world = world;
    this.hud.show(world.area.name);
    this.canvas.focus();
    if (import.meta.env.DEV) (window as unknown as { __lk: unknown }).__lk = world;
    await this.setFade(false, 500);
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
    if (w) {
      w.update(dt, now);
      w.scene.render();
    }
  }
}

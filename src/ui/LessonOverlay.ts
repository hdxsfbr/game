import Phaser from 'phaser';
import type { LessonDef, LessonPage } from '../world/lessons';
import type { Palette } from '../world/palette';

const FONT = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

/**
 * The lesson shown at a practice bench: one page at a time, each with a short text and, often,
 * something to hear. Fixed to the camera. Keys are handled by the scene; the buttons here call back.
 */
export class LessonOverlay {
  readonly container: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private heading: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private pageNo: Phaser.GameObjects.Text;
  private hearBtn: Phaser.GameObjects.Text;
  private backBtn: Phaser.GameObjects.Text;
  private nextBtn: Phaser.GameObjects.Text;
  private drillBtn: Phaser.GameObjects.Text;
  private leaveBtn: Phaser.GameObjects.Text;
  private lesson: LessonDef | null = null;
  private palette: Palette;
  page = 0;
  /** Set by the scene. */
  onHear: ((page: LessonPage) => void) | null = null;
  onDrill: (() => void) | null = null;
  onLeave: (() => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    palette: Palette,
  ) {
    this.palette = palette;
    const { width, height } = scene.scale;
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(150).setVisible(false);
    const bg = scene.add.rectangle(0, 0, width, height, 0x0d0c12, 1).setOrigin(0);
    this.gfx = scene.add.graphics();
    this.title = scene.add.text(width / 2, 54, '', { fontFamily: FONT, fontSize: '30px', color: '#f6efe2' }).setOrigin(0.5);
    this.pageNo = scene.add.text(width / 2, 88, '', { fontFamily: MONO, fontSize: '13px', color: '#8f8a80' }).setOrigin(0.5);
    this.heading = scene.add.text(120, 140, '', { fontFamily: FONT, fontSize: '24px', color: '#f2c46d' });
    this.body = scene.add.text(120, 180, '', { fontFamily: FONT, fontSize: '19px', color: '#e4ddd0', wordWrap: { width: width - 240 }, lineSpacing: 7 });
    const btn = (x: number, y: number, text: string, cb: () => void, originX = 0.5) =>
      scene.add
        .text(x, y, text, { fontFamily: MONO, fontSize: '14px', color: '#d9d2c4', backgroundColor: '#1e1c26', padding: { x: 12, y: 7 } })
        .setOrigin(originX, 0.5)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', cb);
    this.hearBtn = btn(120, 400, '', () => this.hear(), 0);
    this.backBtn = btn(120, height - 50, '←  back', () => this.go(-1), 0);
    this.nextBtn = btn(width - 120, height - 50, 'next  →', () => this.go(1), 1);
    this.drillBtn = btn(width / 2, height - 50, 'Enter: begin the drill', () => this.onDrill?.());
    this.leaveBtn = btn(width - 24, 24, 'Esc: leave', () => this.onLeave?.(), 1);
    this.container.add([bg, this.gfx, this.title, this.pageNo, this.heading, this.body, this.hearBtn, this.backBtn, this.nextBtn, this.drillBtn, this.leaveBtn]);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  setPalette(p: Palette): void {
    this.palette = p;
  }

  show(lesson: LessonDef): void {
    this.lesson = lesson;
    this.page = 0;
    this.title.setText(lesson.title);
    this.container.setVisible(true);
    this.render();
  }

  hide(): void {
    this.container.setVisible(false);
    this.lesson = null;
  }

  get currentPage(): LessonPage | null {
    return this.lesson ? this.lesson.pages[this.page] : null;
  }

  /** Move by `d` pages. Past the last page, the drill begins. */
  go(d: number): void {
    if (!this.lesson) return;
    const n = this.page + d;
    if (n < 0) return;
    if (n >= this.lesson.pages.length) {
      this.onDrill?.();
      return;
    }
    this.page = n;
    this.render();
  }

  hear(): void {
    const p = this.currentPage;
    if (p?.demo) this.onHear?.(p);
  }

  private render(): void {
    const lesson = this.lesson;
    if (!lesson) return;
    const p = lesson.pages[this.page];
    const { width } = this.scene.scale;
    this.pageNo.setText(`${this.page + 1} of ${lesson.pages.length}`);
    this.heading.setText(p.heading);
    this.body.setText(p.text);
    const hearY = this.body.y + this.body.height + 28;
    this.hearBtn.setPosition(120, hearY).setVisible(!!p.demo);
    if (p.demo) this.hearBtn.setText(`Space: hear ${p.demoLabel ?? 'it'}`);
    this.backBtn.setVisible(this.page > 0);
    const last = this.page === lesson.pages.length - 1;
    this.nextBtn.setVisible(!last);
    this.drillBtn.setText(last ? 'Enter: begin the drill' : 'Enter: skip to the drill');
    const g = this.gfx;
    g.clear();
    g.fillStyle(this.palette.accent, 1).fillRect(0, 0, width, 3);
    // Page dots.
    const n = lesson.pages.length;
    for (let i = 0; i < n; i++) {
      g.fillStyle(i === this.page ? this.palette.accent : 0x3b3842, 1).fillCircle(width / 2 - ((n - 1) * 14) / 2 + i * 14, 112, 4);
    }
  }
}

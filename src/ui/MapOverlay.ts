import Phaser from 'phaser';
import type { Progress } from '../state';
import { AREAS, type AreaDef, type DoorDef } from '../world/areas';
import { PALETTES, type Palette } from '../world/palette';

const FONT = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

/** Areas in the order they are met, for the strip along the top. */
const ORDER = ['hub', 'valley', 'town', 'jazz', 'stage'];

/**
 * The map: the whole area at a glance with every door, gate, exit and fragment marked, the player
 * pulsing, and a strip of the kingdom's areas with doors opened. Fixed to the camera; toggled with M.
 */
export class MapOverlay {
  readonly container: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private labelPool: Phaser.GameObjects.Text[] = [];
  private labelsUsed = 0;
  private area: AreaDef | null = null;
  private palette: Palette = PALETTES.hub;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(200).setVisible(false);
    this.gfx = scene.add.graphics();
    const bg = scene.add.rectangle(0, 0, width, height, 0x0d0c12, 1).setOrigin(0);
    this.container.add([bg, this.gfx]);
    scene.events.on('postupdate', this.endFrame, this);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  show(area: AreaDef): void {
    this.area = area;
    this.palette = PALETTES[area.palette];
    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
  }

  /** Call every frame while visible. */
  update(progress: Progress, player: { x: number; y: number }, gateOpen: (flag: string) => boolean): void {
    const area = this.area;
    if (!area || !this.container.visible) return;
    const g = this.gfx;
    g.clear();
    const { width, height } = this.scene.scale;
    const p = this.palette;

    // Kingdom strip.
    let sx = 24;
    for (const id of ORDER) {
      const a = AREAS[id];
      const doors = a.entities.filter((e): e is DoorDef => e.kind === 'door');
      const done = doors.filter((d) => progress.solved.includes(d.puzzle.id)).length;
      const here = id === area.id;
      const text = doors.length ? `${a.name}  ${done}/${doors.length}` : a.name;
      const t = this.label(sx + 10, 31, text, here ? '#15141a' : done === doors.length && doors.length ? '#d9d2c4' : '#8f8a80', '15px', FONT);
      const w = t.width + 20;
      g.fillStyle(here ? PALETTES[a.palette].accent : 0x1e1c26, 1).fillRoundedRect(sx, 16, w, 30, 6);
      sx += w + 8;
    }

    // The area, scaled to fit.
    const cols = area.map[0].length;
    const rows = area.map.length;
    const cell = Math.max(4, Math.min(Math.floor((width - 80) / cols), Math.floor((height - 150) / rows)));
    const ox = Math.floor((width - cols * cell) / 2);
    const oy = 66 + Math.floor((height - 150 - rows * cell) / 2);
    const colour: Record<string, number> = { '#': p.wall, '.': p.ground, '~': p.water, T: p.tree, '=': p.bridge, D: p.ground, X: p.ground, G: p.ground };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = area.map[y][x];
        g.fillStyle(colour[c] ?? p.ground, c === '#' ? 0.75 : 0.5).fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }
    g.lineStyle(1, p.accent, 0.5).strokeRect(ox - 1, oy - 1, cols * cell + 2, rows * cell + 2);

    const at = (t: { x: number; y: number }) => ({ x: ox + t.x * cell + cell / 2, y: oy + t.y * cell + cell / 2 });
    const r = Math.max(4, cell * 0.6);
    // Tall maps run their doors down a street, so names go to the right. Wide maps run them along
    // a street, so names alternate above and below to keep neighbours apart.
    const wide = cols > rows;
    let doorIndex = 0;
    for (const e of area.entities) {
      if (e.kind === 'door') {
        const solved = progress.solved.includes(e.puzzle.id);
        const c = at(e.tiles[0]);
        const i = doorIndex++;
        if (solved) {
          g.lineStyle(2, p.accent, 0.6).strokeCircle(c.x, c.y, r);
        } else {
          g.fillStyle(p.accent, 1).fillCircle(c.x, c.y, r);
          g.lineStyle(2, 0xf6efe2, 1).strokeCircle(c.x, c.y, r + 3);
          if (wide) this.label(c.x, c.y + (i % 2 === 0 ? -r - 12 : r + 12), e.puzzle.title, '#f6efe2', '13px', FONT, 0.5);
          else this.label(c.x + r + 8, c.y, e.puzzle.title, '#f6efe2', '13px', FONT);
        }
      } else if (e.kind === 'gate') {
        const open = gateOpen(e.flag);
        for (const t of e.tiles) {
          const c = at(t);
          g.fillStyle(open ? p.accent : 0xe06c75, open ? 0.6 : 1).fillRect(c.x - cell / 2, c.y - cell / 2, cell, cell);
        }
        if (!open) {
          const c = at(e.tiles[0]);
          this.label(c.x + r + 8, c.y, 'locked', '#e06c75', '12px', MONO);
        }
      } else if (e.kind === 'exit') {
        const c = at(e.tiles[0]);
        g.fillStyle(0xf6efe2, 0.9).fillTriangle(c.x, c.y - r, c.x + r, c.y + r * 0.8, c.x - r, c.y + r * 0.8);
        const above = e.tiles[0].y < rows / 2;
        this.label(c.x, c.y + (above ? -r - 10 : r + 10), `to ${AREAS[e.to]?.name ?? e.to}`, '#b9b2a6', '12px', MONO, 0.5);
      } else if (e.kind === 'practice') {
        const c = at(e.tile);
        g.fillStyle(0x9ad1c8, 1).fillRect(c.x - r * 0.8, c.y - r * 0.8, r * 1.6, r * 1.6);
        g.lineStyle(1, 0xf6efe2, 0.8).strokeRect(c.x - r * 0.8, c.y - r * 0.8, r * 1.6, r * 1.6);
        if (wide) this.label(c.x, c.y - r - 10, 'practice', '#9ad1c8', '12px', MONO, 0.5);
        else this.label(c.x - r - 8, c.y, 'practice bench', '#9ad1c8', '12px', MONO, 1);
      } else if (e.kind === 'fragment' && !progress.solved.includes(e.id)) {
        const c = at(e.tile);
        g.fillStyle(0xf2c46d, 1).fillCircle(c.x, c.y, r * 0.8);
        if (wide) this.label(c.x, c.y - r - 10, 'fragment', '#f2c46d', '12px', MONO, 0.5);
        else this.label(c.x - r - 8, c.y, 'melody fragment', '#f2c46d', '12px', MONO, 1);
      }
    }

    // You.
    const me = at(player);
    const pulse = 1 + Math.sin(this.scene.time.now / 180) * 0.25;
    g.fillStyle(0xffffff, 0.25).fillCircle(me.x, me.y, r * 2 * pulse);
    g.fillStyle(0xffffff, 1).fillCircle(me.x, me.y, r * 0.9);
    this.label(me.x, me.y + r * 2 + 8, 'you', '#ffffff', '13px', FONT, 0.5);

    this.label(width / 2, height - 26, 'M or Esc: close the map', '#8f8a80', '13px', MONO, 0.5);
  }

  private label(x: number, y: number, text: string, color: string, size: string, family: string, originX = 0): Phaser.GameObjects.Text {
    let t = this.labelPool[this.labelsUsed];
    if (!t) {
      t = this.scene.add.text(0, 0, '', { fontFamily: family, fontSize: size });
      this.container.add(t);
      this.labelPool.push(t);
    }
    t.setFontFamily(family).setFontSize(size).setOrigin(originX, 0.5).setPosition(x, y).setText(text).setColor(color).setVisible(true);
    this.labelsUsed++;
    return t;
  }

  private endFrame(): void {
    for (let i = this.labelsUsed; i < this.labelPool.length; i++) this.labelPool[i].setVisible(false);
    this.labelsUsed = 0;
  }
}

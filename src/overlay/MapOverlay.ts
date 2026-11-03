import type { Progress } from '../state';
import { AREAS, type AreaDef, type DoorDef } from '../world/areas';
import { PALETTES, colorToCss, type Palette } from '../world/palette';
import { el } from './dom';

const FONT = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';
/** Areas in the order they are met, for the strip along the top. */
const ORDER = ['hub', 'valley', 'town', 'jazz', 'stage'];

/**
 * The map: the whole area at a glance with every door, gate, exit and fragment marked, the player
 * pulsing, and a strip of the kingdom's areas with doors opened. Drawn on a 2D canvas; toggled with M.
 */
export class MapOverlay {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private area: AreaDef | null = null;
  private palette: Palette = PALETTES.hub;

  constructor(ui: HTMLDivElement) {
    this.root = el('div', 'map hidden');
    this.root.id = 'map';
    this.canvas = el('canvas', '');
    this.ctx = this.canvas.getContext('2d')!;
    this.root.append(this.canvas, el('p', 'map-foot', 'M or Esc: close the map'));
    ui.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(area: AreaDef): void {
    this.area = area;
    this.palette = PALETTES[area.palette];
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Call every frame while visible. */
  update(progress: Progress, player: { x: number; y: number }, gateOpen: (flag: string) => boolean, timeMs: number): void {
    const area = this.area;
    if (!area || !this.visible) return;
    const width = 960;
    const height = 540;
    if (this.canvas.width !== width) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const g = this.ctx;
    const p = this.palette;
    g.clearRect(0, 0, width, height);

    // Kingdom strip.
    let sx = 24;
    g.textBaseline = 'middle';
    for (const id of ORDER) {
      const a = AREAS[id];
      const doors = a.entities.filter((e): e is DoorDef => e.kind === 'door');
      const done = doors.filter((d) => progress.solved.includes(d.puzzle.id)).length;
      const here = id === area.id;
      const text = doors.length ? `${a.name}  ${done}/${doors.length}` : a.name;
      g.font = `15px ${FONT}`;
      const w = g.measureText(text).width + 20;
      g.fillStyle = here ? colorToCss(PALETTES[a.palette].accent) : '#1e1c26';
      this.roundRect(sx, 16, w, 30, 6);
      g.fill();
      g.fillStyle = here ? '#15141a' : done === doors.length && doors.length ? '#d9d2c4' : '#8f8a80';
      g.textAlign = 'left';
      g.fillText(text, sx + 10, 31);
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
        g.globalAlpha = c === '#' ? 0.75 : 0.5;
        g.fillStyle = colorToCss(colour[c] ?? p.ground);
        g.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }
    g.globalAlpha = 1;
    g.strokeStyle = colorToCss(p.accent);
    g.globalAlpha = 0.5;
    g.lineWidth = 1;
    g.strokeRect(ox - 1, oy - 1, cols * cell + 2, rows * cell + 2);
    g.globalAlpha = 1;

    const at = (t: { x: number; y: number }) => ({ x: ox + t.x * cell + cell / 2, y: oy + t.y * cell + cell / 2 });
    const r = Math.max(4, cell * 0.6);
    const wide = cols > rows;
    let doorIndex = 0;
    const label = (x: number, y: number, text: string, color: string, size: number, family: string, align: CanvasTextAlign) => {
      g.font = `${size}px ${family}`;
      g.fillStyle = color;
      g.textAlign = align;
      g.fillText(text, x, y);
    };
    for (const e of area.entities) {
      if (e.kind === 'door') {
        const solved = progress.solved.includes(e.puzzle.id);
        const c = at(e.tiles[0]);
        const i = doorIndex++;
        if (solved) {
          g.strokeStyle = colorToCss(p.accent);
          g.globalAlpha = 0.6;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(c.x, c.y, r, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
        } else {
          g.fillStyle = colorToCss(p.accent);
          g.beginPath();
          g.arc(c.x, c.y, r, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#f6efe2';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(c.x, c.y, r + 3, 0, Math.PI * 2);
          g.stroke();
          if (wide) label(c.x, c.y + (i % 2 === 0 ? -r - 12 : r + 12), e.puzzle.title, '#f6efe2', 13, FONT, 'center');
          else label(c.x + r + 8, c.y, e.puzzle.title, '#f6efe2', 13, FONT, 'left');
        }
      } else if (e.kind === 'gate') {
        const open = gateOpen(e.flag);
        for (const t of e.tiles) {
          const c = at(t);
          g.fillStyle = open ? colorToCss(p.accent) : '#e06c75';
          g.globalAlpha = open ? 0.6 : 1;
          g.fillRect(c.x - cell / 2, c.y - cell / 2, cell, cell);
          g.globalAlpha = 1;
        }
        if (!open) {
          const c = at(e.tiles[0]);
          label(c.x + r + 8, c.y, 'locked', '#e06c75', 12, MONO, 'left');
        }
      } else if (e.kind === 'exit') {
        const c = at(e.tiles[0]);
        g.fillStyle = 'rgba(246,239,226,0.9)';
        g.beginPath();
        g.moveTo(c.x, c.y - r);
        g.lineTo(c.x + r, c.y + r * 0.8);
        g.lineTo(c.x - r, c.y + r * 0.8);
        g.closePath();
        g.fill();
        const above = e.tiles[0].y < rows / 2;
        label(c.x, c.y + (above ? -r - 10 : r + 10), `to ${AREAS[e.to]?.name ?? e.to}`, '#b9b2a6', 12, MONO, 'center');
      } else if (e.kind === 'practice') {
        const c = at(e.tile);
        g.fillStyle = '#9ad1c8';
        g.fillRect(c.x - r * 0.8, c.y - r * 0.8, r * 1.6, r * 1.6);
        g.strokeStyle = 'rgba(246,239,226,0.8)';
        g.lineWidth = 1;
        g.strokeRect(c.x - r * 0.8, c.y - r * 0.8, r * 1.6, r * 1.6);
        if (wide) label(c.x, c.y - r - 10, 'practice', '#9ad1c8', 12, MONO, 'center');
        else label(c.x - r - 8, c.y, 'practice bench', '#9ad1c8', 12, MONO, 'right');
      } else if (e.kind === 'fragment' && !progress.solved.includes(e.id)) {
        const c = at(e.tile);
        g.fillStyle = '#f2c46d';
        g.beginPath();
        g.arc(c.x, c.y, r * 0.8, 0, Math.PI * 2);
        g.fill();
        if (wide) label(c.x, c.y - r - 10, 'fragment', '#f2c46d', 12, MONO, 'center');
        else label(c.x - r - 8, c.y, 'melody fragment', '#f2c46d', 12, MONO, 'right');
      }
    }

    // You.
    const me = at(player);
    const pulse = 1 + Math.sin(timeMs / 180) * 0.25;
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.arc(me.x, me.y, r * 2 * pulse, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(me.x, me.y, r * 0.9, 0, Math.PI * 2);
    g.fill();
    label(me.x, me.y + r * 2 + 8, 'you', '#ffffff', 13, FONT, 'center');
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const g = this.ctx;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
}

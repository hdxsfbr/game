import type { Progress } from '../state';
import { AREAS, type AreaDef, type DoorDef } from '../world/areas';
import { PALETTES, colorToCss, type Palette } from '../world/palette';
import { el } from './dom';

const FONT = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';
/** Areas in the order they are met, for the strip along the top. */
const ORDER = ['hub', 'valley', 'town', 'jazz', 'stage'];
const INK = '#f6efe2';
const HALO = 'rgba(13,12,18,0.82)';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a label would like to sit relative to its marker: right, left, above or below, at a distance. */
type Side = 'r' | 'l' | 'a' | 'b';

interface Label {
  /** Marker centre and radius the label hangs off. */
  x: number;
  y: number;
  r: number;
  text: string;
  color: string;
  size: number;
  family: string;
  /** Sides to try, in order; the rest follow as fallbacks. */
  sides: Side[];
}

const ALL_SIDES: Side[] = ['r', 'l', 'a', 'b'];

/**
 * The map: the whole area at a glance with every door, gate, exit and fragment marked, the player
 * pulsing, and a strip of the kingdom's areas with doors opened. Drawn on a 2D canvas; toggled with M.
 *
 * Labels are laid out after every marker is drawn: each tries its preferred sides at two distances,
 * then the other sides, and takes the first spot that touches neither another label nor a marker.
 * A label pushed away from its marker gets a thin leader line. Narrow (portrait) screens get a
 * portrait canvas with the kingdom strip wrapped over two rows.
 */
export class MapOverlay {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private area: AreaDef | null = null;
  private palette: Palette = PALETTES.hub;
  private labels: Label[] = [];
  private blocked: Rect[] = [];

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
    const portrait = this.root.clientHeight > this.root.clientWidth;
    const width = portrait ? 540 : 960;
    const height = portrait ? 900 : 540;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }
    // Shown as large as the screen allows, above the footer line.
    const fit = Math.min(this.root.clientWidth / width, (this.root.clientHeight - 44) / height);
    const cssWidth = `${Math.floor(width * fit)}px`;
    if (this.canvas.style.width !== cssWidth) this.canvas.style.width = cssWidth;
    const g = this.ctx;
    const p = this.palette;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    this.labels = [];
    this.blocked = [];

    // Kingdom strip, wrapping onto further rows when the canvas is narrow.
    let sx = 24;
    let sy = 16;
    g.textBaseline = 'middle';
    for (const id of ORDER) {
      const a = AREAS[id];
      const doors = a.entities.filter((e): e is DoorDef => e.kind === 'door');
      const done = doors.filter((d) => progress.solved.includes(d.puzzle.id)).length;
      const here = id === area.id;
      const text = doors.length ? `${a.name}  ${done}/${doors.length}` : a.name;
      g.font = `15px ${FONT}`;
      const w = g.measureText(text).width + 20;
      if (sx + w > width - 24 && sx > 24) {
        sx = 24;
        sy += 38;
      }
      g.fillStyle = here ? colorToCss(PALETTES[a.palette].accent) : '#1e1c26';
      this.roundRect(sx, sy, w, 30, 6);
      g.fill();
      g.fillStyle = here ? '#15141a' : done === doors.length && doors.length ? '#d9d2c4' : '#8f8a80';
      g.textAlign = 'left';
      g.fillText(text, sx + 10, sy + 15);
      sx += w + 8;
    }
    const stripBottom = sy + 30;

    // The area, scaled to fit under the strip, with room for labels around the edge.
    const cols = area.map[0].length;
    const rows = area.map.length;
    const margin = 40;
    const top = stripBottom + 28;
    const cell = Math.max(4, Math.min(Math.floor((width - margin * 2) / cols), Math.floor((height - top - margin) / rows)));
    const ox = Math.floor((width - cols * cell) / 2);
    const oy = top + Math.floor((height - top - margin - rows * cell) / 2);
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
    // Text is wide, so labels go beside their markers unless the map is clearly wider than tall.
    const wide = cols > rows * 1.5;
    const block = (x: number, y: number, rad: number) => this.blocked.push({ x: x - rad, y: y - rad, w: rad * 2, h: rad * 2 });
    const label = (x: number, y: number, rad: number, text: string, color: string, size: number, family: string, sides: Side[]) =>
      this.labels.push({ x, y, r: rad, text, color, size, family, sides });
    const doorSides: Side[] = wide ? ['a', 'b', 'r', 'l'] : ['r', 'l', 'b', 'a'];

    // Markers first, so the labels can be laid out around all of them.
    for (const e of area.entities) {
      if (e.kind === 'door') {
        const solved = progress.solved.includes(e.puzzle.id);
        const c = at(e.tiles[0]);
        if (solved) {
          g.strokeStyle = colorToCss(p.accent);
          g.globalAlpha = 0.6;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(c.x, c.y, r, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          block(c.x, c.y, r + 1);
        } else {
          g.fillStyle = colorToCss(p.accent);
          g.beginPath();
          g.arc(c.x, c.y, r, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = INK;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(c.x, c.y, r + 3, 0, Math.PI * 2);
          g.stroke();
          block(c.x, c.y, r + 4);
          label(c.x, c.y, r + 4, e.puzzle.title, INK, 13, FONT, doorSides);
        }
      } else if (e.kind === 'gate') {
        const open = gateOpen(e.flag);
        for (const t of e.tiles) {
          const c = at(t);
          g.fillStyle = open ? colorToCss(p.accent) : '#e06c75';
          g.globalAlpha = open ? 0.6 : 1;
          g.fillRect(c.x - cell / 2, c.y - cell / 2, cell, cell);
          g.globalAlpha = 1;
          block(c.x, c.y, cell / 2);
        }
        if (!open) {
          const c = at(e.tiles[0]);
          // A locked gate sits beside its exit: label it away from the exit's own label.
          const inner = e.tiles[0].x < cols / 2 ? 'r' : 'l';
          label(c.x, c.y, cell / 2 + 2, 'locked', '#e06c75', 12, MONO, [inner, e.tiles[0].y < rows / 2 ? 'b' : 'a']);
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
        block(c.x, c.y, r);
        const t = e.tiles[0];
        // Exits sit on the map's edge: the label goes outward, off the map.
        const sides: Side[] = t.x === 0 ? ['l', 'a', 'b'] : t.x === cols - 1 ? ['r', 'a', 'b'] : t.y < rows / 2 ? ['a', 'l', 'r'] : ['b', 'l', 'r'];
        label(c.x, c.y, r + 2, `to ${AREAS[e.to]?.name ?? e.to}`, '#b9b2a6', 12, MONO, sides);
      } else if (e.kind === 'practice') {
        const c = at(e.tile);
        g.fillStyle = '#9ad1c8';
        g.fillRect(c.x - r * 0.8, c.y - r * 0.8, r * 1.6, r * 1.6);
        g.strokeStyle = 'rgba(246,239,226,0.8)';
        g.lineWidth = 1;
        g.strokeRect(c.x - r * 0.8, c.y - r * 0.8, r * 1.6, r * 1.6);
        block(c.x, c.y, r * 0.8 + 1);
        const drilled = progress.drilled.includes(e.lesson) ? ' ✓' : '';
        label(c.x, c.y, r + 2, (wide ? 'practice' : 'practice bench') + drilled, '#9ad1c8', 12, MONO, wide ? ['a', 'b', 'l', 'r'] : ['l', 'r', 'a', 'b']);
      } else if (e.kind === 'fragment' && !progress.solved.includes(e.id)) {
        const c = at(e.tile);
        g.fillStyle = '#f2c46d';
        g.beginPath();
        g.arc(c.x, c.y, r * 0.8, 0, Math.PI * 2);
        g.fill();
        block(c.x, c.y, r * 0.8 + 1);
        label(c.x, c.y, r + 2, wide ? 'fragment' : 'melody fragment', '#f2c46d', 12, MONO, wide ? ['a', 'b', 'l', 'r'] : ['l', 'r', 'a', 'b']);
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
    block(me.x, me.y, r);
    label(me.x, me.y, r * 2 + 2, 'you', '#ffffff', 13, FONT, ['b', 'a', 'r', 'l']);

    this.placeLabels(width, height);
  }

  /** Lay the queued labels out around their markers and draw them, with leader lines where they had to move. */
  private placeLabels(width: number, height: number): void {
    const g = this.ctx;
    const placed: Rect[] = [];
    const pad = 3;
    const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    for (const l of this.labels) {
      g.font = `${l.size}px ${l.family}`;
      const tw = g.measureText(l.text).width;
      const th = l.size;
      const sides = [...l.sides, ...ALL_SIDES.filter((s) => !l.sides.includes(s))];
      let best: { rect: Rect; dist: number; cost: number } | null = null;
      for (const dist of [6, 18, 32]) {
        for (const side of sides) {
          const d = l.r + dist;
          const rect: Rect =
            side === 'r' ? { x: l.x + d, y: l.y - th / 2, w: tw, h: th }
            : side === 'l' ? { x: l.x - d - tw, y: l.y - th / 2, w: tw, h: th }
            : side === 'a' ? { x: l.x - tw / 2, y: l.y - d - th, w: tw, h: th }
            : { x: l.x - tw / 2, y: l.y + d, w: tw, h: th };
          const padded = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
          let cost = 0;
          for (const o of placed) cost += overlap(padded, o);
          for (const o of this.blocked) cost += overlap(padded, o);
          // Off the canvas counts heavily.
          cost += 1000 * (Math.max(0, -rect.x + 4) + Math.max(0, rect.x + rect.w - width + 4) + Math.max(0, -rect.y + 4) + Math.max(0, rect.y + rect.h - height + 4));
          // A mild preference for the earlier sides and the nearer distances.
          cost += dist * 0.05 + sides.indexOf(side) * 0.01;
          if (!best || cost < best.cost) best = { rect, dist, cost };
          if (cost < 0.1) break;
        }
        if (best && best.cost < 0.1) break;
      }
      if (!best) continue;
      const { rect, dist } = best;
      placed.push({ x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 });
      if (dist > 6) {
        // A leader from the marker's edge to the nearest point on the label.
        const lx = Math.max(rect.x, Math.min(rect.x + rect.w, l.x));
        const ly = Math.max(rect.y, Math.min(rect.y + rect.h, l.y));
        const dx = lx - l.x;
        const dy = ly - l.y;
        const len = Math.hypot(dx, dy) || 1;
        g.strokeStyle = l.color;
        g.globalAlpha = 0.55;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(l.x + (dx / len) * l.r, l.y + (dy / len) * l.r);
        g.lineTo(lx - (dx / len) * 2, ly - (dy / len) * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 3;
      g.strokeStyle = HALO;
      g.strokeText(l.text, rect.x, rect.y + th / 2);
      g.fillStyle = l.color;
      g.fillText(l.text, rect.x, rect.y + th / 2);
    }
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

import type { AreaDef } from '../world/areas';

/** Half extents of the feet box, in tiles. The 2D game used 18 by 10 px of a 32 px tile. */
export const FEET_HX = 0.28;
export const FEET_HZ = 0.16;

/**
 * Tile-grid collision, carried over from the 2D game. One unit is one tile; a position is the
 * centre of the player's feet. x runs east, z runs south (down the map).
 */
export class Grid {
  readonly w: number;
  readonly h: number;
  private blocked: boolean[][];

  constructor(readonly area: AreaDef) {
    this.h = area.map.length;
    this.w = Math.max(...area.map.map((r) => r.length));
    this.blocked = area.map.map((row) => [...row].map((c) => c === '#' || c === '~' || c === 'T' || c === 'D' || c === 'G'));
  }

  char(x: number, y: number): string {
    return this.area.map[y]?.[x] ?? '#';
  }

  isBlocked(px: number, pz: number): boolean {
    const x = Math.floor(px);
    const y = Math.floor(pz);
    return this.blocked[y]?.[x] ?? true;
  }

  setBlocked(x: number, y: number, v: boolean): void {
    if (this.blocked[y]) this.blocked[y][x] = v;
  }

  /** Where a position's feet stand, as a tile. */
  tileOf(px: number, pz: number): { x: number; y: number } {
    return { x: Math.floor(px), y: Math.floor(pz) };
  }

  free(x: number, y: number): boolean {
    return !(this.blocked[y]?.[x] ?? true);
  }

  /**
   * The shortest walk from a tile to any of some goal tiles, four ways at a time over free tiles, as
   * the tiles after the start; null when none can be reached. For a tap on the ground.
   */
  path(from: { x: number; y: number }, goals: { x: number; y: number }[]): { x: number; y: number }[] | null {
    const key = (x: number, y: number) => y * this.w + x;
    const want = new Set(goals.filter((g) => this.free(g.x, g.y)).map((g) => key(g.x, g.y)));
    if (!want.size) return null;
    if (want.has(key(from.x, from.y))) return [];
    const prev = new Map<number, number>();
    const queue = [from];
    prev.set(key(from.x, from.y), -1);
    for (let i = 0; i < queue.length; i++) {
      const { x, y } = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const k = key(nx, ny);
        if (prev.has(k) || !this.free(nx, ny)) continue;
        prev.set(k, key(x, y));
        if (want.has(k)) {
          const out: { x: number; y: number }[] = [];
          for (let c = k; c !== key(from.x, from.y); c = prev.get(c)!) out.push({ x: c % this.w, y: Math.floor(c / this.w) });
          return out.reverse();
        }
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  /**
   * Move by (dx, dz) with axis-separated sliding. Returns the new position and, when an axis was
   * stopped, the tile that stopped it (so the caller can react to a locked gate).
   */
  move(px: number, pz: number, dx: number, dz: number): { x: number; z: number; hit: { x: number; y: number } | null } {
    let hit: { x: number; y: number } | null = null;
    const free = (x: number, z: number) =>
      !this.isBlocked(x - FEET_HX, z - FEET_HZ) && !this.isBlocked(x + FEET_HX, z - FEET_HZ) && !this.isBlocked(x - FEET_HX, z + FEET_HZ) && !this.isBlocked(x + FEET_HX, z + FEET_HZ);
    let x = px;
    let z = pz;
    if (dx !== 0) {
      if (free(x + dx, z)) x += dx;
      else hit = this.tileOf(x + Math.sign(dx) * (FEET_HX + 0.06), z);
    }
    if (dz !== 0) {
      if (free(x, z + dz)) z += dz;
      else hit = this.tileOf(x, z + Math.sign(dz) * (FEET_HZ + 0.06));
    }
    return { x, z, hit };
  }
}

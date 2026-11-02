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

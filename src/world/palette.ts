/**
 * Colour system. Every texture is drawn in greys (luminance only) and tinted at runtime.
 * A tile's tint moves from the GREY palette to its area palette as the world comes back to life.
 */

export interface Palette {
  ground: number;
  groundAlt: number;
  wall: number;
  water: number;
  tree: number;
  bridge: number;
  accent: number;
  /** Scene background behind the tiles. */
  sky: number;
}

export const GREY: Palette = {
  ground: 0x8e9097,
  groundAlt: 0x84868d,
  wall: 0x6f727a,
  water: 0x7c8089,
  tree: 0x7a7d85,
  bridge: 0x85888f,
  accent: 0xa5a8ae,
  sky: 0x4a4d55,
};

export const PALETTES: Record<string, Palette> = {
  hub: {
    ground: 0xd9b56a,
    groundAlt: 0xcfa85c,
    wall: 0x8a5a3c,
    water: 0x4f8fc9,
    tree: 0x5e9e4e,
    bridge: 0xb07a45,
    accent: 0xf2c46d,
    sky: 0x2b2a4a,
  },
  valley: {
    ground: 0x7fc36d,
    groundAlt: 0x72b562,
    wall: 0x5b7c55,
    water: 0x4ea7d8,
    tree: 0x3f8f4a,
    bridge: 0xb8894f,
    accent: 0xf7d35c,
    sky: 0x203a5a,
  },
  town: {
    ground: 0xe3c08f,
    groundAlt: 0xd8b482,
    wall: 0xb0604a,
    water: 0x5aa6d6,
    tree: 0x7bb463,
    bridge: 0xc08a52,
    accent: 0xf0a04b,
    sky: 0x3a2a4e,
  },
  jazz: {
    ground: 0x6b5aa8,
    groundAlt: 0x614f9c,
    wall: 0x3c2f6b,
    water: 0x4c7fd6,
    tree: 0x8a5fb8,
    bridge: 0xa07be0,
    accent: 0xff6fa8,
    sky: 0x120d26,
  },
  stage: {
    ground: 0x3d3550,
    groundAlt: 0x37304a,
    wall: 0x2a2438,
    water: 0x4c7fd6,
    tree: 0x6a5a8a,
    bridge: 0xb07a45,
    accent: 0xffd86b,
    sky: 0x0d0b16,
  },
};

export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

export function colorToCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

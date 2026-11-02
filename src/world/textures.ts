import Phaser from 'phaser';

export const TILE = 32;

/**
 * All world art is generated here at boot with the Graphics API, in greyscale. Tints add colour,
 * so every surface is authored as luminance: 0xffffff is the lightest a tint can reach, and most
 * surfaces sit between 0x90 and 0xf0 so the area palette shows through.
 *
 * Tiles: ground (two variants), wall as three pieces (ridge, top, face) so a block of walls reads
 * as a roof over a brick front, water in two frames, tree, bridge. Props: doors, gates, serpent,
 * fragment, practice bench, glow.
 */
export function ensureTextures(scene: Phaser.Scene): void {
  const tm = scene.textures;
  if (tm.exists('tile-ground')) return;
  const g = scene.add.graphics();

  const seeded = (seed: number) => {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };
  const px = (x: number, y: number, c: number, w = 1, h = 1) => g.fillStyle(c).fillRect(x, y, w, h);
  /** Draw a small pixel grid from strings; '.' is transparent. */
  const grid = (rows: string[], legend: Record<string, number>, ox = 0, oy = 0) => {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch !== '.' && legend[ch] !== undefined) px(ox + x, oy + y, legend[ch]);
      });
    });
  };

  // ---------- ground: soft flat base with grass tufts and pebbles ----------
  for (const [key, seed] of [['tile-ground', 1], ['tile-ground-alt', 2]] as const) {
    g.clear();
    px(0, 0, 0xd8d8d8, TILE, TILE);
    const r = seeded(seed);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(r() * 29);
      const y = Math.floor(r() * 29);
      // A tuft: three short blades.
      px(x, y + 1, 0xe8e8e8, 1, 2);
      px(x + 1, y, 0xf0f0f0, 1, 3);
      px(x + 2, y + 1, 0xe8e8e8, 1, 2);
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(r() * 30);
      const y = Math.floor(r() * 30);
      px(x, y, 0xc4c4c4, 2, 1);
      px(x, y + 1, 0xbcbcbc, 2, 1);
    }
    if (seed === 2) {
      // A worn patch.
      px(10, 14, 0xcfcfcf, 12, 6);
      px(12, 13, 0xcfcfcf, 8, 8);
    }
    g.generateTexture(key, TILE, TILE);
  }

  // ---------- wall pieces ----------
  // Face: a brick front with a dark footing, seen from the street.
  const brickFace = () => {
    px(0, 0, 0xb4b4b4, TILE, TILE);
    for (let row = 0; row < 6; row++) {
      const y = row * 5 + 1;
      const off = row % 2 ? 6 : 0;
      for (let x = -6 + off; x < TILE; x += 12) {
        px(x, y, 0xc8c8c8, 11, 4);
        px(x, y, 0xd6d6d6, 11, 1); // top light
        px(x + 10, y, 0xa6a6a6, 1, 4); // right shade
      }
    }
    px(0, 0, 0x8c8c8c, TILE, 1); // under the eaves
    px(0, TILE - 2, 0x6e6e6e, TILE, 2); // footing
  };
  g.clear();
  brickFace();
  g.generateTexture('tile-wall-face', TILE, TILE);
  g.generateTexture('tile-wall', TILE, TILE);

  // Top: a roof of scalloped shingles, darker than the brick face so a block reads as roof over wall.
  const shingles = (ridge: boolean) => {
    px(0, 0, 0x6a6a6a, TILE, TILE);
    for (let row = 0; row < 6; row++) {
      const y = row * 6 - 2;
      const off = row % 2 ? 5 : 0;
      for (let x = -5 + off; x < TILE; x += 10) {
        px(x + 1, y, 0x9a9a9a, 8, 5);
        px(x + 2, y + 5, 0x9a9a9a, 6, 1); // rounded bottom
        px(x + 1, y, 0xb0b0b0, 8, 2);
        px(x + 1, y + 5, 0x505050, 1, 1);
        px(x + 8, y + 5, 0x505050, 1, 1);
        px(x + 2, y + 6, 0x505050, 6, 1);
      }
    }
    if (ridge) {
      px(0, 0, 0xd8d8d8, TILE, 3);
      px(0, 3, 0x505050, TILE, 1);
    }
  };
  g.clear();
  shingles(false);
  g.generateTexture('tile-wall-top', TILE, TILE);
  g.clear();
  shingles(true);
  g.generateTexture('tile-wall-ridge', TILE, TILE);

  // ---------- water: two frames of drifting highlights ----------
  for (const [key, phase] of [['tile-water-a', 0], ['tile-water-b', 4]] as const) {
    g.clear();
    px(0, 0, 0xc0c0c0, TILE, TILE);
    for (let y = 3; y < TILE; y += 8) {
      const x0 = ((y / 8) * 5 + phase) % 8;
      px(x0, y, 0xe6e6e6, 6, 1);
      px(x0 + 2, y + 1, 0xd4d4d4, 3, 1);
      px((x0 + 14) % 30, y + 4, 0xaeaeae, 5, 1);
    }
    g.generateTexture(key, TILE, TILE);
  }
  g.generateTexture('tile-water', TILE, TILE);

  // ---------- bridge: planks with rope rails ----------
  g.clear();
  px(0, 0, 0xb0b0b0, TILE, TILE);
  px(0, 0, 0x6a6a6a, TILE, TILE);
  for (let y = 0; y < TILE; y += 6) {
    px(3, y + 1, 0xd2d2d2, TILE - 6, 4);
    px(3, y + 1, 0xdedede, TILE - 6, 1);
    px(3, y + 5, 0x4e4e4e, TILE - 6, 1); // gap between planks
  }
  px(0, 0, 0x8a8a8a, 3, TILE); // rails
  px(TILE - 3, 0, 0x8a8a8a, 3, TILE);
  for (let y = 0; y < TILE; y += 8) {
    px(0, y, 0x3e3e3e, 3, 3); // posts
    px(TILE - 3, y, 0x3e3e3e, 3, 3);
  }
  g.generateTexture('tile-bridge', TILE, TILE);

  // ---------- tree: a round canopy seen from above, lit from the top left, over a short trunk ----------
  // Transparent background: it is drawn over a ground tile so the two take different tints.
  g.clear();
  g.fillStyle(0x000000, 0.22).fillEllipse(17, 28, 16, 5); // shadow on the ground
  px(13, 23, 0x5e5e5e, 6, 6); // trunk
  px(13, 23, 0x7a7a7a, 1, 6);
  px(18, 23, 0x4a4a4a, 1, 6);
  const canopy: string[] = [
    '..........OOOOOOOO..........',
    '.......OOOooooooooOOO.......',
    '.....OOooooooooooooooOO.....',
    '....OooooLLLooooooooooO.....',
    '...OoooLLLLLLLooooooooooO...',
    '..OoooLLLLLLLLLoooooooooO...',
    '..OooLLLLLLLLLoooooooooooO..',
    '.OoooLLLLLLLoooooooooooooO..',
    '.OoooLLLLLLooooooooooooddO..',
    '.OooooLLLooooooooooooddddO..',
    '.OooooooooooooooooooddddddO.',
    '.OoooooooooooooooooddddddoO.',
    '.OoooooooooooooooodddddddO..',
    '..OooooooooooooooddddddddO..',
    '..OOoooooooooooodddddddOO...',
    '...OOoooooooooodddddddOO....',
    '....OOoooooooodddddddOO.....',
    '.....OOooooooddddddOO.......',
    '.......OOOooddddOOO.........',
    '..........OOOOOO............',
  ];
  grid(canopy, { O: 0x3e3e3e, o: 0xa8a8a8, L: 0xd8d8d8, d: 0x7c7c7c }, 2, 2);
  g.generateTexture('tile-tree', TILE, TILE);

  // ---------- doors ----------
  // Closed: an arched wooden door set into the brick face, with a ring.
  g.clear();
  brickFace();
  const door: string[] = [
    '.....OOOOOOOO.....',
    '...OOwwwwwwwwOO...',
    '..OwwwwwwwwwwwwO..',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
    '.OwwWwwWwwWwwWwwO.',
  ];
  grid(door, { O: 0x3a3a3a, w: 0xa4a4a4, W: 0x8e8e8e }, 7, 4);
  px(9, 30, 0xe8e8e8, 14, 1); // lit threshold
  px(10, 17, 0x5a5a5a, 4, 1); // knocker band
  px(19, 16, 0xf0f0f0, 2, 2); // ring highlight
  px(18, 17, 0xc8c8c8, 1, 2);
  g.generateTexture('door-closed', TILE, TILE);

  // Open: the arch with a dark passage and a strip of light on the floor.
  g.clear();
  px(0, 0, 0xd8d8d8, TILE, TILE);
  px(4, 0, 0xa8a8a8, 4, TILE); // jambs
  px(TILE - 8, 0, 0xa8a8a8, 4, TILE);
  px(4, 0, 0xc2c2c2, 1, TILE);
  px(TILE - 5, 0, 0x8a8a8a, 1, TILE);
  px(8, 0, 0x2e2e2e, 16, 6); // lintel shadow
  px(8, 6, 0x3c3c3c, 16, 2);
  px(10, 26, 0xf2f2f2, 12, 2); // light on the threshold
  g.generateTexture('door-open', TILE, TILE);

  // Gate: a portcullis of bars in a stone frame; open raises the bars.
  for (const [key, open] of [['gate-closed', false], ['gate-open', true]] as const) {
    g.clear();
    px(0, 0, 0xd8d8d8, TILE, TILE);
    px(0, 0, 0x9e9e9e, 5, TILE);
    px(TILE - 5, 0, 0x9e9e9e, 5, TILE);
    px(0, 0, 0xb8b8b8, TILE, 5);
    px(1, 1, 0xcacaca, TILE - 2, 1);
    const bottom = open ? 14 : TILE;
    px(5, 5, 0x3a3a3a, TILE - 10, 2); // lintel
    for (let x = 7; x < TILE - 5; x += 5) px(x, 5, 0x5a5a5a, 2, bottom - 5);
    for (let y = 9; y < bottom; y += 7) px(5, y, 0x6a6a6a, TILE - 10, 2);
    if (!open) for (let x = 7; x < TILE - 5; x += 5) px(x, TILE - 4, 0x3a3a3a, 2, 4); // spikes into the ground
    g.generateTexture(key, TILE, TILE);
  }

  // ---------- serpent segment: a scaled disc ----------
  g.clear();
  g.fillStyle(0x5a5a5a).fillCircle(16, 17, 14);
  g.fillStyle(0xa0a0a0).fillCircle(16, 16, 13);
  const scales: string[] = ['..nn..nn..nn..', 'nn..nn..nn..nn', '..nn..nn..nn..', 'nn..nn..nn..nn', '..nn..nn..nn..'];
  grid(scales, { n: 0xc4c4c4 }, 9, 10);
  g.fillStyle(0xd8d8d8).fillCircle(12, 11, 4);
  g.generateTexture('serpent', TILE, TILE);

  // ---------- melody fragment: a note glyph ----------
  g.clear();
  g.fillStyle(0xffffff).fillEllipse(10, 22, 12, 8);
  g.fillRect(14, 4, 3, 19);
  g.fillRect(14, 4, 9, 3);
  g.generateTexture('fragment', 24, 28);

  // ---------- practice bench: a lectern with an open book, on ground ----------
  g.clear();
  px(0, 0, 0xd8d8d8, TILE, TILE);
  px(6, 28, 0x9a9a9a, 20, 3);
  px(13, 15, 0x5a5a5a, 6, 13); // post
  px(13, 15, 0x8a8a8a, 1, 13);
  px(7, 26, 0x3e3e3e, 18, 4); // foot
  const book: string[] = [
    '..OOOOOOOOOOOOOOOOOOOO..',
    '.OwwwwwwwwwOOwwwwwwwwwO.',
    'OwwllwwllwwwOwwllwwllwwO',
    'OwwwwwwwwwwwOwwwwwwwwwwO',
    'OwwllwwwllwwOwwllwwwllwO',
    'OwwwwwwwwwwwOwwwwwwwwwwO',
    'OwwlwwllwwwwOwwlwwllwwwO',
    '.OwwwwwwwwwwOwwwwwwwwwO.',
    '..OOOOOOOOOOOOOOOOOOOO..',
  ];
  grid(book, { O: 0x4a4a4a, w: 0xf2f2f2, l: 0xa8a8a8 }, 4, 6);
  g.generateTexture('practice', TILE, TILE);

  // ---------- soft glow used for blooms and highlights ----------
  g.clear();
  for (let r = 24; r > 0; r -= 2) {
    g.fillStyle(0xffffff, 0.06).fillCircle(24, 24, r);
  }
  g.generateTexture('glow', 48, 48);

  // One white pixel for bars and panels.
  g.clear();
  px(0, 0, 0xffffff, 2, 2);
  g.generateTexture('px', 2, 2);

  g.destroy();
}

import Phaser from 'phaser';

export const TILE = 32;

/**
 * All art is generated here at boot with the Graphics API, in greyscale. Tints add colour.
 * Luminance convention: 0xffffff is the lightest a tint can reach, so draw most surfaces 0xc0..0xff.
 */
export function ensureTextures(scene: Phaser.Scene): void {
  const tm = scene.textures;
  if (tm.exists('tile-ground')) return;
  const g = scene.add.graphics();

  const seeded = (seed: number) => {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };

  // Ground: flat with a few lighter specks. Two variants.
  for (const [key, seed] of [['tile-ground', 1], ['tile-ground-alt', 2]] as const) {
    g.clear();
    g.fillStyle(0xdcdcdc).fillRect(0, 0, TILE, TILE);
    const r = seeded(seed);
    g.fillStyle(0xf0f0f0);
    for (let i = 0; i < 5; i++) g.fillRect(Math.floor(r() * 28), Math.floor(r() * 28), 3, 2);
    g.fillStyle(0xc8c8c8);
    for (let i = 0; i < 3; i++) g.fillRect(Math.floor(r() * 28), Math.floor(r() * 28), 2, 2);
    g.generateTexture(key, TILE, TILE);
  }

  // Wall: a rounded block with a top highlight and dark base.
  g.clear();
  g.fillStyle(0x707070).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0xbdbdbd).fillRoundedRect(1, 1, TILE - 2, TILE - 6, 5);
  g.fillStyle(0xe6e6e6).fillRoundedRect(4, 3, TILE - 8, 8, 3);
  g.generateTexture('tile-wall', TILE, TILE);

  // Water: horizontal waves.
  g.clear();
  g.fillStyle(0xc4c4c4).fillRect(0, 0, TILE, TILE);
  g.lineStyle(2, 0xe8e8e8);
  for (let y = 6; y < TILE; y += 10) {
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= TILE; x += 8) g.lineTo(x, y + (x / 8) % 2 === 0 ? y : y + 3);
    g.strokePath();
  }
  g.generateTexture('tile-water', TILE, TILE);

  // Tree: round canopy with a trunk, over ground.
  g.clear();
  g.fillStyle(0xdcdcdc).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x8a8a8a).fillRect(13, 20, 6, 10);
  g.fillStyle(0x9a9a9a).fillCircle(16, 14, 13);
  g.fillStyle(0xc9c9c9).fillCircle(13, 11, 8);
  g.generateTexture('tile-tree', TILE, TILE);

  // Bridge: planks.
  g.clear();
  g.fillStyle(0xb5b5b5).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0xd9d9d9);
  for (let y = 0; y < TILE; y += 8) g.fillRect(0, y + 1, TILE, 5);
  g.fillStyle(0x8f8f8f).fillRect(0, 0, 3, TILE).fillRect(TILE - 3, 0, 3, TILE);
  g.generateTexture('tile-bridge', TILE, TILE);

  // Door: an arch set into a wall. Two states.
  g.clear();
  g.fillStyle(0x707070).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0xbdbdbd).fillRoundedRect(1, 1, TILE - 2, TILE - 6, 5);
  g.fillStyle(0x555555).fillRoundedRect(7, 6, 18, 26, { tl: 9, tr: 9, bl: 0, br: 0 });
  g.fillStyle(0xf4f4f4).fillCircle(16, 20, 3);
  g.generateTexture('door-closed', TILE, TILE);
  g.clear();
  g.fillStyle(0xdcdcdc).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0xbdbdbd).fillRoundedRect(0, 0, 6, TILE, 2).fillRoundedRect(TILE - 6, 0, 6, TILE, 2);
  g.fillStyle(0xf4f4f4).fillRect(6, 0, TILE - 12, 5);
  g.generateTexture('door-open', TILE, TILE);

  // Player: a small bard. 24x32, facing down. Body, head, scarf.
  g.clear();
  g.fillStyle(0x3a3a3a).fillEllipse(12, 29, 18, 6); // shadow
  g.fillStyle(0xcfcfcf).fillRoundedRect(4, 12, 16, 15, 4); // cloak
  g.fillStyle(0xf2f2f2).fillCircle(12, 9, 8); // head
  g.fillStyle(0x3a3a3a).fillRect(8, 8, 2, 3).fillRect(14, 8, 2, 3); // eyes
  g.fillStyle(0xa8a8a8).fillRect(5, 13, 14, 3); // scarf
  g.generateTexture('player', 24, 32);

  // Serpent segment: a scaled disc.
  g.clear();
  g.fillStyle(0xa0a0a0).fillCircle(16, 16, 14);
  g.fillStyle(0xd0d0d0).fillCircle(12, 12, 6);
  g.generateTexture('serpent', TILE, TILE);

  // Melody fragment: a note glyph.
  g.clear();
  g.fillStyle(0xffffff).fillEllipse(10, 22, 12, 8);
  g.fillRect(14, 4, 3, 19);
  g.fillRect(14, 4, 9, 3);
  g.generateTexture('fragment', 24, 28);

  // Practice bench: a lectern with an open book, on ground.
  g.clear();
  g.fillStyle(0xdcdcdc).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x3a3a3a, 0.5).fillEllipse(16, 29, 22, 6);
  g.fillStyle(0x8a8a8a).fillRect(14, 14, 4, 14);
  g.fillStyle(0x9a9a9a).fillRoundedRect(8, 26, 16, 4, 2);
  g.fillStyle(0xf4f4f4).fillRoundedRect(4, 6, 24, 11, 2);
  g.fillStyle(0xa8a8a8).fillRect(15, 7, 2, 9);
  g.fillStyle(0xbdbdbd).fillRect(7, 9, 6, 1).fillRect(7, 12, 6, 1).fillRect(19, 9, 6, 1).fillRect(19, 12, 6, 1);
  g.generateTexture('practice', TILE, TILE);

  // Soft glow used for blooms and highlights.
  g.clear();
  for (let r = 24; r > 0; r -= 2) {
    g.fillStyle(0xffffff, 0.06).fillCircle(24, 24, r);
  }
  g.generateTexture('glow', 48, 48);

  // One white pixel for bars and panels.
  g.clear();
  g.fillStyle(0xffffff).fillRect(0, 0, 2, 2);
  g.generateTexture('px', 2, 2);

  g.destroy();
}

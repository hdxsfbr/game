import { describe, expect, it } from 'vitest';
import { AREAS } from '../src/world/areas';

const WALKABLE = new Set(['.', '=', 'X', 'D', 'G']);

function reachable(map: string[], from: { x: number; y: number }): Set<string> {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const { x, y } = stack.pop()!;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    const c = map[y]?.[x];
    if (c === undefined || !WALKABLE.has(c)) continue;
    seen.add(key);
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  return seen;
}

describe.each(Object.values(AREAS))('area $id', (area) => {
  it('is rectangular with a solid border', () => {
    const w = area.map[0].length;
    for (const row of area.map) expect(row.length).toBe(w);
    const edgeOk = (c: string) => c === '#' || c === 'X' || c === 'G';
    for (const row of area.map) {
      expect(edgeOk(row[0])).toBe(true);
      expect(edgeOk(row[w - 1])).toBe(true);
    }
    for (const c of area.map[0]) expect(edgeOk(c)).toBe(true);
    for (const c of area.map[area.map.length - 1]) expect(edgeOk(c)).toBe(true);
  });

  it('places every door, gate and exit on a matching tile', () => {
    for (const e of area.entities) {
      if (e.kind === 'fragment' || e.kind === 'practice' || e.kind === 'npc' || e.kind === 'prop') {
        expect(area.map[e.tile.y][e.tile.x], `${e.kind} at ${e.tile.x},${e.tile.y}`).toBe('.');
        if (e.kind === 'practice') expect(area.map[e.at.y][e.at.x]).toBe('.');
        continue;
      }
      if (e.kind === 'stage') {
        for (const t of e.tiles) expect(area.map[t.y][t.x], `stage at ${t.x},${t.y}`).toBe('.');
        continue;
      }
      const want = e.kind === 'door' ? 'D' : e.kind === 'gate' ? 'G' : 'X';
      for (const t of e.tiles) expect(`${e.kind}@${t.x},${t.y}=${area.map[t.y][t.x]}`).toBe(`${e.kind}@${t.x},${t.y}=${want}`);
    }
  });

  it('every D, G and X tile belongs to an entity', () => {
    const owned = new Set<string>();
    for (const e of area.entities) if (e.kind !== 'fragment' && e.kind !== 'practice' && e.kind !== 'npc' && e.kind !== 'prop' && e.kind !== 'stage') for (const t of e.tiles) owned.add(`${t.x},${t.y}`);
    area.map.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === 'D' || c === 'G' || c === 'X') expect(owned.has(`${x},${y}`), `${c} at ${x},${y}`).toBe(true);
      });
    });
  });

  it('reaches every entity from the start when doors are open', () => {
    const seen = reachable(area.map, area.start);
    for (const e of area.entities) {
      const tiles = e.kind === 'fragment' || e.kind === 'practice' || e.kind === 'npc' || e.kind === 'prop' ? [e.tile] : e.tiles;
      for (const t of tiles) {
        const neighbours = [t, { x: t.x + 1, y: t.y }, { x: t.x - 1, y: t.y }, { x: t.x, y: t.y + 1 }, { x: t.x, y: t.y - 1 }];
        expect(neighbours.some((n) => seen.has(`${n.x},${n.y}`)), `${e.kind} at ${t.x},${t.y}`).toBe(true);
      }
    }
  });

  it('puts every person on the stage on one of its tiles, and no one else', () => {
    const stage = new Set(area.entities.filter((e) => e.kind === 'stage').flatMap((e) => (e as { tiles: { x: number; y: number }[] }).tiles.map((t) => `${t.x},${t.y}`)));
    for (const e of area.entities) {
      if (e.kind !== 'npc') continue;
      const onStage = stage.has(`${e.tile.x},${e.tile.y}`);
      expect(onStage, `${e.model} at ${e.tile.x},${e.tile.y}`).toBe(['bassist', 'drummer', 'hornplayer', 'chorister', 'chorister-2'].includes(e.model) && (area.id === 'jazz' || area.id === 'stage'));
    }
  });

  it('has one practice bench with a lesson', () => {
    const benches = area.entities.filter((e) => e.kind === 'practice');
    expect(benches.length).toBe(1);
  });

  it('has unique puzzle ids', () => {
    const ids = area.entities.filter((e) => e.kind === 'door').map((e) => (e as { puzzle: { id: string } }).puzzle.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('valley gating', () => {
  it('cannot reach the serpent from the entrance without passing the five doors', () => {
    const area = AREAS.valley;
    const closed = area.map.map((row) => row.replace(/D/g, '#'));
    const seen = reachable(closed, area.start);
    expect(seen.has('39,16')).toBe(true); // east bank of the bridge
    expect(seen.has('35,16')).toBe(false); // west bank
    expect(seen.has('7,18')).toBe(false); // serpent's north bank
  });
});

describe('talk', () => {
  it('gives every person in every area some lines, before and after their door', async () => {
    const { talkFor } = await import('../src/world/talk');
    for (const area of Object.values(AREAS)) {
      for (const e of area.entities) {
        if (e.kind !== 'npc') continue;
        const t = talkFor(area.id, e.model);
        expect(t, `${area.id}/${e.model}`).not.toBeNull();
        expect(t!.after.length, `${area.id}/${e.model} after`).toBeGreaterThan(0);
        // The quarter's band is frozen until its door and says nothing before it.
        if (!(area.id === 'jazz' && ['bassist', 'drummer'].includes(e.model))) expect(t!.before.length, `${area.id}/${e.model} before`).toBeGreaterThan(0);
        for (const line of [...t!.before, ...t!.after]) expect(line.length, line).toBeLessThan(90);
      }
    }
  });
});

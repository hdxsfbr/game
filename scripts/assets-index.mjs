#!/usr/bin/env node
// Write public/character/index.json and public/props/index.json: the model names present, which is what
// the game reads before fetching a person or prop (src/scenes3d/World.ts loadExtras). Run after dropping
// a glb into either folder. Usage: node scripts/assets-index.mjs
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
for (const dir of ['public/character', 'public/props']) {
  mkdirSync(dir, { recursive: true });
  const names = readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).filter((n) => n !== 'mannequin').sort();
  writeFileSync(`${dir}/index.json`, JSON.stringify(names) + '\n');
  console.log(dir, names.join(', ') || '(none)');
}

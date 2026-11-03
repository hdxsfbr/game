#!/usr/bin/env node
// Dump the loaded 3D scene from headless Chrome: meshes, vertex counts, materials, shadow casters.
// Usage: node scripts/inspect3d.mjs [baseUrl] [area] [--quiet] then any sequence of
//   --eval "js run with w = window.__lk"   --shot file.png   --wait ms
// which are carried out in order.
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';

const base = process.argv[2] ?? 'https://localhost:5180';
const area = process.argv[3] ?? 'hub';
const quiet = process.argv.includes('--quiet');
const chrome = execSync('command -v google-chrome || command -v chromium || command -v chromium-browser').toString().trim();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`${base}/?reset=1&scene=world&area=${area}`, { waitUntil: 'load' });
await page.waitForSelector('#btn-play', { timeout: 15000 });
await page.click('#btn-play');
const t0 = Date.now();
while (Date.now() - t0 < 30000 && !(await page.evaluate(() => !!(window.__lk && window.__lk.ready)))) await sleep(200);
await sleep(700);
// The story card shown on first arrival: Space closes it.
if (await page.evaluate(() => !!(window.__lk.storyCard && window.__lk.storyCard.visible))) {
  await page.keyboard.press('Space');
  await sleep(600);
}
const info = await page.evaluate(() => {
  const w = window.__lk;
  const s = w.scene;
  const casters = new Set();
  for (const l of s.lights) {
    const g = l.getShadowGenerator && l.getShadowGenerator();
    if (g) for (const m of g.getShadowMap().renderList ?? []) casters.add(m.name);
  }
  return {
    meshes: s.meshes.map((m) => ({ name: m.name, verts: m.getTotalVertices(), mat: m.material?.name, alpha: m.material?.alpha, mode: m.material?.transparencyMode, enabled: m.isEnabled(), visible: m.isVisible, caster: casters.has(m.name), pos: m.getAbsolutePosition().asArray().map((v) => +v.toFixed(2)) })),
    materials: s.materials.map((m) => ({ name: m.name, cls: m.getClassName(), alpha: m.alpha })),
    nodes: s.transformNodes.map((n) => n.name),
    player: { x: w.player.x, z: w.player.z },
  };
});
if (!quiet) console.log(JSON.stringify(info, null, 1));
for (let i = 4; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--eval') {
    const r = await page.evaluate((js) => { const w = window.__lk; return JSON.stringify(new Function('w', js)(w)); }, process.argv[++i]);
    console.log('eval:', r);
    await sleep(2500);
  } else if (a === '--shot') await page.screenshot({ path: process.argv[++i] });
  else if (a === '--wait') await sleep(Number(process.argv[++i]));
}
await browser.close();

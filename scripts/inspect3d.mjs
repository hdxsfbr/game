#!/usr/bin/env node
// Dump the loaded 3D scene from headless Chrome: meshes, vertex counts, materials, shadow casters.
// Usage: node scripts/inspect3d.mjs [baseUrl] [area] [--quiet] then any sequence of
//   --eval "js run with w = window.__lk"   --shot file.png   --wait ms   --query "ao=on&x=20&y=20"   --progress json   --gpu   --dpr 2
// which are carried out in order.
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';

const base = process.argv[2] ?? 'https://localhost:5180';
const area = process.argv[3] ?? 'hub';
const quiet = process.argv.includes('--quiet');
const qi = process.argv.indexOf('--query');
// --progress '{"solved":[...]}' seeds saved progress (and skips the reset), e.g. to see an area in colour.
const pi = process.argv.indexOf('--progress');
const seed = pi > 0 ? process.argv[pi + 1] : '';
// --gpu [vulkan|gl|gl-egl] renders on the machine's GPU instead of swiftshader, for frame-rate measurements.
const gi = process.argv.indexOf('--gpu');
const gpu = gi > 0 ? (process.argv[gi + 1] && !process.argv[gi + 1].startsWith('--') ? process.argv[gi + 1] : 'vulkan') : '';
const query = qi > 0 ? '&' + process.argv[qi + 1] : '';
// --dpr 2 renders at a device pixel ratio of 2, as a retina display would.
const di = process.argv.indexOf('--dpr');
const dpr = di > 0 ? Number(process.argv[di + 1]) : 1;
const chrome = execSync('command -v google-chrome || command -v chromium || command -v chromium-browser').toString().trim();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720', ...(gpu ? ['--use-gl=angle', `--use-angle=${gpu}`, '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-features=Vulkan', '--disable-gpu-vsync', '--disable-frame-rate-limit'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: dpr },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console.' + m.type(), m.text().slice(0, 300)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (seed) await page.evaluateOnNewDocument((v) => localStorage.setItem('listening-kingdom.progress.v1', v), seed);
await page.goto(`${base}/?${seed ? '' : 'reset=1&'}scene=world&area=${area}${query}`, { waitUntil: 'load' });
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
  if (a === '--query' || a === '--progress' || a === '--dpr') i++;
  else if (a === '--gpu') { if (process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) i++; }
  else if (a === '--eval') {
    const r = await page.evaluate((js) => { const w = window.__lk; return JSON.stringify(new Function('w', js)(w)); }, process.argv[++i]);
    console.log('eval:', r);
    await sleep(2500);
  } else if (a === '--shot') await page.screenshot({ path: process.argv[++i] });
  else if (a === '--wait') await sleep(Number(process.argv[++i]));
}
await browser.close();

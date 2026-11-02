#!/usr/bin/env node
// Headless screenshots of the 3D world: boot, Play, then a few steps in each direction.
// Usage: node scripts/screenshot3d.mjs [baseUrl] [outDir] [area] [x] [y]
// Exits non-zero on console errors or if the world never becomes ready.
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'https://localhost:5180';
const out = process.argv[3] ?? 'scratch/shots';
const area = process.argv[4] ?? 'hub';
const x = process.argv[5];
const y = process.argv[6];
mkdirSync(out, { recursive: true });
const chrome = execSync('command -v google-chrome || command -v chromium || command -v chromium-browser').toString().trim();

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|WebGL/.test(m.text())) errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

const at = x && y ? `&x=${x}&y=${y}` : '';
await page.goto(`${base}/?reset=1&scene=world&area=${area}${at}`, { waitUntil: 'load' });
await sleep(800);
await shot('00-title');
await page.click('#btn-play');
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  if (await page.evaluate(() => !!(window.__lk && window.__lk.ready))) break;
  await sleep(200);
}
if (!(await page.evaluate(() => !!(window.__lk && window.__lk.ready)))) throw new Error('world never became ready');
await sleep(900);
await shot(`01-${area}`);
const pos = () => page.evaluate(() => ({ x: window.__lk.player.x, z: window.__lk.player.z, area: window.__lk.area.id }));
console.log('start', await pos());
for (const [key, name] of [['ArrowLeft', 'west'], ['ArrowUp', 'north'], ['ArrowRight', 'east'], ['ArrowDown', 'south']]) {
  await page.keyboard.down(key);
  await sleep(900);
  await shot(`02-walk-${name}`);
  await page.keyboard.up(key);
  await sleep(150);
  console.log(name, await pos());
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('ok');

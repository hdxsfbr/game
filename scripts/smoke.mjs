#!/usr/bin/env node
// Smoke-test a deployed build: the page loads, the game boots, Play enters the world, no console errors.
// Usage: node scripts/smoke.mjs <baseUrl> [outDir]
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const base = process.argv[2];
if (!base) throw new Error('usage: smoke.mjs <baseUrl> [outDir]');
const out = process.argv[3] ?? 'scratch/smoke';
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
page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|WebGL|ERR_CERT/.test(m.text())) errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await page.goto(`${base}/?reset=1`, { waitUntil: 'load' });
if (!res || res.status() !== 200) throw new Error(`index returned ${res?.status()}`);
await sleep(1500);
const canvas = await page.$('canvas');
if (!canvas) throw new Error('no canvas: the game did not boot');
await page.screenshot({ path: `${out}/01-title.png` });

// Play enters the world with the keys; the world is ready once the glb and the character are in.
await page.click('#btn-play');
for (let i = 0; i < 150; i++) { if (await page.evaluate(() => !!(window.__lk && window.__lk.ready))) break; await sleep(200); }
if (!(await page.evaluate(() => !!(window.__lk && window.__lk.ready)))) throw new Error('world never became ready');
await sleep(800);
if (await page.evaluate(() => !!(window.__lk.storyCard && window.__lk.storyCard.visible))) { await page.keyboard.press('Space'); await sleep(600); }
await page.screenshot({ path: `${out}/02-world.png` });
const area = await page.evaluate(() => JSON.parse(localStorage.getItem('listening-kingdom.progress.v1') ?? '{}').area);
if (area !== 'hub') throw new Error(`expected to be in the hub after Play, progress says ${area}`);

// Walk to the hearth door and open the panel.
await page.keyboard.down('ArrowLeft');
await sleep(1500);
await page.keyboard.up('ArrowLeft');
await page.keyboard.press('Space');
await sleep(2500);
await page.screenshot({ path: `${out}/03-door.png` });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('ok');

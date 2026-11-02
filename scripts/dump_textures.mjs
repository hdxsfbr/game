#!/usr/bin/env node
// Dump the code-drawn textures from a running dev server as PNGs, plus a magnified contact sheet
// on magenta for review. Usage: node scripts/dump_textures.mjs [baseUrl] [outDir]
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'https://localhost:5180';
const out = process.argv[3] ?? 'scratch/textures';
mkdirSync(out, { recursive: true });
const chrome = execSync('command -v google-chrome || command -v chromium').toString().trim();
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
await page.goto(`${base}/?scene=world&area=hub&x=14&y=8`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 800));
const c = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
await page.mouse.click(c.x + (c.w * 650) / 960, c.y + (c.h * 290) / 540);
await new Promise((r) => setTimeout(r, 1500));
const keys = ['tile-ground', 'tile-ground-alt', 'tile-wall-face', 'tile-wall-top', 'tile-wall-ridge', 'tile-water-a', 'tile-water-b', 'tile-bridge', 'tile-tree', 'door-closed', 'door-open', 'gate-closed', 'gate-open', 'serpent', 'fragment', 'practice'];
const dump = await page.evaluate((keys) => {
  const w = window.__lk;
  const res = {};
  for (const k of keys) {
    const src = w.textures.get(k).getSourceImage();
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0);
    res[k] = cv.toDataURL('image/png');
  }
  return res;
}, keys);
for (const [k, url] of Object.entries(dump)) writeFileSync(`${out}/${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', Object.keys(dump).length, 'textures to', out);
await browser.close();

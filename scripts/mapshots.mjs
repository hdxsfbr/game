#!/usr/bin/env node
// Screenshots of the kingdom map (M) in every area at desktop and phone sizes.
// Usage: node scripts/mapshots.mjs [baseUrl] [outDir] [prefix] [area ...]
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'https://localhost:5180';
const out = process.argv[3] ?? 'scratch/maps';
const prefix = process.argv[4] ?? '';
const areas = process.argv.length > 5 ? process.argv.slice(5) : ['hub', 'valley', 'town', 'jazz', 'stage'];
const SIZES = [['desktop', 1280, 720], ['phone', 390, 844], ['phone-wide', 844, 390]];
mkdirSync(out, { recursive: true });
const chrome = execSync('command -v google-chrome || command -v chromium || command -v chromium-browser').toString().trim();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
for (const area of areas) {
  for (const [name, w, h] of SIZES) {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${base}/?reset=1&scene=world&area=${area}`, { waitUntil: 'load' });
    await page.waitForSelector('#btn-play', { timeout: 15000 });
    await page.click('#btn-play');
    const t0 = Date.now();
    while (Date.now() - t0 < 30000 && !(await page.evaluate(() => !!(window.__lk && window.__lk.ready)))) await sleep(200);
    await sleep(700);
    if (await page.evaluate(() => !!(window.__lk.storyCard && window.__lk.storyCard.visible))) {
      await page.keyboard.press('Space');
      await sleep(600);
    }
    await page.keyboard.press('KeyM');
    await sleep(500);
    await page.screenshot({ path: `${out}/${prefix}${area}-${name}.png` });
    // The map canvas alone, at its own resolution, for a close look at the labels.
    if (name === 'desktop') {
      const data = await page.evaluate(() => document.querySelector('#map canvas').toDataURL('image/png'));
      const { writeFileSync } = await import('node:fs');
      writeFileSync(`${out}/${prefix}${area}-canvas.png`, Buffer.from(data.split(',')[1], 'base64'));
    }
    console.log(area, name, 'ok');
  }
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);

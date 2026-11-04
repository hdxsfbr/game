#!/usr/bin/env node
// The recorded pieces at the title, under the first story card and the map, and never under a prompt.
// Usage: node scripts/musiccheck.mjs <baseUrl>
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';

const base = process.argv[2];
if (!base) throw new Error('usage: musiccheck.mjs <baseUrl>');
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () => page.evaluate(() => ({ tracks: window.__lkTracks ? window.__lkTracks.playing : [], area: window.__lkTracks ? window.__lkTracks.area : null, quiet: window.__lkTracks ? window.__lkTracks.paused : false, synth: window.__lkMusic ? window.__lkMusic.trackId : '', prompt: !!(window.__lk && window.__lk.runner) }));
const expect = async (label, want) => {
  const got = await state();
  const bad = Object.entries(want).filter(([k, v]) => JSON.stringify(got[k]) !== JSON.stringify(v));
  if (bad.length) errors.push(`${label}: ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${label} ${JSON.stringify(got)}`);
};

await page.goto(`${base}/?reset=1`, { waitUntil: 'load' });
await page.waitForSelector('#btn-play', { timeout: 15000 });
await sleep(1500);
await expect('title', { tracks: ['title'], synth: '' });

await page.click('#btn-play');
for (let i = 0; i < 150 && !(await page.evaluate(() => !!(window.__lk && window.__lk.ready))); i++) await sleep(200);
await sleep(1500);
if (!(await page.evaluate(() => window.__lk.storyCard.visible))) errors.push('no story card on first arrival');
await expect('under the hub card', { tracks: ['story'], synth: '' });

await page.keyboard.press('Space');
await sleep(1500);
await expect('after the card', { tracks: ['story'], area: 'story', synth: '' });

await page.keyboard.press('KeyM');
await sleep(900);
await expect('under the map', { tracks: ['story'], quiet: false });
await page.keyboard.press('KeyM');
await sleep(900);
await expect('after the map', { tracks: ['story'], quiet: false });

// At the hearth door: the piece steps aside under the prompt and comes back after.
await page.evaluate(() => window.__lk.player.setPosition(7.5, 8.5));
await sleep(300);
await page.keyboard.press('Space');
await sleep(1500);
await expect('under a prompt', { tracks: ['story'], quiet: true, prompt: true });
await page.keyboard.press('Escape');
await sleep(1500);
await expect('after the prompt', { tracks: ['story'], quiet: false, synth: '' });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('ok');

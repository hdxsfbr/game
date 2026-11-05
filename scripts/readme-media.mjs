// The README's pictures, captured headless from the dev server: the hero shot of the coloured Valley
// by the river, and a short clip of the singer walking east over the plank bridge. Frames go to the
// output directory; the GIF is assembled with ffmpeg.
// Usage: node scripts/readme-media.mjs [baseUrl] [outDir]   (defaults: https://localhost:5182, docs/images)
import puppeteer from 'puppeteer-core';
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'https://localhost:5182';
const out = process.argv[3] ?? 'docs/images';
const frames = `${out}/.frames`;
mkdirSync(frames, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = execSync('command -v google-chrome || command -v chromium || command -v chromium-browser').toString().trim();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 720 },
});

/** Load the Valley in colour with the singer at a tile, past the story card, ready to walk. */
async function open(x, y) {
  const page = await browser.newPage();
  await page.goto(`${base}/?reset=1&scene=world&area=valley&open=valley&x=${x}&y=${y}`, { waitUntil: 'load' });
  await page.waitForSelector('#btn-play', { timeout: 15000 });
  await page.click('#btn-play');
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && !(await page.evaluate(() => !!(window.__lk && window.__lk.ready)))) await sleep(200);
  await sleep(700);
  if (await page.evaluate(() => !!(window.__lk.storyCard && window.__lk.storyCard.visible))) {
    await page.keyboard.press('Space');
    await sleep(600);
  }
  await sleep(1500);
  return page;
}

// Hero: by the river, the bridge and the gate to the east.
const hero = await open(33, 19);
await hero.screenshot({ path: `${out}/valley.jpg`, type: 'jpeg', quality: 88 });
await hero.close();

// Clip: start west of the bridge and walk east over it for seven seconds. Frames come from the
// page's screencast stream (a full screenshot takes 400 ms under the software renderer).
const walk = await open(29, 16);
const cdp = await walk.createCDPSession();
const stamps = [];
let n = 0;
cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  writeFileSync(`${frames}/f${String(n++).padStart(3, '0')}.jpg`, Buffer.from(data, 'base64'));
  stamps.push(metadata.timestamp);
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
});
await walk.keyboard.down('ArrowRight');
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
await sleep(7000);
await cdp.send('Page.stopScreencast');
await walk.keyboard.up('ArrowRight');
await walk.close();
await browser.close();
const seconds = stamps.length > 1 ? stamps[stamps.length - 1] - stamps[0] : 7;
const rate = Math.round((n / seconds) * 10) / 10; // the stream's own rate
const fps = 8; // the GIF's
// Two passes: a palette from the frames, then the GIF at 640 wide.
const filt = `fps=${fps},scale=560:-1:flags=lanczos`;
spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(rate), '-i', `${frames}/f%03d.jpg`, '-vf', `${filt},palettegen=max_colors=96`, `${frames}/palette.png`], { stdio: 'inherit' });
spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(rate), '-i', `${frames}/f%03d.jpg`, '-i', `${frames}/palette.png`, '-lavfi', `${filt} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4`, `${out}/walk.gif`], { stdio: 'inherit' });
rmSync(frames, { recursive: true, force: true });
console.log(`${n} frames at ${rate} fps, gif at ${fps} fps -> ${out}/walk.gif; ${out}/valley.jpg`);

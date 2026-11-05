#!/usr/bin/env node
// The demo video's footage: one WebM per scene, recorded inside the page (the canvas stream plus
// every sound that reaches the speakers), driving the game through the keys as a player would.
// Scenes follow docs/demo-script.md. Usage:
//   node scripts/demo.mjs [baseUrl] [outDir] [--scenes 03,05]
// Then scripts/demo-stitch.sh assembles the cards, narration and clips into the video.
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const base = process.argv[2]?.startsWith('--') ? 'https://localhost:5182' : (process.argv[2] ?? 'https://localhost:5182');
const out = process.argv[3]?.startsWith('--') || !process.argv[3] ? 'scratch/demo' : process.argv[3];
const si = process.argv.indexOf('--scenes');
const only = si > 0 ? process.argv[si + 1].split(',') : null;
mkdirSync(out, { recursive: true });
const chrome = execSync('command -v google-chrome || command -v chromium || command -v chromium-browser').toString().trim();

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e)));
// Every sound that is connected to the speakers is also connected to the recorder's stream.
await page.evaluateOnNewDocument(() => {
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = connect.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode) {
      const ctx = dest.context;
      if (!ctx.__tap) ctx.__tap = ctx.createMediaStreamDestination();
      connect.call(this, ctx.__tap);
      window.__audioTap = ctx.__tap;
    }
    return r;
  };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const press = async (code, ms = 60) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); };
const hold = async (code, ms) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); };
/** Hold a direction until something (a door, a wall) stops the singer, or `max` ms pass. */
async function walkUntilBlocked(code, max = 6000) {
  await page.keyboard.down(code);
  const t0 = Date.now();
  let last = null, still = 0;
  while (Date.now() - t0 < max && still < 3) {
    await sleep(150);
    const at = await page.evaluate(() => [window.__lk.player.x.toFixed(2), window.__lk.player.z.toFixed(2)].join());
    still = at === last ? still + 1 : 0;
    last = at;
  }
  await page.keyboard.up(code);
}
const PIANO = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon'];
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const QUALITIES = ['maj7', 'min7', 'dom7', 'm7b5'];

async function state() {
  return page.evaluate(() => {
    const w = window.__lk;
    if (!w) return null;
    const r = w.runner;
    return { area: w.area.id, ready: !!w.ready, phase: r ? r.phase : null, stepIndex: r ? r.stepIndex : null, kind: r ? r.step.spec.kind : null, quality: r ? r.step.spec.quality ?? null : null, ref: r ? r.step.refMidi : null, target: r ? r.step.targetMidi : null, misses: r ? r.misses : null, solved: JSON.parse(localStorage.getItem('listening-kingdom.progress.v1') ?? '{}').solved ?? [] };
  });
}
async function waitFor(pred, timeout = 15000, what = pred.toString()) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const s = await state(); if (s && pred(s)) return s; await sleep(100); }
  throw new Error('timeout waiting: ' + what);
}
async function answer(s, semis, quality) {
  if (s.kind === 'chordName') { await press('Digit' + (QUALITIES.indexOf(quality ?? s.quality) + 1)); return; }
  const code = PIANO[s.ref + semis - 60];
  if (!code) throw new Error('note off the piano: ' + (s.ref + semis));
  await press(code, 140);
  await sleep(500);
  await press('Enter');
}
/** Open a door the way a player does: Space, listen, (a wrong try), the right key, Enter; paced for a viewer. */
async function solveDoor(id, { wrong = 0, pace = 900 } = {}) {
  await press('Space');
  let s = await waitFor((st) => st.phase === 'listening', 15000, `${id} listening`);
  await sleep(pace);
  for (let w = 0; w < wrong; w++) {
    const semis = s.target - s.ref;
    const alt = s.kind === 'degree' ? MAJOR[(MAJOR.indexOf(semis) + 2 + w) % 7] : (semis + 3 + w) % 8;
    await answer(s, alt, QUALITIES[(QUALITIES.indexOf(s.quality) + 1 + w) % 4]);
    s = await waitFor((st) => st.misses === w + 1 && st.phase === 'listening', 25000, `${id} miss ${w + 1}`);
    await sleep(pace);
  }
  for (let presses = 0; presses < 24; presses++) {
    s = await waitFor((st) => st.solved.includes(id) || st.phase === 'listening', 15000, `${id} ready`);
    if (s.solved.includes(id)) break;
    const idx = s.stepIndex;
    await answer(s, s.target - s.ref);
    await waitFor((st) => st.solved.includes(id) || st.stepIndex !== idx || (st.phase === 'listening' && st.misses > 0), 15000, `${id} step ${idx}`);
    await sleep(pace * 0.6);
  }
  return waitFor((st) => st.solved.includes(id), 15000, `${id} solved`);
}
async function dismissCard() {
  if (await page.evaluate(() => !!(window.__lk && window.__lk.storyCard && window.__lk.storyCard.visible))) { await press('Space'); await sleep(500); }
}
/** Load an area at a tile and enter it with Play; `open` marks earlier areas' doors solved so the kingdom is in the state the script assumes. */
async function jump(area, x, y, { open = '', card = true } = {}) {
  await page.goto(`${base}/?scene=world&area=${area}&x=${x}&y=${y}${open ? '&open=' + open : ''}`, { waitUntil: 'load' });
  await page.waitForSelector('#btn-play', { timeout: 10000 });
  await page.click('#btn-play');
  await waitFor((st) => st.area === area && st.ready, 30000, 'area ' + area);
  await sleep(600);
  if (!card) await dismissCard();
}

/**
 * Record the page while `drive` runs: the composited page (canvas and the HTML over it) from the
 * screencast stream, every sound from the audio tap, muxed into `${name}.mp4` by ffmpeg.
 */
async function record(name, drive) {
  const t0 = Date.now();
  const dir = `${out}/${name}.frames`;
  mkdirSync(dir, { recursive: true });
  const cdp = await page.createCDPSession();
  const stamps = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    writeFileSync(`${dir}/f${String(n++).padStart(4, '0')}.jpg`, Buffer.from(data, 'base64'));
    stamps.push(metadata.timestamp);
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  await page.evaluate(() => {
    const tap = window.__audioTap;
    window.__chunks = [];
    window.__rec = tap ? new MediaRecorder(tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160_000 }) : null;
    if (window.__rec) { window.__rec.ondataavailable = (e) => { if (e.data.size) window.__chunks.push(e.data); }; window.__rec.start(500); }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  await drive();
  await cdp.send('Page.stopScreencast');
  const b64 = await page.evaluate(async () => {
    const rec = window.__rec;
    if (!rec) return '';
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
    const buf = await new Blob(window.__chunks, { type: 'audio/webm' }).arrayBuffer();
    let s = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await cdp.detach();
  if (b64) writeFileSync(`${dir}/audio.webm`, Buffer.from(b64, 'base64'));
  // Frames with their real durations, then a constant 30 fps H.264 with AAC.
  const list = stamps.map((t, i) => `file 'f${String(i).padStart(4, '0')}.jpg'\nduration ${Math.max(0.01, (stamps[i + 1] ?? t + 1 / 15) - t).toFixed(4)}`).join('\n') + '\n';
  writeFileSync(`${dir}/frames.txt`, list);
  const audio = b64 ? ['-i', `${dir}/audio.webm`] : [];
  execSync(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/frames.txt`, ...audio, '-vf', 'fps=30,scale=1280:720,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', ...(b64 ? ['-c:a', 'aac', '-b:a', '160k'] : []), '-shortest', `${out}/${name}.mp4`].map((a) => `'${a}'`).join(' '));
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s, ${n} frames`);
}

/** Mark doors solved in the saved progress, so an area is in the state a scene assumes. */
async function solved(ids) {
  await page.evaluate((ids) => {
    const key = 'listening-kingdom.progress.v1';
    const p = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!p) return;
    for (const id of ids) if (!p.solved.includes(id)) p.solved.push(id);
    localStorage.setItem(key, JSON.stringify(p));
  }, ids);
}

/** A title card: an HTML page over the title painting, captured as a still with its length beside it. */
async function card(name, seconds, html) {
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#15161c;color:#f1ede4;font-family:Georgia,'Times New Roman',serif}
    .bg{position:absolute;inset:0;background:url(${base}/cards/title.jpg) center/cover;filter:brightness(.55)}
    .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 120px}
    h1{font-weight:normal;font-size:76px;margin:0 0 18px;letter-spacing:.5px;text-shadow:0 2px 24px #000}
    p{font-size:30px;margin:8px 0;font-style:italic;color:#e9e2d2;text-shadow:0 1px 12px #000}
    .link{font-style:normal;font-size:28px;color:#f3c66b;margin-top:26px}
    .small{font-style:normal;font-size:22px;color:#cfc8b8;margin-top:10px}
  </style></head><body><div class="bg"></div><div class="card">${html}</div></body></html>`, { waitUntil: 'load' });
  await sleep(800);
  await page.screenshot({ path: `${out}/${name}.png` });
  writeFileSync(`${out}/${name}.seconds`, String(seconds));
  console.log(`${name}: card, ${seconds} s`);
}

const scenes = {
  async '01'() {
    await card('01-card', 5, `<h1>The Listening Kingdom</h1><p>A game that teaches you to hear music.</p>`);
  },
  // The title screen: the painting, the question, Play chosen.
  async '02'() {
    await page.goto(`${base}/?reset=1`, { waitUntil: 'load' });
    await page.waitForSelector('#btn-play', { timeout: 10000 });
    await sleep(300);
    await record('02-title', async () => {
      await sleep(5000);
      await page.click('#btn-play');
      await waitFor((st) => st.ready, 30000, 'hub ready');
      await sleep(2500);
    });
  },
  // The hearth door: walk to it, listen, answer, the colour comes back.
  async '03'() {
    await jump('hub', 8, 11, { card: false });
    await record('03-hearth', async () => {
      await sleep(800);
      await hold('ArrowUp', 1400);
      await sleep(4200); // the narration ends before the door hums
      await solveDoor('hub-unison', { pace: 1400 });
      await sleep(5000);
    });
  },
  // The hub bench: the guided walkthrough, two steps, then back out.
  async '04'() {
    await jump('hub', 18, 11, { open: 'hub', card: false });
    await record('04-guide', async () => {
      await sleep(6800); // the narration, then the guide's own voice
      await press('Space');
      await sleep(15000);
      await press('Escape');
      await sleep(900);
    });
  },
  // The Valley: arrival card, the fifth door with one miss, then through it toward the bridge.
  async '05'() {
    await jump('valley', 25, 16, { open: 'hub', card: true });
    await record('05-valley', async () => {
      await sleep(2800);
      await dismissCard();
      await sleep(600);
      await hold('ArrowRight', 1200);
      await sleep(600);
      await solveDoor('valley-fifth', { wrong: 1, pace: 1300 });
      await sleep(2200);
      await hold('ArrowRight', 4200);
      await sleep(600);
    });
    await record('06-map', async () => {
      await press('KeyM');
      await sleep(5500);
      await press('KeyM');
      await sleep(500);
    });
  },
  // Tonic Town: the bell, then the first stall up the street.
  async '07'() {
    await jump('town', 22, 30, { open: 'valley', card: true });
    await record('07-town', async () => {
      await sleep(2600);
      await dismissCard();
      await sleep(500);
      await hold('ArrowUp', 500);
      await sleep(500);
      await solveDoor('town-bell', { pace: 1200 });
      await sleep(1800);
      await hold('ArrowUp', 1500);
      await sleep(500);
      await solveDoor('town-stall-sol', { pace: 1000 });
      await sleep(2500);
    });
  },
  // The Jazz Quarter: three doors already open, the band stand named sign by sign, the band wakes.
  async '08'() {
    await jump('jazz', 36, 15, { open: 'town', card: true });
    await solved(['jazz-club', 'jazz-alley', 'jazz-cellar']);
    await jump('jazz', 40, 15, { card: false });
    await record('08-jazz', async () => {
      await sleep(5600); // the narration ends before the chord sounds
      await solveDoor('jazz-bandstand', { wrong: 1, pace: 1100 });
      await sleep(9000);
    });
  },
  // The Silent Stage: the song, the lights, the results.
  async '09'() {
    await jump('stage', 14, 6, { open: 'jazz', card: true });
    await record('09-stage', async () => {
      await sleep(3400);
      await dismissCard();
      await sleep(600);
      await hold('ArrowUp', 900);
      await sleep(1400);
      await solveDoor('stage-song', { pace: 900 });
      for (let i = 0; i < 120; i++) { if (await page.evaluate(() => window.__lkResults === true)) break; await sleep(250); }
      await sleep(5000);
    });
  },
  async '10'() {
    await card('10-card', 6, `<h1>The Listening Kingdom</h1><p class="link">game-production-34da.up.railway.app</p><p class="small">Babylon.js, a world from headless Blender, characters from Tripo, music from Suno, narration in the author's cloned voice.</p>`);
  },
};

for (const id of Object.keys(scenes)) {
  if (only && !only.includes(id)) continue;
  console.log('scene', id);
  await scenes[id]();
}
await browser.close();

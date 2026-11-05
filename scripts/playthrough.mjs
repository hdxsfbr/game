#!/usr/bin/env node
// Drive the 3D game in headless Chrome through real doors, with keys as the input.
// Usage: node scripts/playthrough.mjs [baseUrl] [outDir]
// Writes screenshots to outDir and exits non-zero on console errors or a door that will not open.
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'https://localhost:5180';
const out = process.argv[3] ?? 'scratch/play';
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
// A navigation aborts the previous page's pending loads; those failures are not the game's.
let navigatedAt = 0;
page.on('console', (m) => {
  if (m.type() !== 'error' || /GL Driver|WebGL|ERR_CERT/.test(m.text())) return;
  if (/Failed to load resource/.test(m.text()) && Date.now() - navigatedAt < 2500) return;
  errors.push(m.text());
});
page.on('framenavigated', () => { navigatedAt = Date.now(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const press = async (code, ms = 60) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); };
// Musical typing on the fixed piano, C4 (60) to E5 (76).
const PIANO = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon'];
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const QUALITIES = ['maj7', 'min7', 'dom7', 'm7b5'];

async function state() {
  return page.evaluate(() => {
    const w = window.__lk;
    if (!w) return null;
    const r = w.runner;
    return {
      area: w.area.id,
      ready: !!w.ready,
      phase: r ? r.phase : null,
      stepIndex: r ? r.stepIndex : null,
      stepCount: r ? r.stepCount : null,
      kind: r ? r.step.spec.kind : null,
      quality: r ? r.step.spec.quality ?? null : null,
      ref: r ? r.step.refMidi : null,
      target: r ? r.step.targetMidi : null,
      misses: r ? r.misses : null,
      hint: r ? r.hintLevel : null,
      solved: JSON.parse(localStorage.getItem('listening-kingdom.progress.v1') ?? '{}').solved ?? [],
    };
  });
}

async function waitFor(pred, timeout = 12000, what = pred.toString()) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await state();
    if (s && pred(s)) return s;
    await sleep(100);
  }
  throw new Error('timeout waiting: ' + what);
}

/** Answer the step: a chord name is a digit; a note is its piano key, then Enter. */
async function answer(s, semis, quality) {
  if (s.kind === 'chordName') {
    await press('Digit' + (QUALITIES.indexOf(quality ?? s.quality) + 1));
    return;
  }
  const midi = s.ref + semis;
  const code = PIANO[midi - 60];
  if (!code) throw new Error('note off the piano: ' + midi);
  await press(code);
  await sleep(80);
  await press('Enter');
}

/** Click the panel's Answer button, as a mouse player would. */
async function clickAnswer() {
  await page.click('#puzzle-answer');
}

/** Click the piano key for `midi` on the panel, as a player with a mouse would. */
async function clickKey(midi) {
  const el = await page.$(`[data-key="${midi}"]`);
  if (!el) throw new Error('no key for midi ' + midi);
  await el.click();
}

/** Click the band stand sign for a chord quality. */
async function clickSign(quality) {
  await page.click(`[data-sign="${quality}"]`);
}

/** Voice left, from saved progress. */
async function voice() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('listening-kingdom.progress.v1') ?? '{}').voice);
}

/** Miss at a door until the voice runs out; expect to wake at the bench with two notes. */
async function goQuietAt(id, shotName) {
  await press('Space');
  let s = await waitFor((st) => st.phase === 'listening', 15000, `${id} listening`);
  for (let w = 0; w < 8; w++) {
    const semis = s.target - s.ref;
    const alt = s.kind === 'degree' ? MAJOR[(MAJOR.indexOf(semis) + 2 + w) % 7] : (semis + 3 + w) % 8;
    await answer(s, alt, s.quality);
    const v = await waitFor(() => true, 100).then(voice);
    if (v <= 0 || (await state()).phase === null) break;
    s = await waitFor((st) => st.phase === 'listening' || st.phase === null, 15000, `${id} miss ${w + 1}`);
    if (s.phase === null) break;
  }
  // The fade, the move to the bench, the toast.
  await sleep(1900);
  const v = await voice();
  if (v !== 2) throw new Error(`${id}: expected voice 2 after going quiet, got ${v}`);
  const st = await state();
  if (st.phase !== null) throw new Error(`${id}: door still open after going quiet`);
  if (shotName) await shot(shotName);
  console.log('went quiet at', id);
}

/** Open the bench next to the player, read the lesson, run the drill with the keys. */
async function practise(shotName) {
  await press('Space');
  await sleep(400);
  if (shotName) await shot(shotName);
  await press('ArrowRight');
  await sleep(200);
  await press('Space'); // hear the page's example
  await sleep(600);
  await press('Enter');
  let s = await waitFor((st) => st.phase === 'listening', 15000, 'drill listening');
  for (let presses = 0; presses < 12; presses++) {
    s = await waitFor((st) => st.phase === null || st.phase === 'listening', 15000, 'drill ready');
    if (s.phase === null) break;
    const idx = s.stepIndex;
    await answer(s, s.target - s.ref);
    await waitFor((st) => st.phase === null || st.stepIndex !== idx || st.misses > 0, 15000, `drill step ${idx}`);
  }
  await sleep(800);
  const v = await voice();
  console.log('practised, voice', v);
  return v;
}

/** Open the door the player is standing next to. wrong = how many wrong answers to give first. click = answer by clicking keys. */
async function solveDoor(id, { wrong = 0, shotName = null, click = false } = {}) {
  const tPress = Date.now();
  await press('Space');
  let s = await waitFor((st) => st.phase === 'listening', 15000, `${id} listening`);
  // A prompt that resolves at once played nothing.
  if (Date.now() - tPress < 450) throw new Error(`${id}: prompt went silent (listening after ${Date.now() - tPress} ms)`);
  if (shotName) { await sleep(250); await shot(shotName); }
  for (let w = 0; w < wrong; w++) {
    const semis = s.target - s.ref;
    const alt = s.kind === 'degree' ? MAJOR[(MAJOR.indexOf(semis) + 2 + w) % 7] : (semis + 3 + w) % 8;
    const altQ = QUALITIES[(QUALITIES.indexOf(s.quality) + 1 + w) % 4];
    await answer(s, alt, altQ);
    // A miss at a melody door replays the whole tune, up to twelve seconds for the song.
    s = await waitFor((st) => st.misses === w + 1 && st.phase === 'listening', 25000, `${id} miss ${w + 1}`);
    if (shotName) await shot(`${shotName}-miss${w + 1}`);
  }
  for (let presses = 0; presses < 24; presses++) {
    s = await waitFor((st) => st.solved.includes(id) || st.phase === 'listening', 15000, `${id} ready`);
    if (s.solved.includes(id)) break;
    const idx = s.stepIndex;
    if (click && s.kind === 'chordName') await clickSign(s.quality);
    else if (click) {
      // Try a wrong key first: trying is free until Enter.
      await clickKey(s.target === 60 ? 62 : 60);
      await sleep(80);
      await clickKey(s.target);
      await sleep(80);
      await clickAnswer();
    } else await answer(s, s.target - s.ref);
    await waitFor((st) => st.solved.includes(id) || st.stepIndex !== idx || st.phase === 'listening' && st.misses > 0, 15000, `${id} step ${idx}`);
  }
  s = await waitFor((st) => st.solved.includes(id), 15000, `${id} solved`);
  console.log('solved', id);
  // The moment after: sparks and the camera's push toward the door.
  if (shotName) { await sleep(550); await shot(`${shotName}-open`); }
  return s;
}

async function jump(area, x, y) {
  await page.goto(`${base}/?scene=world&area=${area}&x=${x}&y=${y}`, { waitUntil: 'load' });
  // The title screen comes first: Play enters the world with the keys.
  await page.waitForSelector('#btn-play', { timeout: 10000 });
  await page.click('#btn-play');
  await waitFor((st) => st.area === area && st.ready, 30000, 'area ' + area);
  await sleep(400);
  await dismissCard();
}

/** The story card shown on first arrival in an area: Space closes it. */
async function dismissCard() {
  if (await page.evaluate(() => !!(window.__lk && window.__lk.storyCard && window.__lk.storyCard.visible))) {
    await press('Space');
    await sleep(500);
  }
}

await page.goto(`${base}/?reset=1`, { waitUntil: 'load' });
await sleep(500);

// Hub: the hearth door, with three misses to show the ladder.
await jump('hub', 8, 8);
await shot('01-hub');
await solveDoor('hub-unison', { wrong: 3, shotName: '02-hearth' });
await sleep(900);
await shot('03-hub-solved');

if ((await voice()) !== 5) throw new Error('hearth: opening the door should refill the voice, got ' + (await voice()));
// The hub bench: lesson, then the warm-up drill. The voice is full, so it stays at five.
await jump('hub', 18, 11);
const vh = await practise('02b-lesson');
if (vh !== 5) throw new Error('hub drill should leave a full voice at 5, got ' + vh);
await jump('hub', 8, 8);

// Walk through the open door to the valley: the key stays down until the valley loads, since the
// headless frame rate sets the walking speed.
await page.keyboard.down('ArrowLeft');
try {
  await waitFor((st) => st.area === 'valley', 10000, 'walked to valley');
} finally {
  await page.keyboard.up('ArrowLeft');
}
await sleep(900);
await shot('04a-valley-card');
await dismissCard();
await shot('04-valley');

// Valley: run the voice out at the first bridge, wake at the bench, drill back up, then open doors.
await jump('valley', 30, 16);
await goQuietAt('valley-fifth', '04b-quiet');
await sleep(300);
const vv = await practise('04c-valley-lesson');
if (vv !== 3) throw new Error('valley drill should restore voice to 3, got ' + vv);

// Valley: a produce door and the serpent.
await jump('valley', 30, 16);
await solveDoor('valley-fifth', { shotName: '05-fifth', click: true });
await jump('valley', 7, 17);
await solveDoor('valley-serpent', { shotName: '06-serpent' });

// Town: every door.
await jump('town', 22, 30);
await shot('07-town');
await press('KeyM');
await sleep(400);
await shot('07-town-map');
await press('KeyM');
await sleep(200);
await solveDoor('town-bell', { shotName: '08-bell' });
await jump('town', 22, 27);
await solveDoor('town-stall-sol');
await jump('town', 22, 24);
await solveDoor('town-stall-mi', { click: true });
await jump('town', 22, 21);
await solveDoor('town-stall-re');
await jump('town', 22, 14);
await solveDoor('town-well', { wrong: 2, shotName: '09-well' });
await jump('town', 22, 8);
await solveDoor('town-clock', { shotName: '10-clock' });
await jump('town', 22, 5);
await solveDoor('town-choir', { wrong: 1, shotName: '11-choir' });
await sleep(1200);
await shot('12-town-done');

// Jazz Quarter: every door.
await jump('jazz', 10, 15);
await shot('13-jazz');
await press('KeyM');
await sleep(400);
await shot('13-jazz-map');
// The map: the quarter's piece plays on under it.
const underMap = await page.evaluate(() => (window.__lkTracks ? { tracks: window.__lkTracks.playing, quiet: window.__lkTracks.paused, synth: window.__lkMusic.trackId } : null));
if (underMap && (underMap.tracks.join() !== 'jazz' || underMap.quiet || underMap.synth)) errors.push(`under the map: ${JSON.stringify(underMap)}`);
await press('Escape');
await sleep(900);
await solveDoor('jazz-club', { wrong: 2, shotName: '14-club' });
await jump('jazz', 20, 15);
await solveDoor('jazz-alley');
await jump('jazz', 30, 15);
await solveDoor('jazz-cellar', { shotName: '15-cellar' });
await jump('jazz', 40, 15);
await solveDoor('jazz-bandstand', { wrong: 3, shotName: '16-bandstand', click: true });
// The Band Stand has just opened: the band's cued vamp is the celebration, the recorded piece stepped off.
// (Checked before the jump, which reloads the page and with it the celebration.)
await sleep(2500);
const bandUp = await page.evaluate(() => (window.__lkTracks ? { tracks: window.__lkTracks.playing, synth: window.__lkMusic.trackId } : null));
if (bandUp && (bandUp.tracks.length || bandUp.synth !== 'jazz:quiet:band')) errors.push(`band celebration: ${JSON.stringify(bandUp)}`);
await jump('jazz', 48, 15);
await solveDoor('jazz-boss', { wrong: 1, shotName: '17-boss' });
await sleep(1200);
await shot('18-jazz-done');

// The Silent Stage: the song, then the results screen.
await jump('stage', 14, 5);
await shot('19-stage');
await solveDoor('stage-song', { wrong: 1, shotName: '20-song' });
await sleep(2500);
await shot('21-kingdom');
// The finale runs about nineteen seconds from the last note: lights, fireworks, the recorded finale, then the results.
for (let i = 0; i < 100; i++) { if (await page.evaluate(() => window.__lkResults === true)) break; await sleep(250); }
if (!(await page.evaluate(() => window.__lkResults === true))) throw new Error('results screen never appeared');
await sleep(900);
await shot('22-results');
const atResults = await page.evaluate(() => (window.__lkTracks ? { tracks: window.__lkTracks.playing, synth: window.__lkMusic.trackId } : null));
if (atResults && (atResults.tracks.join() !== 'finale' || atResults.synth)) errors.push(`at the results: ${JSON.stringify(atResults)}`);

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
if (errors.length) process.exit(1);
console.log('ok');

// Diagnostic: walks to the hearth door and reports the audio engine's state and output peak at each stage.
// Headless Chrome's audio clock runs slow and reports no signal, so read the state fields, not the peak.
import puppeteer from 'puppeteer-core';
const base = 'https://localhost:5180';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`${base}/?reset=1`, { waitUntil: 'load' });
await page.waitForSelector('canvas', { timeout: 20000 }).catch(() => console.log('no canvas; logs:', logs.join('\n')));
await sleep(800);
const r = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
await page.mouse.click(r.x + (r.w * 650) / 960, r.y + (r.h * 290) / 540);
await sleep(1500);
await page.evaluate(async () => {
  const e = window.__lkAudio;
  const an = e.ctx.createAnalyser();
  an.fftSize = 2048;
  e.duck.connect(an);
  const buf = new Float32Array(an.fftSize);
  window.__peak = 0;
  setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let m = 0;
    for (const v of buf) m = Math.max(m, Math.abs(v));
    window.__peak = Math.max(window.__peak, m);
  }, 30);
});
const probe = async (label) => {
  const s = await page.evaluate(async () => {
    const e = window.__lkAudio;
    const m = window.__lkMusic;
    const peak = window.__peak;
    window.__peak = 0;
    return { state: e.ctx.state, duck: e.duck.gain.value.toFixed(2), music: e.music.gain.value.toFixed(2), t: e.ctx.currentTime.toFixed(2), peakSinceLast: peak.toFixed(3), track: m.trackId, timer: m.timer, paused: m.paused, life: m.life, nextStep: m.nextStep };
  });
  console.log(label, JSON.stringify(s));
};
await probe('after Play');
// walk left to the hearth door at (6,8): start (14,8)
await page.keyboard.down('ArrowLeft'); await sleep(1900); await page.keyboard.up('ArrowLeft');
await probe('after walk');
await page.keyboard.press('Space');
await sleep(600);
await probe('prompting');
await sleep(1800);
await probe('listening');
console.log(logs.filter((l) => !/GL Driver/.test(l)).join('\n'));
await browser.close();

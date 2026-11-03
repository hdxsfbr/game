#!/usr/bin/env node
// The page loader: screenshot the page on a slow connection before the script bundle arrives, then confirm
// the loader is gone once the title is up. Usage: node scripts/bootshot.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
const chrome = execSync('command -v google-chrome || command -v chromium').toString().trim();
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--ignore-certificate-errors', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
// Slow the network so the page's own loader is what shows first.
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 200, downloadThroughput: 400 * 1024, uploadThroughput: 200 * 1024 });
const nav = page.goto((process.argv[2] ?? 'https://localhost:5182') + '/?reset=1', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: 'scratch/boot-early.png' });
console.log('boot visible early:', await page.evaluate(() => !!document.getElementById('boot')));
await nav;
await page.waitForSelector('#btn-play', { timeout: 60000 });
console.log('boot gone at title:', await page.evaluate(() => !document.getElementById('boot')));
await page.screenshot({ path: 'scratch/boot-title.png' });
await browser.close();

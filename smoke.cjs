const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const server = spawn('npx', ['serve', '-l', '4500', 'dist'], { cwd: process.cwd(), shell: true });
  await new Promise(r => setTimeout(r, 3000));

  const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:4500', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/screenshot1.png' });

  // try clicking start match
  try {
    const btn = await page.$x("//button[contains(., 'Start Match')]");
    if (btn.length) { await btn[0].click(); }
  } catch(e) { console.log('click err', e.message); }
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/tmp/screenshot2.png' });

  await browser.close();
  server.kill();
  process.exit(0);
})();

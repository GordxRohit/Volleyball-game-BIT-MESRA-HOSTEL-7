const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

(async () => {
  const server = spawn('npx', ['serve', '-l', '4500', 'dist'], { cwd: process.cwd(), shell: true, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));

  const browser = await puppeteer.launch({ args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--disable-gpu-sandbox'
  ] });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:4500', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: 'debug_screenshot1.png' });

  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Start Match'));
    if (b) { b.click(); return true; }
    return false;
  });
  console.log('clicked start:', clicked);
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: 'debug_screenshot2.png' });

  await browser.close();
  server.kill();
  process.exit(0);
})();

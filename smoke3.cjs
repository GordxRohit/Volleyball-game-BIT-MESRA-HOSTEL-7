const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--disable-gpu-sandbox'
  ] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:4500', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/screenshot1.png' });

  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Start Match'));
    if (b) { b.click(); return true; }
    return false;
  });
  console.log('clicked start:', clicked);
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/tmp/screenshot2.png' });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/screenshot3.png' });

  await browser.close();
  process.exit(0);
})();

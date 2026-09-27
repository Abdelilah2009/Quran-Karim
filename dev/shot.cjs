// Usage: node dev/shot.cjs "<query string>" out.png   (dev server must run on :5173)
const path = require('path');
const fs = require('fs');
const npx = path.join(require('os').homedir(), '.npm/_npx');
const pwDir = fs.readdirSync(npx).map((d) => path.join(npx, d, 'node_modules/playwright')).find((p) => fs.existsSync(p));
const pw = require(pwDir);
(async () => {
  const browser = await pw.chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 2200, height: 1400 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  await page.goto(`http://localhost:5173/dev/templates.html?${process.argv[2] || ''}`);
  await page.waitForFunction(() => window.__done, null, { timeout: 60000 });
  const err = await page.$('#err');
  if (err) console.log(await err.textContent());
  await (await page.$('#grid')).screenshot({ path: process.argv[3] || 'shot.png' });
  await browser.close();
  console.log('saved', process.argv[3]);
})();

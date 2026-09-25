// Shared test set-up: serve the repository over HTTP (as GitHub Pages does)
// and open the built app.html in headless Chromium.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript' };

export async function startServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // APP_FILE lets a test run against another build, e.g. an older release
    const file = rel === '/app.html' && process.env.APP_FILE ? path.resolve(process.env.APP_FILE) : path.join(ROOT, rel);
    if ((!file.startsWith(ROOT) && file !== path.resolve(process.env.APP_FILE || '')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/app.html` };
}

/* Opens the app with onboarding already done, so tests start on Student details.
   Collects page errors and console errors; tests assert the list is empty. */
export async function openApp(browser, url, { onboarded = true } = {}) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const watch = p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  };
  watch(page); context.on('page', watch);
  page.on('dialog', d => d.accept());
  await page.goto(url);
  if (onboarded) {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('adjb.settings.v3', JSON.stringify({ onboarded: true })); });
    await page.reload();
  }
  return { context, page, errors };
}

export const launch = () => chromium.launch();

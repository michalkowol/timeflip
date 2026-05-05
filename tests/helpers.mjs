import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INDEX_HTML_PATH = path.resolve(__dirname, '..', 'index.html');
const ICS_PATH = path.resolve(__dirname, 'fixtures', 'sample.ics');
const ALPINE_PATH = path.resolve(__dirname, 'node_modules', 'alpinejs', 'dist', 'cdn.min.js');

const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const icsDefault = fs.readFileSync(ICS_PATH, 'utf8');
const alpineSrc = fs.readFileSync(ALPINE_PATH, 'utf8');

/**
 * Launch a fresh headless Chromium with all network requests stubbed locally.
 *
 * @param {Object}  [opts]
 * @param {string}  [opts.notes]            preset value for `localStorage["timeflip_notes"]`
 * @param {string}  [opts.icsBody]          override the served ICS body
 * @param {boolean} [opts.acceptDialogs]    auto-accept any dialog (default true)
 * @param {boolean} [opts.applyDefaultDates] set fromDate=toDate=2026-05-04, mergeShortEnabled=false (default true)
 * @param {Function}[opts.beforeReady]      `(page) => Promise<void>` hook before Alpine waits
 * @returns {Promise<{browser, context, page}>}
 */
export async function launchPage(opts = {}) {
  const {
    notes,
    icsBody = icsDefault,
    acceptDialogs = true,
    applyDefaultDates = true,
    beforeReady,
  } = opts;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });

  await context.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await context.route('**/sample.ics', r => r.fulfill({ status: 200, contentType: 'text/calendar', body: icsBody }));
  await context.route('**/cdn.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: alpineSrc }));
  await context.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, body: '' }));
  await context.route('**/fonts.gstatic.com/**', r => r.fulfill({ status: 200, body: '' }));

  const page = await context.newPage();

  if (acceptDialogs) {
    page.on('dialog', d => d.accept());
  }

  await page.addInitScript(n => {
    localStorage.setItem('timeflip_ics_url', 'http://localhost/sample.ics');
    if (n) localStorage.setItem('timeflip_notes', n);
  }, notes);

  await page.goto('http://localhost/index.html', { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.Alpine && window.Alpine.$data(document.querySelector('[x-data]')).events.length > 0,
    { timeout: 10000 }
  );

  if (beforeReady) {
    await beforeReady(page);
  }

  if (applyDefaultDates) {
    await page.evaluate(() => {
      const d = window.Alpine.$data(document.querySelector('[x-data]'));
      d.fromDate = '2026-05-04';
      d.toDate = '2026-05-04';
      d.mergeShortEnabled = false;
    });
    await page.waitForTimeout(150);
  }

  return { browser, context, page };
}

/**
 * Read Alpine root data via `window.Alpine.$data`.
 * @param {import('playwright').Page} page
 * @param {(d: any) => any} fn
 */
export function readData(page, fn) {
  return page.evaluate(`(${fn.toString()})(window.Alpine.$data(document.querySelector('[x-data]')))`);
}

/**
 * Mutate Alpine root data via `window.Alpine.$data` (and optionally read a result back).
 * @param {import('playwright').Page} page
 * @param {(d: any) => any} fn
 */
export function evalOnData(page, fn) {
  return page.evaluate(`(${fn.toString()})(window.Alpine.$data(document.querySelector('[x-data]')))`);
}

/**
 * Tiny assertion bag. Each spec creates its own via `bag()`, calls `bag.check(name, ok, value)`,
 * then `bag.report()` to print the summary and `process.exit(1)` on failures.
 */
export function bag() {
  const checks = [];
  return {
    check(name, ok, value) {
      const status = ok ? 'PASS' : 'FAIL';
      const printable = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
      console.log(`[${status}] ${name}: ${printable}`);
      checks.push({ name, ok, value });
    },
    info(label, value) {
      const printable = typeof value === 'string' ? value : JSON.stringify(value);
      console.log(`[INFO] ${label}: ${printable}`);
    },
    report(specName) {
      const failed = checks.filter(c => !c.ok);
      console.log('---');
      console.log(`${specName}: total ${checks.length}, passed ${checks.length - failed.length}, failed ${failed.length}`);
      if (failed.length > 0) {
        failed.forEach(f => console.log(`  - ${f.name}: ${JSON.stringify(f.value)}`));
        process.exit(1);
      }
      return { total: checks.length, passed: checks.length - failed.length, failed: failed.length };
    },
    snapshot() {
      const failed = checks.filter(c => !c.ok);
      return { total: checks.length, passed: checks.length - failed.length, failed: failed.length, failures: failed };
    },
  };
}

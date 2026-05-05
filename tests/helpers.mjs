import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const icsDefault = fs.readFileSync(path.resolve(__dirname, 'fixtures', 'sample.ics'), 'utf8');
const alpineSrc = fs.readFileSync(path.resolve(__dirname, 'node_modules', 'alpinejs', 'dist', 'cdn.min.js'), 'utf8');

/**
 * The day on which the events in `fixtures/sample.ics` occur.
 * Tests reference this constant whenever they need to set the visible date range
 * (e.g. after a reload, or when seeding events into a specific day).
 */
export const FIXTURE_DATE = '2026-05-04';

/**
 * Launch a fresh headless Chromium with all network requests stubbed locally.
 * Returns `{ browser, page }`. The caller must close the browser, typically:
 *
 *   t.after(() => browser.close())
 *
 * After launch the page has:
 *   - `index.html` loaded with Alpine ready
 *   - `fixtures/sample.ics` parsed into `events`
 *   - `fromDate` and `toDate` set to `FIXTURE_DATE` so the fixture events are visible
 *   - `mergeShortEnabled` = false
 *
 * @param {Object}  [opts]
 * @param {string}  [opts.notes]          preset for `localStorage["timeflip_notes"]`
 * @param {string}  [opts.icsBody]        override the served ICS body
 * @param {boolean} [opts.acceptDialogs]  auto-accept any dialog (default true).
 *                                        Set to false to inspect dialogs in the test.
 */
export async function launchPage(opts = {}) {
  const { notes, icsBody = icsDefault, acceptDialogs = true } = opts;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });

  await context.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await context.route('**/sample.ics', r => r.fulfill({ status: 200, contentType: 'text/calendar', body: icsBody }));
  await context.route('**/cdn.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: alpineSrc }));
  await context.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, body: '' }));
  await context.route('**/fonts.gstatic.com/**', r => r.fulfill({ status: 200, body: '' }));

  const page = await context.newPage();
  if (acceptDialogs) page.on('dialog', d => d.accept());

  await page.addInitScript(n => {
    localStorage.setItem('timeflip_ics_url', 'http://localhost/sample.ics');
    if (n) localStorage.setItem('timeflip_notes', n);
  }, notes);

  await page.goto('http://localhost/index.html', { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.Alpine && window.Alpine.$data(document.querySelector('[x-data]')).events.length > 0,
    { timeout: 10000 },
  );

  await data(page, (d, day) => {
    d.fromDate = d.toDate = day;
    d.mergeShortEnabled = false;
  }, FIXTURE_DATE);
  await page.waitForTimeout(150);

  return { browser, page };
}

/**
 * Run `fn(d, arg)` inside the page, where `d` is the Alpine root data
 * (`window.Alpine.$data(document.querySelector('[x-data]'))`).
 *
 * Used both to read state and to mutate it. `arg` (optional) must be JSON-serializable.
 *
 *   await data(page, d => d.editingUid)                            // read
 *   await data(page, d => { d.editForm.summary = 'X' })            // mutate
 *   await data(page, (d, uid) => d.filteredEvents.find(e => e.uid === uid), id)
 */
export function data(page, fn, arg) {
  return page.evaluate(({ src, arg }) => {
    const f = new Function(`return (${src})`)();
    return f(window.Alpine.$data(document.querySelector('[x-data]')), arg);
  }, { src: fn.toString(), arg });
}

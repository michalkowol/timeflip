import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPage, data } from '../helpers.mjs';

test('Code -> EDEN-5920 single-line mapping', async (t) => {
  const { browser, page } = await launchPage({ notes: 'Code -> EDEN-5920' });
  t.after(() => browser.close());

  assert.equal(
    await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.task),
    'EDEN-5920',
  );
  assert.equal(
    await data(page, d => d.filteredEvents.find(e => e.summary === 'Break')?.task),
    'Timeflip',
    'unmapped event keeps Timeflip default',
  );
});

test('Multi-line mapping with multi-word key', async (t) => {
  const { browser, page } = await launchPage({
    notes: 'Code -> EDEN-5920\nCode review -> EDEN-9999',
  });
  t.after(() => browser.close());

  const tasks = await data(page, d =>
    Object.fromEntries(d.filteredEvents.map(e => [e.summary, e.task]))
  );
  assert.equal(tasks['Code'], 'EDEN-5920');
  assert.equal(tasks['Code review'], 'EDEN-9999');
});

test('Case-insensitive matching, whitespace tolerant', async (t) => {
  const { browser, page } = await launchPage({ notes: '   code   ->   EDEN-CASE   ' });
  t.after(() => browser.close());

  assert.equal(
    await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.task),
    'EDEN-CASE',
  );
});

test('Editing notes updates filteredEvents reactively', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await data(page, d => { d.notes = 'Code -> LIVE-1'; });
  await page.waitForTimeout(150);
  assert.equal(
    await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.task),
    'LIVE-1',
  );

  await data(page, d => { d.notes = 'Code -> LIVE-2'; });
  await page.waitForTimeout(150);
  assert.equal(
    await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.task),
    'LIVE-2',
  );
});

test('User-edited Task wins over notes mapping', async (t) => {
  const { browser, page } = await launchPage({ notes: 'Code -> EDEN-5920' });
  t.after(() => browser.close());

  const codeUid = await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.uid);

  await data(page, (d, uid) => {
    d.edits = {
      ...d.edits,
      [uid]: {
        task: 'MANUAL-1',
        summary: 'Code',
        startISO: '2026-05-04T10:49:23.000Z',
        endISO: '2026-05-04T11:01:51.000Z',
      },
    };
    d.persistEdits();
  }, codeUid);
  await page.waitForTimeout(200);

  assert.equal(
    await data(page, (d, uid) => d.filteredEvents.find(e => e.uid === uid)?.task, codeUid),
    'MANUAL-1',
  );
});

test('Lines without `->` are ignored', async (t) => {
  const notes = 'TODO list\nCode -> EDEN-5920\nrandom text\n# comment line\n';
  const { browser, page } = await launchPage({ notes });
  t.after(() => browser.close());

  assert.equal(
    await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.task),
    'EDEN-5920',
    'mapping still applied amid noise',
  );
  assert.equal(
    await data(page, d => d.filteredEvents.find(e => e.summary === 'Break')?.task),
    'Timeflip',
    'non-rule lines are ignored',
  );
});

test('Notes textarea blur freezes current mapping into edits', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const codeUid = await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.uid);

  await page.click('.notes-fab .notes-fab-btn');
  await page.waitForTimeout(150);
  await page.locator('.notes-textarea').focus();
  await page.locator('.notes-textarea').fill('Code -> EDEN-1');
  await page.locator('input#from').focus();
  await page.waitForTimeout(250);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}'));
  assert.equal(stored[codeUid]?.task, 'EDEN-1', 'mapping persisted to edits on blur');
});

test('Frozen mapping is not changed by later notes edits', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const codeUid = await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.uid);

  await page.click('.notes-fab .notes-fab-btn');
  await page.waitForTimeout(150);
  await page.locator('.notes-textarea').focus();
  await page.locator('.notes-textarea').fill('Code -> EDEN-1');
  await page.locator('input#from').focus();
  await page.waitForTimeout(250);

  await page.locator('.notes-textarea').focus();
  await page.locator('.notes-textarea').fill('Code -> EDEN-2');
  await page.locator('input#from').focus();
  await page.waitForTimeout(250);

  assert.equal(
    await data(page, (d, uid) => d.filteredEvents.find(e => e.uid === uid)?.task, codeUid),
    'EDEN-1',
    'already-frozen entry keeps its first mapping',
  );
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}'));
  assert.equal(stored[codeUid]?.task, 'EDEN-1');
});

test('Notes change without blur does not freeze (stays dynamic)', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await data(page, d => { d.notes = 'Code -> LIVE-1'; });
  await page.waitForTimeout(150);

  assert.equal(
    await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.task),
    'LIVE-1',
    'dynamic mapping reflected immediately',
  );
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}')),
    {},
    'no freeze without textarea blur',
  );
});

test('Freeze only touches events visible in current date range', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  // Move calendar to a different day so fixture events are not visible.
  await data(page, d => { d.fromDate = d.toDate = '2026-05-05'; });
  await page.waitForTimeout(150);

  await page.click('.notes-fab .notes-fab-btn');
  await page.waitForTimeout(150);
  await page.locator('.notes-textarea').focus();
  await page.locator('.notes-textarea').fill('Code -> EDEN-X');
  await page.locator('input#from').focus();
  await page.waitForTimeout(250);

  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}')),
    {},
    'no events visible -> nothing frozen',
  );
});

test('Reset on a frozen entry restores dynamic mapping', async (t) => {
  const { browser, page } = await launchPage({ notes: 'Code -> EDEN-1' });
  t.after(() => browser.close());

  const codeUid = await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.uid);

  await page.click('.notes-fab .notes-fab-btn');
  await page.waitForTimeout(150);
  await page.locator('.notes-textarea').focus();
  await page.locator('input#from').focus();
  await page.waitForTimeout(250);

  assert.equal(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}')))[codeUid]?.task,
    'EDEN-1',
    'precondition: frozen',
  );

  await data(page, (d, uid) => {
    d.startEdit(d.filteredEvents.find(e => e.uid === uid), null);
  }, codeUid);
  await page.waitForTimeout(200);
  await page.click('button:has-text("Reset")');
  await page.waitForTimeout(200);

  await data(page, d => { d.notes = 'Code -> EDEN-2'; });
  await page.waitForTimeout(150);

  assert.equal(
    await data(page, (d, uid) => d.filteredEvents.find(e => e.uid === uid)?.task, codeUid),
    'EDEN-2',
    'after Reset, dynamic mapping kicks in again',
  );
});

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

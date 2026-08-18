import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPage, data } from '../helpers.mjs';

// Minutes since midnight for a "HH:MM" cell value. Used >5x in this file.
const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

test('config.time_drift shifts start and end forward', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const before = await data(page, d =>
    d.filteredEvents.map(e => ({ uid: e.uid, startStr: e.startStr, endStr: e.endStr })),
  );

  await data(page, d => { d.notes = 'config.time_drift: 7m'; });
  await page.waitForTimeout(150);

  const after = await data(page, d =>
    d.filteredEvents.map(e => ({ uid: e.uid, startStr: e.startStr, endStr: e.endStr })),
  );

  assert.equal(after.length, before.length);
  for (const [i, ev] of after.entries()) {
    assert.equal(ev.uid, before[i].uid);
    assert.equal(minutes(ev.startStr) - minutes(before[i].startStr), 7, 'start +7m');
    assert.equal(minutes(ev.endStr) - minutes(before[i].endStr), 7, 'end +7m');
  }
});

test('Negative drift shifts backwards, hours and seconds units supported', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const baseline = await data(page, d => d.filteredEvents[0].startStr);

  await data(page, d => { d.notes = 'config.time_drift: -7m'; });
  await page.waitForTimeout(150);
  assert.equal(
    minutes(await data(page, d => d.filteredEvents[0].startStr)) - minutes(baseline),
    -7,
    '-7m shifts backwards',
  );

  await data(page, d => { d.notes = 'config.time_drift: 1h'; });
  await page.waitForTimeout(150);
  assert.equal(
    minutes(await data(page, d => d.filteredEvents[0].startStr)) - minutes(baseline),
    60,
    '1h shifts by an hour',
  );

  await data(page, d => { d.notes = 'config.time_drift: 120s'; });
  await page.waitForTimeout(150);
  assert.equal(
    minutes(await data(page, d => d.filteredEvents[0].startStr)) - minutes(baseline),
    2,
    '120s shifts by two minutes',
  );

  await data(page, d => { d.notes = 'config.time_drift: 3'; });
  await page.waitForTimeout(150);
  assert.equal(
    minutes(await data(page, d => d.filteredEvents[0].startStr)) - minutes(baseline),
    3,
    'bare number is minutes',
  );
});

test('Drift keeps durations and coexists with task mappings', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const durationsBefore = await data(page, d => d.filteredEvents.map(e => e.durationMs));

  await data(page, d => { d.notes = 'Code -> EDEN-1\nconfig.time_drift: 7m'; });
  await page.waitForTimeout(150);

  assert.deepEqual(
    await data(page, d => d.filteredEvents.map(e => e.durationMs)),
    durationsBefore,
    'shifting both ends leaves durations untouched',
  );
  assert.equal(
    await data(page, d => d.filteredEvents.find(e => e.summary === 'Code')?.task),
    'EDEN-1',
    'mapping lines still parsed alongside the config line',
  );
});

test('Malformed or absent drift value leaves times untouched', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const baseline = await data(page, d => d.filteredEvents.map(e => e.startStr));

  for (const notes of ['config.time_drift: soon', 'config.time_drift:', 'time_drift: 7m', 'Code -> EDEN-1']) {
    await data(page, (d, n) => { d.notes = n; }, notes);
    await page.waitForTimeout(150);
    assert.deepEqual(
      await data(page, d => d.filteredEvents.map(e => e.startStr)),
      baseline,
      `no shift for notes: ${notes}`,
    );
  }
});

test('Drift does not move manually added events', async (t) => {
  const { browser, page } = await launchPage({ notes: 'config.time_drift: 7m' });
  t.after(() => browser.close());

  await page.click('button:has-text("+ Add event")');
  await page.waitForTimeout(200);
  const addedUid = await data(page, d => d.editingUid);
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(150);

  const added = await data(page, (d, uid) => d.filteredEvents.find(e => e.uid === uid), addedUid);
  assert.equal(added.startStr, '09:00', 'added event keeps the time it was created with');
  assert.equal(added.endStr, '09:30');
});

test('Edited times are absolute, drift only moves untouched fields', async (t) => {
  const { browser, page } = await launchPage({ notes: 'config.time_drift: 7m' });
  t.after(() => browser.close());

  const ev = await data(page, d => d.filteredEvents[0]);

  await data(page, d => {
    d.startEdit(d.filteredEvents[0], null);
    d.editForm.startStr = '08:15';
    d.saveEdit(d.filteredEvents[0]);
  });
  await page.waitForTimeout(200);

  const edited = await data(page, (d, uid) => d.filteredEvents.find(e => e.uid === uid), ev.uid);
  assert.equal(edited.startStr, '08:15', 'edited start stored as typed, not re-drifted');
  assert.equal(edited.endStr, ev.endStr, 'untouched end keeps its drifted value');
});

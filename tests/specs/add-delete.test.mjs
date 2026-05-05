import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPage, data, FIXTURE_DATE } from '../helpers.mjs';

test('"+ Add event" creates a local event in edit mode, sorted in', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const initial = await data(page, d => d.filteredEvents.length);

  await page.click('button:has-text("+ Add event")');
  await page.waitForTimeout(200);

  const state = await data(page, d => ({
    count: d.filteredEvents.length,
    editingUid: d.editingUid,
    addedCount: d.addedEvents.length,
    starts: d.filteredEvents.map(e => e.startStr),
  }));

  assert.equal(state.count, initial + 1);
  assert.ok(state.editingUid?.startsWith('local-'), `editingUid: ${state.editingUid}`);
  assert.equal(state.addedCount, 1);
  assert.deepEqual(state.starts, [...state.starts].sort(), 'rows still in chronological order');

  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    const td = a?.closest('td');
    return td ? { tag: a.tagName, cellIndex: [...td.parentNode.children].indexOf(td) } : null;
  });
  assert.equal(focused?.tag, 'INPUT');
  assert.equal(focused?.cellIndex, 1, 'autofocus on Comment input (cell 1)');

  const persisted = JSON.parse(
    await page.evaluate(() => localStorage.getItem('timeflip_added_events') || '[]'),
  );
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].uid, state.editingUid);
});

test('Saved added event survives reload', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.evaluate(() => {
    localStorage.setItem('timeflip_added_events', JSON.stringify([
      { uid: 'local-pre', task: 'Timeflip', summary: 'Pre-existing', startISO: '2026-05-04T08:00:00.000Z', endISO: '2026-05-04T08:30:00.000Z' },
    ]));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.Alpine);
  await data(page, (d, day) => {
    d.fromDate = d.toDate = day;
    d.mergeShortEnabled = false;
  }, FIXTURE_DATE);
  await page.waitForTimeout(150);

  const restored = await data(page, d =>
    d.filteredEvents.find(e => e.uid === 'local-pre'),
  );
  assert.equal(restored?.summary, 'Pre-existing');
});

test('Delete a calendar event (after confirm, survives reload)', async (t) => {
  const dialogs = [];
  const { browser, page } = await launchPage({ acceptDialogs: false });
  t.after(() => browser.close());
  page.on('dialog', d => { dialogs.push({ type: d.type(), message: d.message() }); d.accept(); });

  const calUid = await data(page, d => d.filteredEvents[0].uid);
  const calSummary = await data(page, d => d.filteredEvents[0].summary);

  await page.evaluate(() => document.querySelectorAll('tbody tr:not(.edit-actions-row)')[0].click());
  await page.waitForTimeout(200);
  await page.click('button:has-text("Delete")');
  await page.waitForTimeout(300);

  assert.equal(dialogs.length, 1, 'confirm dialog shown');
  assert.equal(dialogs[0].type, 'confirm');
  assert.ok(dialogs[0].message.includes(calSummary), `message mentions "${calSummary}"`);
  assert.equal(
    await data(page, (d, uid) => d.filteredEvents.some(e => e.uid === uid), calUid),
    false,
    'calendar event hidden after delete',
  );
  assert.equal(
    await page.evaluate(uid => JSON.parse(localStorage.getItem('timeflip_deleted_uids') || '{}')[uid] === true, calUid),
    true,
    'deleted UID persisted',
  );

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.Alpine);
  await data(page, (d, day) => {
    d.fromDate = d.toDate = day;
    d.mergeShortEnabled = false;
  }, FIXTURE_DATE);
  await page.waitForTimeout(150);
  assert.equal(
    await data(page, (d, uid) => d.filteredEvents.some(e => e.uid === uid), calUid),
    false,
    'still hidden after reload',
  );
});

test('Dismissing the confirm dialog cancels the delete', async (t) => {
  const { browser, page } = await launchPage({ acceptDialogs: false });
  t.after(() => browser.close());
  page.on('dialog', d => d.dismiss());

  const calUid = await data(page, d => d.filteredEvents[0].uid);

  await page.evaluate(() => document.querySelectorAll('tbody tr:not(.edit-actions-row)')[0].click());
  await page.waitForTimeout(200);
  await page.click('button:has-text("Delete")');
  await page.waitForTimeout(300);

  assert.equal(
    await data(page, (d, uid) => d.filteredEvents.some(e => e.uid === uid), calUid),
    true,
    'event still visible when delete is cancelled',
  );
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_deleted_uids') || '{}')),
    {},
    'no UID persisted on cancel',
  );
});

test('Delete an added event removes it from addedEvents and storage', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.click('button:has-text("+ Add event")');
  await page.waitForTimeout(200);
  const addedUid = await data(page, d => d.editingUid);
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  await data(page, (d, uid) => {
    d.startEdit(d.filteredEvents.find(e => e.uid === uid), null);
  }, addedUid);
  await page.waitForTimeout(200);
  await page.click('button:has-text("Delete")');
  await page.waitForTimeout(300);

  const after = await data(page, (d, uid) => ({
    inAdded: d.addedEvents.some(e => e.uid === uid),
    inFiltered: d.filteredEvents.some(e => e.uid === uid),
    persisted: JSON.parse(localStorage.getItem('timeflip_added_events') || '[]').some(e => e.uid === uid),
  }), addedUid);
  assert.deepEqual(after, { inAdded: false, inFiltered: false, persisted: false });
});

test('Saving an added event routes to addedEvents, not edits map', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.click('button:has-text("+ Add event")');
  await page.waitForTimeout(200);
  const addedUid = await data(page, d => d.editingUid);
  await data(page, d => { d.editForm.summary = 'My added event'; });
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  const inAdded = JSON.parse(
    await page.evaluate(() => localStorage.getItem('timeflip_added_events') || '[]'),
  ).find(e => e.uid === addedUid);
  const inEdits = JSON.parse(
    await page.evaluate(() => localStorage.getItem('timeflip_event_edits') || '{}'),
  )[addedUid];

  assert.equal(inAdded?.summary, 'My added event');
  assert.equal(inEdits, undefined, 'NOT mirrored into edits map');
});

test('Reset hidden for added events (Delete is the destructive action)', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.click('button:has-text("+ Add event")');
  await page.waitForTimeout(200);
  await data(page, d => { d.editForm.summary = 'X'; });
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  const addedUid = await data(page, d => d.addedEvents[0].uid);
  await data(page, (d, uid) => {
    d.startEdit(d.filteredEvents.find(e => e.uid === uid), null);
  }, addedUid);
  await page.waitForTimeout(200);

  assert.equal(await page.locator('button:has-text("Reset")').isVisible(), false);
});

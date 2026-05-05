import { launchPage, bag } from '../helpers.mjs';

const checks = bag();

// ------------------------------------------------------------------
// 1) "+ Add event" creates a new local event in edit mode, sorted in
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  const initial = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents.length
  );

  await page.click('button:has-text("+ Add event")');
  await page.waitForTimeout(200);

  const state = await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    return {
      count: d.filteredEvents.length,
      editingUid: d.editingUid,
      addedCount: d.addedEvents.length,
      starts: d.filteredEvents.map(e => e.startStr),
    };
  });
  checks.check('count +1', state.count === initial + 1, state.count);
  checks.check('UID starts with local-', state.editingUid?.startsWith('local-'), state.editingUid);
  checks.check('addedEvents has 1 entry', state.addedCount === 1, state.addedCount);
  const sorted = [...state.starts].sort();
  checks.check('rows still in chronological order',
    JSON.stringify(state.starts) === JSON.stringify(sorted), state.starts);

  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    const td = a?.closest('td');
    return td ? { tag: a.tagName, cellIndex: [...td.parentNode.children].indexOf(td) } : null;
  });
  checks.check('autofocus on Comment input (cell 1)',
    focused?.tag === 'INPUT' && focused?.cellIndex === 1, focused);

  const persisted = JSON.parse(await page.evaluate(() =>
    localStorage.getItem('timeflip_added_events') || '[]'
  ));
  checks.check('persisted to localStorage immediately',
    persisted.length === 1 && persisted[0].uid === state.editingUid, persisted);

  await browser.close();
}

// ------------------------------------------------------------------
// 2) Saved added event survives reload
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  await page.evaluate(() => {
    localStorage.setItem('timeflip_added_events', JSON.stringify([
      { uid: 'local-pre', task: 'Timeflip', summary: 'Pre-existing', startISO: '2026-05-04T08:00:00.000Z', endISO: '2026-05-04T08:30:00.000Z' }
    ]));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.Alpine);
  await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    d.fromDate = '2026-05-04';
    d.toDate = '2026-05-04';
    d.mergeShortEnabled = false;
  });
  await page.waitForTimeout(200);

  const restored = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents.find(e => e.uid === 'local-pre')
  );
  checks.check('added event restored from storage',
    restored?.summary === 'Pre-existing', restored?.summary);

  await browser.close();
}

// ------------------------------------------------------------------
// 3) Delete a calendar event (immediate, no confirm dialog)
// ------------------------------------------------------------------
{
  let dialogCount = 0;
  const { browser, page } = await launchPage({ acceptDialogs: false });
  page.on('dialog', d => { dialogCount++; d.dismiss(); });

  const calUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents[0].uid
  );
  await page.evaluate(() => document.querySelectorAll('tbody tr:not(.edit-actions-row)')[0].click());
  await page.waitForTimeout(200);
  await page.click('button:has-text("Delete")');
  await page.waitForTimeout(300);

  checks.check('no dialog was shown', dialogCount === 0, dialogCount);

  const visible = await page.evaluate(uid =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents.some(e => e.uid === uid)
  , calUid);
  checks.check('calendar event hidden', visible === false, visible);

  const persisted = await page.evaluate(uid =>
    JSON.parse(localStorage.getItem('timeflip_deleted_uids') || '{}')[uid] === true
  , calUid);
  checks.check('deleted UID persisted', persisted === true, persisted);

  // Survives reload
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.Alpine);
  await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    d.fromDate = '2026-05-04';
    d.toDate = '2026-05-04';
    d.mergeShortEnabled = false;
  });
  await page.waitForTimeout(200);
  const stillHidden = await page.evaluate(uid =>
    !window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents.some(e => e.uid === uid)
  , calUid);
  checks.check('still hidden after reload', stillHidden === true, stillHidden);

  await browser.close();
}

// ------------------------------------------------------------------
// 4) Delete an added event (removes from addedEvents)
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  await page.click('button:has-text("+ Add event")');
  await page.waitForTimeout(200);
  const addedUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).editingUid
  );
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  // Re-enter edit mode and delete
  await page.evaluate(uid => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    d.startEdit(d.filteredEvents.find(e => e.uid === uid), null);
  }, addedUid);
  await page.waitForTimeout(200);
  await page.click('button:has-text("Delete")');
  await page.waitForTimeout(300);

  const after = await page.evaluate(uid => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    return {
      inAdded: d.addedEvents.some(e => e.uid === uid),
      inFiltered: d.filteredEvents.some(e => e.uid === uid),
      persisted: JSON.parse(localStorage.getItem('timeflip_added_events') || '[]').some(e => e.uid === uid),
    };
  }, addedUid);
  checks.check('removed from addedEvents', after.inAdded === false, after.inAdded);
  checks.check('removed from view', after.inFiltered === false, after.inFiltered);
  checks.check('removed from localStorage', after.persisted === false, after.persisted);

  await browser.close();
}

// ------------------------------------------------------------------
// 5) Saving an added event routes to addedEvents (NOT edits map)
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  await page.click('button:has-text("+ Add event")');
  await page.waitForTimeout(200);
  const addedUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).editingUid
  );
  await page.evaluate(() => {
    window.Alpine.$data(document.querySelector('[x-data]')).editForm.summary = 'My added event';
  });
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  const inAdded = JSON.parse(await page.evaluate(() => localStorage.getItem('timeflip_added_events') || '[]'))
    .find(e => e.uid === addedUid);
  const inEdits = JSON.parse(await page.evaluate(() => localStorage.getItem('timeflip_event_edits') || '{}'))[addedUid];

  checks.check('added event content saved into addedEvents',
    inAdded?.summary === 'My added event', inAdded?.summary);
  checks.check('NOT mirrored into edits map', inEdits === undefined, inEdits);

  await browser.close();
}

// ------------------------------------------------------------------
// 6) Reset hidden for added events (Delete is the destructive action)
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  await page.click('button:has-text("+ Add event")');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.Alpine.$data(document.querySelector('[x-data]')).editForm.summary = 'X';
  });
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  const addedUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).addedEvents[0].uid
  );
  await page.evaluate(uid => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    d.startEdit(d.filteredEvents.find(e => e.uid === uid), null);
  }, addedUid);
  await page.waitForTimeout(200);

  const resetVisible = await page.locator('button:has-text("Reset")').isVisible();
  checks.check('Reset hidden for added events', resetVisible === false, resetVisible);
  await browser.close();
}

checks.report('add-delete.spec');

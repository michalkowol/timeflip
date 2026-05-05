import { launchPage, bag } from '../helpers.mjs';

const checks = bag();

// ------------------------------------------------------------------
// 1) Click row → autofocus on clicked cell, edit-actions row appears
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);

  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    const td = a?.closest('td');
    return td ? { tag: a.tagName, cellIndex: [...td.parentNode.children].indexOf(td) } : null;
  });
  checks.check('autofocus targets clicked cell (Comment, idx=1)',
    focused?.tag === 'INPUT' && focused?.cellIndex === 1, focused);

  checks.check('edit-actions row appears',
    await page.locator('tr.edit-actions-row').count() === 1, 1);

  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('tr.edit-actions-row button')].map(b => b.textContent.trim())
  );
  checks.check('action buttons present in DOM',
    JSON.stringify(buttons) === JSON.stringify(['Delete', 'Reset', 'Cancel', 'Save']),
    buttons);

  // Task cell click should focus first input
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(150);
  await page.locator('tbody tr:not(.edit-actions-row) td').first().click();
  await page.waitForTimeout(200);
  const focusedTask = await page.evaluate(() => {
    const a = document.activeElement;
    const td = a?.closest('td');
    return td ? { tag: a.tagName, cellIndex: [...td.parentNode.children].indexOf(td) } : null;
  });
  checks.check('clicking Task cell focuses input in cell 0',
    focusedTask?.tag === 'INPUT' && focusedTask?.cellIndex === 0, focusedTask);

  await browser.close();
}

// ------------------------------------------------------------------
// 2) Autosave on focusout when changed
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  const targetUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents[0].uid
  );

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.Alpine.$data(document.querySelector('[x-data]')).editForm.summary = 'AUTOSAVED';
  });
  await page.locator('input#from').focus();
  await page.waitForTimeout(250);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}'));
  checks.check('change persisted to localStorage on focusout',
    stored[targetUid]?.summary === 'AUTOSAVED', stored[targetUid]);

  const editing = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).editingUid
  );
  checks.check('edit mode closed after autosave', editing === null, editing);

  await browser.close();
}

// ------------------------------------------------------------------
// 3) No-change focusout closes edit mode without saving
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  await page.click('h1');
  await page.waitForTimeout(250);

  const editing = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).editingUid
  );
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}'));
  checks.check('edit mode closed', editing === null, editing);
  checks.check('nothing persisted to localStorage', Object.keys(stored).length === 0, stored);
  await browser.close();
}

// ------------------------------------------------------------------
// 4) Focus jumps WITHIN edit area do not close edit
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  const targetUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents[0].uid
  );

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  // Move focus to another input INSIDE the same edit area
  await page.locator('tr.editing td').first().locator('input').focus();
  await page.waitForTimeout(150);

  const editing = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).editingUid
  );
  checks.check('inter-input focus stays in edit', editing === targetUid, editing);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}'));
  checks.check('no save fired during inter-input focus',
    stored[targetUid] === undefined, stored[targetUid]);

  await browser.close();
}

// ------------------------------------------------------------------
// 5) Cancel button discards staged changes
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  const targetUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents[0].uid
  );

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.Alpine.$data(document.querySelector('[x-data]')).editForm.summary = 'DISCARD ME';
  });
  await page.locator('button:has-text("Cancel")').click();
  await page.waitForTimeout(200);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}'));
  checks.check('Cancel did not persist', stored[targetUid] === undefined, stored[targetUid]);
  const summary = await page.evaluate(uid =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents.find(e => e.uid === uid)?.summary
  , targetUid);
  checks.check('summary remains original after Cancel', summary !== 'DISCARD ME', summary);

  await browser.close();
}

// ------------------------------------------------------------------
// 6) Save button persists changes (mobile-friendly backup)
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  const targetUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents[0].uid
  );

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.Alpine.$data(document.querySelector('[x-data]')).editForm.summary = 'VIA SAVE';
  });
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}'));
  checks.check('Save persisted change', stored[targetUid]?.summary === 'VIA SAVE', stored[targetUid]?.summary);
  const editing = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).editingUid
  );
  checks.check('edit closed after Save', editing === null, editing);

  await browser.close();
}

// ------------------------------------------------------------------
// 7) Reset hidden when no edits exist; visible after edit; clears overlay
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  const calUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents[0].uid
  );

  // Pre-seed an edit
  await page.evaluate(uid => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    d.edits = { [uid]: { task: 'X', summary: 'X', startISO: '2026-05-04T08:00:00.000Z', endISO: '2026-05-04T08:30:00.000Z' } };
    d.persistEdits();
  }, calUid);
  await page.waitForTimeout(150);

  await page.evaluate(uid => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    d.startEdit(d.filteredEvents.find(e => e.uid === uid), null);
  }, calUid);
  await page.waitForTimeout(200);

  const resetVisible = await page.locator('button:has-text("Reset")').isVisible();
  checks.check('Reset visible for edited calendar event', resetVisible === true, resetVisible);

  await page.locator('button:has-text("Reset")').click();
  await page.waitForTimeout(200);

  const after = await page.evaluate(uid =>
    JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}')[uid]
  , calUid);
  checks.check('Reset removed overlay from localStorage', after === undefined, after);

  await browser.close();
}

// ------------------------------------------------------------------
// 8) Edit Task cell value persists
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  const targetUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents[0].uid
  );

  await page.locator('tbody tr:not(.edit-actions-row) td').first().click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.Alpine.$data(document.querySelector('[x-data]')).editForm.task = 'CUSTOM TASK';
  });
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  const stored = await page.evaluate(uid =>
    JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}')[uid]
  , targetUid);
  checks.check('Task field persisted', stored?.task === 'CUSTOM TASK', stored?.task);

  const display = await page.evaluate(uid =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents.find(e => e.uid === uid)?.task
  , targetUid);
  checks.check('Task displayed', display === 'CUSTOM TASK', display);

  await browser.close();
}

checks.report('edit.spec');

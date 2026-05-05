import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPage, data } from '../helpers.mjs';

const focusedCell = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    const td = a?.closest('td');
    return td ? { tag: a.tagName, cellIndex: [...td.parentNode.children].indexOf(td) } : null;
  });

const storedEdits = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('timeflip_event_edits') || '{}'));

test('Click row autofocuses the clicked cell and shows edit-actions row', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);

  const focused = await focusedCell(page);
  assert.equal(focused?.tag, 'INPUT');
  assert.equal(focused?.cellIndex, 1, 'autofocus targets clicked Comment cell (idx=1)');

  assert.equal(await page.locator('tr.edit-actions-row').count(), 1);

  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('tr.edit-actions-row button')].map(b => b.textContent.trim()),
  );
  assert.deepEqual(buttons, ['Delete', 'Reset', 'Cancel', 'Save']);

  // Re-focus on Task cell (index 0)
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(150);
  await page.locator('tbody tr:not(.edit-actions-row) td').first().click();
  await page.waitForTimeout(200);

  const focusedTask = await focusedCell(page);
  assert.equal(focusedTask?.tag, 'INPUT');
  assert.equal(focusedTask?.cellIndex, 0);
});

test('Autosave on focusout when changed', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const targetUid = await data(page, d => d.filteredEvents[0].uid);

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  await data(page, d => { d.editForm.summary = 'AUTOSAVED'; });
  await page.locator('input#from').focus();
  await page.waitForTimeout(250);

  const stored = await storedEdits(page);
  assert.equal(stored[targetUid]?.summary, 'AUTOSAVED');
  assert.equal(await data(page, d => d.editingUid), null, 'edit mode closes after autosave');
});

test('No-change focusout closes edit mode without saving', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  await page.click('h1');
  await page.waitForTimeout(250);

  assert.equal(await data(page, d => d.editingUid), null);
  assert.deepEqual(await storedEdits(page), {});
});

test('Focus jumps within edit area do not close edit', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const targetUid = await data(page, d => d.filteredEvents[0].uid);

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  await page.locator('tr.editing td').first().locator('input').focus();
  await page.waitForTimeout(150);

  assert.equal(await data(page, d => d.editingUid), targetUid);
  assert.equal((await storedEdits(page))[targetUid], undefined, 'no save fired between inputs');
});

test('Cancel button discards staged changes', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const targetUid = await data(page, d => d.filteredEvents[0].uid);

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  await data(page, d => { d.editForm.summary = 'DISCARD ME'; });
  await page.locator('button:has-text("Cancel")').click();
  await page.waitForTimeout(200);

  assert.equal((await storedEdits(page))[targetUid], undefined);
  assert.notEqual(
    await data(page, (d, uid) => d.filteredEvents.find(e => e.uid === uid)?.summary, targetUid),
    'DISCARD ME',
  );
});

test('Save button persists changes', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const targetUid = await data(page, d => d.filteredEvents[0].uid);

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);
  await data(page, d => { d.editForm.summary = 'VIA SAVE'; });
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  assert.equal((await storedEdits(page))[targetUid]?.summary, 'VIA SAVE');
  assert.equal(await data(page, d => d.editingUid), null);
});

test('Reset removes overlay from localStorage', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const calUid = await data(page, d => d.filteredEvents[0].uid);

  await data(page, (d, uid) => {
    d.edits = {
      [uid]: {
        task: 'X',
        summary: 'X',
        startISO: '2026-05-04T08:00:00.000Z',
        endISO: '2026-05-04T08:30:00.000Z',
      },
    };
    d.persistEdits();
  }, calUid);
  await page.waitForTimeout(150);

  await data(page, (d, uid) => {
    d.startEdit(d.filteredEvents.find(e => e.uid === uid), null);
  }, calUid);
  await page.waitForTimeout(200);

  assert.equal(await page.locator('button:has-text("Reset")').isVisible(), true);

  await page.locator('button:has-text("Reset")').click();
  await page.waitForTimeout(200);

  assert.equal((await storedEdits(page))[calUid], undefined);
});

test('Edited Task cell value persists', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const targetUid = await data(page, d => d.filteredEvents[0].uid);

  await page.locator('tbody tr:not(.edit-actions-row) td').first().click();
  await page.waitForTimeout(200);
  await data(page, d => { d.editForm.task = 'CUSTOM TASK'; });
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(200);

  assert.equal((await storedEdits(page))[targetUid]?.task, 'CUSTOM TASK');
  assert.equal(
    await data(page, (d, uid) => d.filteredEvents.find(e => e.uid === uid)?.task, targetUid),
    'CUSTOM TASK',
  );
});

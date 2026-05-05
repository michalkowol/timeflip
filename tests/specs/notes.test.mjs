import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPage } from '../helpers.mjs';

test('Notes FAB visible by default; opens panel; persists state', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  assert.equal(await page.locator('.notes-fab .notes-fab-btn').isVisible(), true);

  await page.click('.notes-fab .notes-fab-btn');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.notes-panel').isVisible(), true);

  assert.equal(
    await page.evaluate(() => localStorage.getItem('timeflip_notes_open')),
    '1',
  );

  await page.fill('.notes-textarea', 'Code -> EDEN-1\nLine two');
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('timeflip_notes')),
    'Code -> EDEN-1\nLine two',
  );

  await page.click('.notes-toggle');
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('timeflip_notes_open')),
    '0',
  );

  assert.equal(await page.locator('.notes-fab-dot').isVisible(), true);
});

test('Notes panel restored open after reload', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.evaluate(() => {
    localStorage.setItem('timeflip_notes_open', '1');
    localStorage.setItem('timeflip_notes', 'Persisted notes');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.Alpine);
  await page.waitForTimeout(200);

  assert.equal(await page.locator('.notes-panel').isVisible(), true);
  assert.equal(await page.locator('.notes-textarea').inputValue(), 'Persisted notes');
});

test('Notes panel and textarea sized to spec', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.click('.notes-fab .notes-fab-btn');
  await page.waitForTimeout(150);

  const { panelEm, textareaEm } = await page.evaluate(() => {
    const panel = document.querySelector('.notes-panel');
    const ta = document.querySelector('.notes-textarea');
    return {
      panelEm: panel.getBoundingClientRect().width / parseFloat(getComputedStyle(panel).fontSize),
      textareaEm: ta.getBoundingClientRect().height / parseFloat(getComputedStyle(ta).fontSize),
    };
  });
  assert.ok(panelEm >= 26, `panel >= 26em wide, got ${panelEm}`);
  assert.ok(textareaEm >= 18, `textarea >= 18em tall, got ${textareaEm}`);
});

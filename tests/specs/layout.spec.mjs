import { launchPage, bag } from '../helpers.mjs';

const checks = bag();

// ------------------------------------------------------------------
// 1) Column widths stable when entering edit mode
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();

  const before = await page.evaluate(() =>
    [...document.querySelectorAll('thead th')].map(th => th.getBoundingClientRect().width)
  );

  await page.locator('tbody tr:not(.edit-actions-row) td').nth(1).click();
  await page.waitForTimeout(200);

  const during = await page.evaluate(() =>
    [...document.querySelectorAll('thead th')].map(th => th.getBoundingClientRect().width)
  );

  for (let i = 0; i < before.length; i++) {
    checks.check(`column ${i} width stable (Δ < 1px)`,
      Math.abs(before[i] - during[i]) < 1, { before: before[i], during: during[i] });
  }
  await browser.close();
}

// ------------------------------------------------------------------
// 2) Edit-actions row layout: Delete on left, Cancel/Save on right,
//    Reset visible only when there is an overlay.
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  // Pre-seed an edit so Reset is visible.
  const calUid = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents[0].uid
  );
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

  const layout = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('tr.edit-actions-row button')];
    return btns.map(b => ({ label: b.textContent.trim(), x: b.getBoundingClientRect().x }));
  });
  checks.info('button x positions', layout);
  const delX = layout.find(l => l.label === 'Delete')?.x;
  const cancelX = layout.find(l => l.label === 'Cancel')?.x;
  const saveX = layout.find(l => l.label === 'Save')?.x;
  checks.check('Delete is leftmost', delX < cancelX && delX < saveX, { delX, cancelX, saveX });
  checks.check('Cancel left of Save', cancelX < saveX, { cancelX, saveX });
  await browser.close();
}

// ------------------------------------------------------------------
// 3) Time inputs not unreasonably narrow (regression: were ~3em earlier)
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  await page.locator('tbody tr:not(.edit-actions-row) td').nth(3).click(); // Start cell
  await page.waitForTimeout(200);

  const widths = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('tr.editing input[type="time"]')];
    return inputs.map(i => i.getBoundingClientRect().width);
  });
  checks.info('time input widths (px)', widths);
  for (const w of widths) {
    checks.check('time input wide enough (> 70px)', w > 70, w);
  }
  await browser.close();
}

// ------------------------------------------------------------------
// 4) Task cell not bold (was font-weight:600)
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();
  const fw = await page.evaluate(() => {
    const td = document.querySelector('tbody tr:not(.edit-actions-row) td.task');
    return getComputedStyle(td).fontWeight;
  });
  checks.check('task cell font-weight is normal (400)',
    fw === '400' || fw === 'normal', fw);
  await browser.close();
}

checks.report('layout.spec');

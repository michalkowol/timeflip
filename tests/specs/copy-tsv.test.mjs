import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPage, data } from '../helpers.mjs';

test('Copy TSV button is disabled when no events are visible', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await data(page, d => { d.fromDate = d.toDate = '2026-01-01'; });
  await page.waitForTimeout(150);

  assert.equal(await data(page, d => d.filteredEvents.length), 0);
  assert.equal(await page.locator('button:has-text("Copy TSV")').isDisabled(), true);
});

test('buildTsv returns one tab-separated row per filtered event, no header', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  const { tsv, expectedRows } = await data(page, d => ({
    tsv: d.buildTsv(),
    expectedRows: d.filteredEvents.map(e =>
      [e.task, e.summary, e.dateStr, e.startStr, e.endStr].join('\t')
    ),
  }));

  assert.ok(!tsv.startsWith('Task\t'), 'no header row');
  assert.deepEqual(tsv.split('\n'), expectedRows);
  assert.equal(expectedRows.length, 3, 'sample fixture has 3 events');
  for (const row of expectedRows) {
    assert.equal(row.split('\t').length, 5, `each row has 5 columns: ${row}`);
  }
});

test('buildTsv replaces tabs and newlines in field values with spaces', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await data(page, d => {
    const ev = d.filteredEvents[0];
    d.edits = {
      ...d.edits,
      [ev.uid]: {
        task: 'A\tB',
        summary: 'line1\nline2',
        startISO: new Date(d.fromDate + 'T09:00:00').toISOString(),
        endISO: new Date(d.fromDate + 'T09:30:00').toISOString(),
      },
    };
  });
  await page.waitForTimeout(100);

  const firstRow = (await data(page, d => d.buildTsv())).split('\n')[0];
  const cols = firstRow.split('\t');
  assert.equal(cols.length, 5);
  assert.equal(cols[0], 'A B', 'tab in task replaced with space');
  assert.equal(cols[1], 'line1 line2', 'newline in summary replaced with space');
});

test('Clicking Copy TSV copies filteredEvents to clipboard and flips label', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  const expected = await data(page, d => d.buildTsv());
  await page.click('button:has-text("Copy TSV")');
  await page.waitForTimeout(150);

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, expected);
  assert.equal(await data(page, d => d.copyTsvLabel), 'Copied!');

  await page.waitForTimeout(1700);
  assert.equal(await data(page, d => d.copyTsvLabel), 'Copy TSV');
});

test('Copy TSV reflects current filter range and edits', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await data(page, d => {
    const ev = d.filteredEvents.find(e => e.summary === 'Code');
    d.edits = {
      ...d.edits,
      [ev.uid]: {
        task: 'EDEN-1',
        summary: 'Code',
        startISO: new Date(ev.dateStr + 'T' + ev.startStr + ':00').toISOString(),
        endISO: new Date(ev.dateStr + 'T' + ev.endStr + ':00').toISOString(),
      },
    };
  });
  await page.waitForTimeout(100);

  const tsv = await data(page, d => d.buildTsv());
  const codeRow = tsv.split('\n').find(r => r.includes('Code'));
  assert.ok(codeRow.startsWith('EDEN-1\tCode\t'), `expected EDEN-1 prefix, got: ${codeRow}`);
});

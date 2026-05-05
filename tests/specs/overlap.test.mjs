import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPage, data, FIXTURE_DATE } from '../helpers.mjs';

test('Overlapping badge appears for overlapping events', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await page.evaluate(() => {
    localStorage.setItem('timeflip_added_events', JSON.stringify([
      { uid: 'local-A', task: 'Timeflip', summary: 'Event A', startISO: '2026-05-04T07:00:00.000Z', endISO: '2026-05-04T08:00:00.000Z' },
      { uid: 'local-B', task: 'Timeflip', summary: 'Event B', startISO: '2026-05-04T07:30:00.000Z', endISO: '2026-05-04T08:30:00.000Z' },
      { uid: 'local-C', task: 'Timeflip', summary: 'Event C', startISO: '2026-05-04T15:00:00.000Z', endISO: '2026-05-04T15:30:00.000Z' },
    ]));
    const ds = {};
    window.Alpine.$data(document.querySelector('[x-data]')).events.forEach(e => { ds[e.uid] = true; });
    localStorage.setItem('timeflip_deleted_uids', JSON.stringify(ds));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.Alpine);
  await data(page, (d, day) => {
    d.fromDate = d.toDate = day;
    d.mergeShortEnabled = false;
  }, FIXTURE_DATE);
  await page.waitForTimeout(150);

  const flags = await data(page, d =>
    d.filteredEvents.map(e => ({ uid: e.uid, overlapping: e.overlapping })),
  );
  assert.equal(flags.find(f => f.uid === 'local-A').overlapping, true);
  assert.equal(flags.find(f => f.uid === 'local-B').overlapping, true);
  assert.equal(flags.find(f => f.uid === 'local-C').overlapping, false);

  assert.equal(await page.locator('.overlap-badge:visible').count(), 2);

  // Editing a row hides its own badge.
  await page.evaluate(() => {
    document.querySelectorAll('tbody tr:not(.edit-actions-row)')[0].querySelectorAll('td')[1].click();
  });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.overlap-badge:visible').count(), 1);
});

test('Events touching within the same minute are not overlapping', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await data(page, d => {
    d.events = [
      // A ends at 10:30:45, B starts at 10:30:15 - both render as "10:30".
      { uid: 'A', task: 'Timeflip', summary: 'A', start: new Date('2026-05-04T09:00:00Z'), end: new Date('2026-05-04T10:30:45Z') },
      { uid: 'B', task: 'Timeflip', summary: 'B', start: new Date('2026-05-04T10:30:15Z'), end: new Date('2026-05-04T11:00:00Z') },
      // C ends at 12:00:00, D starts at 12:00:00 - exact touch, also same minute.
      { uid: 'C', task: 'Timeflip', summary: 'C', start: new Date('2026-05-04T11:30:00Z'), end: new Date('2026-05-04T12:00:00Z') },
      { uid: 'D', task: 'Timeflip', summary: 'D', start: new Date('2026-05-04T12:00:00Z'), end: new Date('2026-05-04T12:30:00Z') },
      // E and F clearly overlap by more than a minute - sanity check.
      { uid: 'E', task: 'Timeflip', summary: 'E', start: new Date('2026-05-04T13:00:00Z'), end: new Date('2026-05-04T14:00:00Z') },
      { uid: 'F', task: 'Timeflip', summary: 'F', start: new Date('2026-05-04T13:30:00Z'), end: new Date('2026-05-04T14:30:00Z') },
    ];
    d.mergeShortEnabled = false;
  });
  await page.waitForTimeout(150);

  const flags = await data(page, d =>
    d.filteredEvents.map(e => ({ uid: e.uid, overlapping: e.overlapping })),
  );
  const flag = uid => flags.find(f => f.uid === uid).overlapping;
  assert.equal(flag('A'), false);
  assert.equal(flag('B'), false);
  assert.equal(flag('C'), false);
  assert.equal(flag('D'), false);
  assert.equal(flag('E'), true);
  assert.equal(flag('F'), true);
});

test('mergeShortTasks keeps long event duration when short overlaps it', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await data(page, d => {
    d.events = [
      { uid: 'long', task: 'Timeflip', summary: 'Long', start: new Date('2026-05-04T09:00:00Z'), end: new Date('2026-05-04T10:00:00Z') },
      { uid: 'short', task: 'Timeflip', summary: 'Short', start: new Date('2026-05-04T09:15:00Z'), end: new Date('2026-05-04T09:16:00Z') },
    ];
    d.mergeShortEnabled = true;
  });
  await page.waitForTimeout(150);

  const longEv = await data(page, d =>
    d.filteredEvents.map(e => ({ uid: e.uid, dur: e.durationMs })).find(m => m.uid === 'long'),
  );
  assert.ok(longEv && longEv.dur >= 60 * 60 * 1000, `long event keeps full 60min, got ${longEv?.dur}ms`);
});

test('Buggy merge (injected) shrinks long event - guards against regression', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  await data(page, d => {
    d.mergeShortTasks = function (events) {
      const SHORT_MS = 3 * 60 * 1000;
      const GAP_MS = 10 * 60 * 1000;
      const sorted = [...events].sort((a, b) => a.start - b.start);
      const result = [];
      for (const task of sorted) {
        const isShort = (task.end - task.start) <= SHORT_MS;
        const cur = { ...task, isShort };
        if (result.length > 0) {
          const last = result[result.length - 1];
          const gap = cur.start.getTime() - last.end.getTime();
          const contiguous = gap < GAP_MS;
          if (contiguous) {
            if (last.isShort && !cur.isShort) {
              cur.start = last.start; result.pop(); result.push(cur); continue;
            }
            if (cur.isShort) {
              last.end = cur.end; continue; // <-- the bug
            }
          }
        }
        result.push(cur);
      }
      return result;
    };
    d.events = [
      { uid: 'long', task: 'Timeflip', summary: 'Long', start: new Date('2026-05-04T09:00:00Z'), end: new Date('2026-05-04T10:00:00Z') },
      { uid: 'short', task: 'Timeflip', summary: 'Short', start: new Date('2026-05-04T09:15:00Z'), end: new Date('2026-05-04T09:16:00Z') },
    ];
    d.mergeShortEnabled = true;
  });
  await page.waitForTimeout(150);

  const buggyLong = await data(page, d =>
    d.filteredEvents.map(e => ({ uid: e.uid, dur: e.durationMs })).find(m => m.uid === 'long'),
  );
  assert.ok(
    buggyLong && buggyLong.dur < 60 * 60 * 1000,
    `with buggy merge injected, long should shrink, got ${buggyLong?.dur}ms`,
  );
});

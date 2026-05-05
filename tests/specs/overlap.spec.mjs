import { launchPage, bag } from '../helpers.mjs';

const checks = bag();

// ------------------------------------------------------------------
// 1) Overlapping badge appears for overlapping events
// ------------------------------------------------------------------
{
  const { browser, page } = await launchPage();

  await page.evaluate(() => {
    localStorage.setItem('timeflip_added_events', JSON.stringify([
      { uid: 'local-A', task: 'Timeflip', summary: 'Event A', startISO: '2026-05-04T07:00:00.000Z', endISO: '2026-05-04T08:00:00.000Z' },
      { uid: 'local-B', task: 'Timeflip', summary: 'Event B', startISO: '2026-05-04T07:30:00.000Z', endISO: '2026-05-04T08:30:00.000Z' },
      { uid: 'local-C', task: 'Timeflip', summary: 'Event C', startISO: '2026-05-04T15:00:00.000Z', endISO: '2026-05-04T15:30:00.000Z' },
    ]));
    // Hide all calendar events to isolate test
    const ds = {};
    window.Alpine.$data(document.querySelector('[x-data]')).events.forEach(e => { ds[e.uid] = true; });
    localStorage.setItem('timeflip_deleted_uids', JSON.stringify(ds));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.Alpine);
  await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    d.fromDate = '2026-05-04';
    d.toDate = '2026-05-04';
    d.mergeShortEnabled = false;
  });
  await page.waitForTimeout(250);

  const flags = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents.map(e => ({ uid: e.uid, overlapping: e.overlapping }))
  );
  checks.info('overlap flags', flags);
  checks.check('A overlapping=true', flags.find(f => f.uid === 'local-A')?.overlapping === true, flags);
  checks.check('B overlapping=true', flags.find(f => f.uid === 'local-B')?.overlapping === true, flags);
  checks.check('C overlapping=false', flags.find(f => f.uid === 'local-C')?.overlapping === false, flags);

  const visibleBadges = await page.locator('.overlap-badge:visible').count();
  checks.check('exactly 2 visible badges', visibleBadges === 2, visibleBadges);

  // Badge hidden when row is being edited
  await page.evaluate(() => {
    document.querySelectorAll('tbody tr:not(.edit-actions-row)')[0].querySelectorAll('td')[1].click();
  });
  await page.waitForTimeout(200);
  const duringEdit = await page.locator('.overlap-badge:visible').count();
  checks.check('editing row hides its own badge (now 1 visible)', duringEdit === 1, duringEdit);

  await browser.close();
}

// ------------------------------------------------------------------
// 2) Red-green: mergeShortTasks no longer shrinks last.end on overlap
// ------------------------------------------------------------------
// Long event 09:00-10:00 + short event 09:15-09:16 entirely inside it.
// Old buggy merge would set last.end = cur.end, shrinking long to 16min.
// Fixed merge keeps long.end (uses Math.max-equivalent guard).
{
  const { browser, page } = await launchPage();
  await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
    d.events = [
      { uid: 'long', task: 'Timeflip', summary: 'Long', start: new Date('2026-05-04T09:00:00Z'), end: new Date('2026-05-04T10:00:00Z') },
      { uid: 'short', task: 'Timeflip', summary: 'Short', start: new Date('2026-05-04T09:15:00Z'), end: new Date('2026-05-04T09:16:00Z') },
    ];
    d.mergeShortEnabled = true;
  });
  await page.waitForTimeout(150);
  const merged = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents.map(e => ({ uid: e.uid, dur: e.durationMs }))
  );
  checks.info('merged result', merged);
  const longEv = merged.find(m => m.uid === 'long');
  checks.check('GREEN: long event keeps full 60min duration',
    longEv?.dur >= 60 * 60 * 1000, longEv);
  await browser.close();
}

// Reverse direction (RED): inject the OLD buggy mergeShortTasks at runtime
// and confirm it would shrink the long event. This proves the fix matters.
{
  const { browser, page } = await launchPage();
  await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data]'));
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
  const buggy = await page.evaluate(() =>
    window.Alpine.$data(document.querySelector('[x-data]')).filteredEvents.map(e => ({ uid: e.uid, dur: e.durationMs }))
  );
  const buggyLong = buggy.find(m => m.uid === 'long');
  checks.check('RED: with buggy merge injected, long shrinks to <60min',
    buggyLong?.dur < 60 * 60 * 1000, buggyLong);
  await browser.close();
}

checks.report('overlap.spec');

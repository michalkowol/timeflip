# Timeflip Events

A single-page Alpine.js viewer for a Timeflip ICS feed. Pick a date range and the page shows the entries in a `Task | Comment | Date | Start | End` table, where `Task` is always `Timeflip` and `Comment` is the event's `SUMMARY`.

## Short-task merging

Timeflip tracks every cube flip, which means real activity is often peppered with very brief entries (accidental flips, momentary status changes). When the **Merge short tasks** checkbox is enabled (default on), the viewer collapses these tiny entries into their neighbors so the table reads as actual blocks of work.

### Definitions

- **Short task**: an entry whose duration is `≤ 3 minutes`.
- **Gap**: the elapsed time between the `end` of one entry and the `start` of the next.
- **Adjacent**: two entries whose gap is `< 10 minutes`. A gap of `≥ 10 minutes` is treated as a real "I wasn't working" pause and is never bridged.

### Algorithm

Entries are sorted by start time and processed in order, building a result list. For each new entry `cur` (with `isShort` flag), we look at the last entry already in the result list (`last`):

1. If the result list is empty, push `cur`.
2. If `last` and `cur` are **not adjacent** (gap ≥ 10 min), push `cur` as-is — the gap is preserved.
3. If they are adjacent:
   - **`last` is short, `cur` is long** → absorb the short into the long: set `cur.start = last.start`, replace `last` with `cur` in the result. The long task's label wins.
   - **`cur` is short** (regardless of whether `last` is short or long) → absorb `cur` into `last`: extend `last.end = cur.end`. The label of `last` is kept.
   - **Both are long** → no merge; push `cur` as a new entry.

A merged entry keeps an `isShort` flag that stays `true` only as long as it was built exclusively from short pieces. The first long task that joins it flips the flag to `false`, which is what makes case 3a work for chains like `short → short → long`.

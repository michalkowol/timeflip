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

### Worked examples

Long = `L`, Short = `S`, contiguous = no gap or gap < 10 min, gap = ≥ 10 min:

| Input sequence                 | Result                                                |
|--------------------------------|-------------------------------------------------------|
| `L1, S, L2` (all contiguous)   | `L1` extended to cover `S`, then `L2` separate        |
| `L1, S, L2` with `L1—S` gap    | `L1`, `S` (kept alone), `L2` |
| `S, L1` contiguous             | `L1` with `start` pulled back to `S.start`             |
| `S1, S2, L1` all contiguous    | `S1+S2` first merge into one short, then `L1` absorbs it: one entry spanning `S1.start → L1.end` |
| `S1, S2` contiguous, no `L`    | A single merged short entry `S1.start → S2.end`        |
| `S1, S2` with gap between      | Both kept separately                                   |
| `L1, L2` contiguous            | Untouched — two long entries are never combined      |
| First entry of the day is `S`  | Stays alone unless the **next** entry is adjacent and long, in which case the long absorbs it |
| Last entry of the day is `S`   | Already absorbed if the previous entry was adjacent; otherwise stays alone |

### Why this shape

- **Don't fill real pauses.** Bridging a 30-minute coffee break would inflate working time. The 10-minute threshold is the practical cutoff between "noise between flips" and "I stepped away".
- **Long labels dominate.** When a short and a long meet, the long task's `SUMMARY` is almost always the meaningful one, so it survives the merge.
- **Chains collapse correctly.** Multiple shorts in a row first roll up into one short block, which a neighboring long can then absorb in a single step.

# Timeflip Tests

End-to-end tests that load `../index.html` in a real headless Chromium (via Playwright),
run real Alpine, and assert on real DOM/state. Built on Node's built-in test runner
(`node:test`) — no extra framework.

## Setup

```bash
cd tests
npm install
```

`npm install` also downloads a Chromium build for Playwright (~100MB) via the `postinstall` hook.

## Run

```bash
# All specs
npm test

# A single spec
node --test specs/notes.test.mjs

# Filter by test name
node --test --test-name-pattern='Autosave' specs/
```

## Layout

```
tests/
├── helpers.mjs          # launchPage / data / setRange / reload
├── fixtures/sample.ics  # canned ICS for the stubbed network
└── specs/*.test.mjs     # one file per feature; each file = a few independent tests
```

## Helpers

- `launchPage(opts)` — fresh browser + page with all network requests stubbed.
  Returns `{ browser, page }`. Always pair with `t.after(() => browser.close())`.
- `data(page, fn, arg)` — runs `fn(d, arg)` inside the page where `d` is the Alpine
  root data. Avoids the `window.Alpine.$data(...)` boilerplate.
- `setRange(page, from?, to?, mergeShortEnabled?)` — set date range and let it settle.
- `reload(page)` — reload, wait for Alpine, re-apply default range.

## Test shape

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPage, data } from '../helpers.mjs';

test('what it should do', async (t) => {
  const { browser, page } = await launchPage();
  t.after(() => browser.close());

  // ... interact with the page ...
  assert.equal(await data(page, d => d.editingUid), null);
});
```

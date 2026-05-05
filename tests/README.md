# Timeflip Tests

End-to-end tests that load `../index.html` in a real headless Chromium (via Playwright),
run real Alpine, and assert on real DOM/state. Built on Node's built-in test runner
(`node:test`) — no extra framework.

## Setup

```bash
cd tests
pnpm install
```

`pnpm install` also downloads a Chromium build for Playwright (~100MB) via the `postinstall` hook.

## Run

```bash
# All specs
pnpm test

# A single spec
node --test specs/notes.test.mjs

# Filter by test name
node --test --test-name-pattern='Autosave' specs/
```

## Principles

In order of priority:

1. **Removability.** Every test is a self-contained block, deletable without touching
   anything else. Setup, action, and assertions live in the same `test(...)` block.
   No fixture coupling, no shared state, no test-order dependencies.
2. **Easy to understand.** Reading a test top-to-bottom should tell you everything it
   does. Hidden side effects in helpers are the enemy. Prefer a few explicit lines over
   a clever one-liner that reaches into shared state.
3. **Easy to modify.** Small surface area in `helpers.mjs`. Magic values get names
   (`FIXTURE_DATE`). The rule of three: don't extract a helper until the same code
   appears three times — duplication is cheaper than the wrong abstraction.

What this means in practice:

- `launchPage` and `data` earn their keep (used in every test, 50+ uses respectively).
- We do **not** have helpers like `setRange(page)` or `reload(page)` — they hid the magic
  date and the `mergeShortEnabled = false` side effect. The 4-5 lines they replaced are
  inlined in the 2-3 tests that need them, where readers can see exactly what's happening.
- File-local helpers used <3 times are inlined. Helpers used 5+ times in one file
  (e.g. `storedEdits` in `edit.test.mjs`) stay.

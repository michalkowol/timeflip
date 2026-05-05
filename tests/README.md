# Timeflip Tests

End-to-end tests that load `../index.html` in a real headless Chromium (via Playwright), run real Alpine, and assert on real DOM/state.

## Setup

```bash
cd tests
npm install
```

`npm install` will also download a Chromium build for Playwright (~100MB) via the `postinstall` hook.

## Run

```bash
# All specs
npm test
```

# Native DPI Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select and analyze the `capturePage` NativeImage representation that matches the current screen scale, while reporting the actual native/logical scale without assuming 1x.

**Architecture:** A focused CommonJS helper chooses the exact requested representation or the closest scale returned by `NativeImage.getScaleFactors()`. It passes that selected scale to `getSize(scaleFactor)`, `toPNG({ scaleFactor })`, and `toBitmap({ scaleFactor })`, computes all metrics from those matching outputs, and reports requested, selected, and actual x/y scales to the Electron smoke harness.

**Tech Stack:** Electron 42.4.1 NativeImage API, Node test runner, Electron browser smoke.

---

### Task 1: NativeImage Representation Helper

**Files:**
- Create: `tests/NativeImageMetrics.js`
- Create: `tests/NativeImageMetrics.test.js`

- [x] Write a failing table test for requested scales `1`, `1.25`, `1.5`, `1.75`, and `2`, asserting the chosen scale is passed to `getSize`, `toPNG`, and `toBitmap`.
- [x] Write a failing fallback test proving a missing requested representation selects the closest reported scale and derives actual x/y scale from native/logical dimensions.
- [x] Run `node --test tests/NativeImageMetrics.test.js` and confirm failure because the helper does not exist.
- [x] Implement `imageMetrics(image, { logicalWidth, logicalHeight, requestedScaleFactor })` with exact-or-nearest representation selection and same-representation luminance/color analysis.
- [x] Run `node --test tests/NativeImageMetrics.test.js` and confirm all helper tests pass.

### Task 2: Smoke Integration And Reporting

**Files:**
- Modify: `tests/SmokeReactRenderer.js`
- Modify: `tests/SmokeReactRenderer.test.js`

- [x] Add a failing source contract requiring the helper import and requested, selected, and actual scale reporting.
- [x] Replace the inline image conversion with the helper, passing `viewport.deviceScaleFactor` and logical dimensions.
- [x] Assert x/y scale agreement, actual supported scale, aspect ratio, native dimensions, and nonblank metrics with rounding-aware tolerances.
- [x] Report `logicalWidth`, `logicalHeight`, `nativeWidth`, `nativeHeight`, `requestedScaleFactor`, `selectedScaleFactor`, `actualScaleX`, and `actualScaleY` for all six captures.
- [x] Run `node --test tests/NativeImageMetrics.test.js tests/SmokeReactRenderer.test.js`.
- [x] Run `npm run smoke:react` at the current 1.75 device scale and record all six native dimensions.

### Task 3: Verification And Commit

**Files:** all files above.

- [x] Run `npm run verify` and `npm run verify:package`.
- [x] Inspect `git diff --check`, staged paths, and final worktree status.
- [x] Commit as `fix: capture profile screenshots at native DPI` without amending prior commits.

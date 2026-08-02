# Align Smoke Scale Tolerance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `NativeImageMetrics` the sole scale-consistency authority so smoke capture cannot override proportional tolerance with legacy constants.

**Architecture:** `imageMetrics` continues to validate native/logical x/y scale using proportional and one-pixel tolerance. The smoke harness trusts that validation and retains only screenshot completeness checks for encoded size, luminance, and sampled colors.

**Tech Stack:** Node.js test runner, Electron browser smoke, Electron 42.4.1 NativeImage API.

---

### Task 1: Prove The Divergent Threshold

**Files:**
- Modify: `tests/NativeImageMetrics.test.js`
- Modify: `tests/SmokeReactRenderer.test.js`

- [x] Change the proportional-tolerance case to logical `250x250` and native `753x750`, yielding `3.012x3.0`; this exceeds one pixel and legacy `0.01` while remaining within 0.5%.
- [x] Add source assertions that reject `scaleTolerance`, `aspectError`, and direct smoke-level `actualScaleX - actualScaleY` checks.
- [x] Run `node --test tests/NativeImageMetrics.test.js tests/SmokeReactRenderer.test.js` and confirm the source contract fails against the legacy smoke checks.

### Task 2: Single Scale Authority

**Files:**
- Modify: `tests/SmokeReactRenderer.js`

- [x] Remove duplicate x/y scale and fixed aspect validation from the smoke harness.
- [x] Preserve byte-size, luminance-range, sampled-color, reporting, and Electron 42 representation behavior.
- [x] Run focused tests and `npm run smoke:react`.

### Task 3: Verification And Commit

**Files:** all files above.

- [x] Run `npm run verify` and `npm run verify:package`.
- [x] Self-review the diff and run `git diff --check`.
- [x] Stage only intended files and commit as `fix: align smoke scale tolerance` without amending.
- [x] Confirm final SHA and clean worktree.

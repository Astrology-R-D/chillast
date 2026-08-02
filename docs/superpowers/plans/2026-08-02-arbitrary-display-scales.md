# Arbitrary Display Scale Factors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept any finite requested display scale from 0.5 through 4 and validate measured NativeImage scale without a fixed scale-factor enum.

**Architecture:** `NativeImageMetrics` validates requested scale as a bounded continuous number, chooses the numerically closest reported representation, and derives actual x/y scale from native and logical dimensions. Measured-scale validation uses a proportional tolerance combined with one-pixel rounding tolerance, while preserving Electron 42's valid metadata/pixel-scale mismatch.

**Tech Stack:** Node.js test runner, Electron 42.4.1 NativeImage API, Electron browser smoke.

---

### Task 1: Continuous Scale Validation

**Files:**
- Modify: `tests/NativeImageMetrics.test.js`
- Modify: `tests/NativeImageMetrics.js`

- [x] Add failing table tests for requested scales `1.1`, `2.25`, `2.5`, and `3`, asserting the exact scale reaches `getSize`, `toPNG`, and `toBitmap`.
- [x] Add failing invalid-input tests for `0`, negative, `NaN`, infinities, values below `0.5`, and values above `4`.
- [x] Add failing coverage proving closest-representation selection remains numeric for arbitrary fractional scales.
- [x] Run `node --test tests/NativeImageMetrics.test.js` and confirm failures are caused by enum validation.
- [x] Replace the enum with inclusive finite range validation and proportional plus one-pixel measured-scale tolerance.
- [x] Run `node --test tests/NativeImageMetrics.test.js` and confirm all tests pass.

### Task 2: Smoke And Full Verification

**Files:**
- Modify only if required by a regression: `tests/SmokeReactRenderer.js`

- [x] Run `node --test tests/NativeImageMetrics.test.js tests/SmokeReactRenderer.test.js`.
- [x] Run `npm run smoke:react` at the current display scale.
- [x] Run `npm run verify` and `npm run verify:package`.
- [x] Review the diff and run `git diff --check`.

### Task 3: Commit

**Files:** all files above.

- [x] Stage only intended files.
- [x] Commit as `fix: support arbitrary display scale factors` without amending.
- [x] Confirm the final SHA and clean worktree.

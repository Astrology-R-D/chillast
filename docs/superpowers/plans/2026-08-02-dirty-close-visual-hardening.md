# Dirty Close And Visual Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve dirty edits across recoverable renderer states and save races while making every React smoke screenshot prove exact logical and native-pixel sizing.

**Architecture:** CloseGuard distinguishes transient window unresponsiveness from terminal renderer loss. ProfileForm publishes a backward-compatible single-flight draft registration, and DirtyNavigationProvider coordinates native close contention and busy saves. Browser smoke synchronizes the logical viewport before layout checks and captures the untouched NativeImage with device-scale assertions.

**Tech Stack:** Electron, React 19, TypeScript, Vitest, Testing Library, Node test runner.

---

### Task 1: Recoverable Close Guard

**Files:**
- Modify: `tests/CloseGuard.test.js`
- Modify: `src/main/CloseGuard.js`

- [x] Add a failing test proving `unresponsive` leaves the guarded close pending and permits later cancel/proceed.
- [x] Split transient unresponsive diagnostics from render-process-gone and destroyed force-close handlers.
- [x] Run `node --test tests/CloseGuard.test.js`.

### Task 2: Native Contention And Single-Flight Saves

**Files:**
- Modify: `src/renderer-react/features/profiles/ProfileForm.test.tsx`
- Modify: `src/renderer-react/features/profiles/ProfileEditor.tsx`
- Modify: `src/renderer-react/shell/DirtyNavigationProvider.test.tsx`
- Modify: `src/renderer-react/shell/DirtyNavigationProvider.tsx`

- [x] Add failing tests for same-promise saves, native cancellation during an in-app request, and direct-save success/failure ordering.
- [x] Add `busy` without changing `dirty`, `save`, or `discard`; make `save` return its current in-flight promise.
- [x] Cancel conflicting native close immediately while retaining the in-app request.
- [x] Enter a disabled, focusable saving dialog for busy drafts; automatically continue only after successful save.
- [x] Run focused ProfileForm and DirtyNavigationProvider tests.

### Task 3: Full-Root Shell Geometry

**Files:**
- Modify: `src/renderer-react/shell/dirty-navigation.css`
- Modify: `src/renderer-react/shell/shell-css.test.ts`

- [x] Add a failing CSS contract for full width, height, minimum sizing, and clipping.
- [x] Apply the full-root background wrapper constraints.
- [x] Run the focused CSS test.

### Task 4: Native Screenshot Evidence

**Files:**
- Modify: `tests/SmokeReactRenderer.test.js`
- Modify: `tests/SmokeReactRenderer.js`

- [x] Add failing source contracts for exact viewport polling, root/background/shell bounds, device scale, native dimensions, and absence of image resizing.
- [x] Poll exact `window.innerWidth/innerHeight` after every `setContentSize` and before reload, geometry, or capture.
- [x] Assert all shell bounds against the logical viewport at all six sizes.
- [x] Capture and save the original NativeImage; validate native pixel dimensions, x/y scale consistency, aspect ratio, and nonblank metrics.
- [x] Run source tests and React smoke three times.

### Task 5: Verification And Commit

**Files:** all files above.

- [x] Run focused tests, full renderer tests, `npm run verify`, and `npm run verify:package`.
- [x] Inspect all six original-DPI screenshots and record event/dimension evidence.
- [x] Commit as `fix: harden dirty close and visual workflows` without amending prior commits.

# PCP Pattern Pursuit

A web-first puzzle game based on the Post Correspondence Problem (PCP). Arrange domino-like tiles so that the concatenated top and bottom strings match. Built for browsers now (React + TypeScript + Vite), with a shared `pcp-engine` core to reuse in a future Flutter/Android app.

## Core Loop
- Generate a PCP instance (via seed or at random).
- Drag tiles to build an ordered stack; top and bottom strings update live.
- Validate at any time; if matched, you win. If stuck, hit **Show solution** to auto-place the correct stack and end the round.
- Track elapsed time and move count per run; keep a local leaderboard/history.

## Difficulty & Presets
Presets set defaults that the user can still tweak. Extreme is the only mode that may be unsolvable.

- **Easy**: 4-6 tiles, alphabet size 2, string length 2-3, guaranteed solvable, short solution path.
- **Medium**: 5-7 tiles, alphabet size 2-3, string length 2-4, guaranteed solvable, moderate solution length.
- **Hard**: 7-9 tiles, alphabet size 3, string length 3-5, guaranteed solvable, longer/near-unique solution.
- **Extreme**: 8-10 tiles, alphabet size 3-4, string length 3-6, may be unsolvable. User can declare "unsolvable" or keep searching; show-solution reveals if solvable.

## Configurable Settings
- Number of tiles, alphabet size, min/max string length, and solution length limits.
- Seed input (optional). If blank, a random seed is generated; the seed drives the generator for reproducible puzzles.
- Mode toggles: allow repeated tiles, allow unsolvable instances (Extreme only), enforce unique solution.
- UI: enable live mismatch highlighting, auto-validate on each drop, and confirm-before-reset.

## Repeatability & Sharing
- Each puzzle is derived from a seed; display it in the UI.
- **Share** button copies the seed (and preset/flags) to the clipboard for replay.
- **Import seed** input in Settings to load a specific puzzle; if invalid, fall back to a random seed with a warning.

## Drag & Drop UX
- Mouse and touch drag-drop from day one.
- Drop targets show the current order; tiles snap into place.
- Live preview of concatenated top/bottom strings with mismatch highlighting.
- Undo/redo stack and a reset button (preserves the same puzzle/seed).

## Show Solution Behavior
- Button instantly places the correct tile order (if solvable) and ends the game.
- In Extreme mode with an unsolvable instance, it reveals that no solution exists.
- After reveal, disable further moves but allow replay with the same or new seed.

## Architecture Plan
- **apps/web**: React + TypeScript + Vite UI. Minimal styling initially; accessible and responsive.
- **packages/pcp-engine** (shared core):
  - Puzzle generator (seeded PRNG, deterministic, can emit solvable or unsolvable instances based on flags).
  - Validator/solver to confirm solutions and power the Show Solution button.
  - Types for presets, tiles, seeds, and puzzle exports.
- Future: port `pcp-engine` to Dart or expose a thin API for Flutter; web app can later become a PWA.

## Development Setup (once scaffolded)
- Prereqs: Node 18+ and pnpm/npm.
- Install: `pnpm install` (or `npm install`).
- Run dev server: `pnpm dev`.
- Tests: `pnpm test` for core/solver; add fast property-based tests for generator validity (solvable when required, expected failure when unsolvable).

## Gameplay UX Notes
- Intro screen explains PCP in plain language and the win condition.
- Game screen: toolbar (preset selector, seed display/share, timer, moves, reset, show solution), board with slots, tile tray, and status area.
- Leaderboard/history: local-only list of past seeds with time and moves; no enforced timer, just stats.

## Roadmap
- Hints (next tile, partial validation, contradiction detection).
- Theming and richer visuals/animations.
- PWA installability; offline cache.
- Cloud sync for history/leaderboard (optional, opt-in).
- Localization and accessibility polish.

# ♛ Queendom

A browser puzzle game: place N queens on an NxN grid divided into N colored regions. One queen per region, no two queens share a row or column, and no two queens are adjacent. Boards are algorithmically generated and guaranteed to be solvable through logical deduction alone — no guessing required.

## How to Play

- **Double-click** a square to place a queen
- **Single-click** a square to mark it with an X (and remove it)
- Press **P** to pause, **N** for a new game

You start with 3 lives. An incorrect queen placement costs one life and leaves a permanent red X. Place all queens correctly to win.

### Rules

1. No two queens may occupy the same row or column.
2. No queen may be adjacent to another (including diagonally — Chebyshev distance > 1).
3. Each colored region contains exactly one queen.

This is similar to N-Queens, but with the added constraint of non-adjacency and the guidance of colored regions that make every board solvable by logic alone.

## Playing

Open `index.html` in a browser, or serve locally:

```bash
npx serve .
```

No build step is needed — plain HTML/CSS/JS with ESM modules.

## Development

```bash
npm install        # install dev dependencies (vitest)
npm test           # run all tests once
npm run test:watch # run tests in watch mode
```

## Architecture

The codebase follows a unidirectional pipeline: **Generator → Solver → Engine → Renderer**.

| Module | Role |
|---|---|
| `js/generator.js` | Creates boards: places N non-adjacent queen positions, grows colored regions around them via BFS, then validates solvability. Uses a seeded PRNG for reproducibility. |
| `js/solver.js` | Human-style logical solver with 7 technique tiers (basic elimination, naked/hidden singles, region confinement, pigeonhole, adjacency blocking, forcing chains). Validates that generated boards are solvable within difficulty constraints. |
| `js/engine.js` | Pure-logic game state machine. No DOM. Manages placement validation, marks, lives, timer, and win/lose detection. |
| `js/renderer.js` | DOM rendering. Reads game state and updates the board UI. |
| `js/main.js` | Entry point. Wires renderer callbacks to engine, manages timer and overlays. |
| `js/prng.js` | Mulberry32 seeded PRNG with helpers for reproducible randomness. |

### Difficulty Tiers

- **Easy**: solvable with basic techniques only, no forcing chains
- **Medium**: allows up to one forcing chain
- **Hard**: all techniques allowed, up to two forcing chains

### Board Generation

1. Generate N queen positions (no shared rows/columns, no adjacent queens)
2. Seed each region at its queen position
3. Grow regions via BFS frontier expansion weighted by difficulty
4. Run the solver to validate logical solvability within difficulty constraints
5. On failure, attempt guided mutation of region boundaries before full regeneration

## Project Structure

```
css/style.css       Game styling
js/                 Core modules (generator, solver, engine, renderer, main, prng)
plan/               Design documents (gameplay rules, strategy, structure, style)
test/               Vitest test suites and fixtures
index.html          Entry point
local.sh            Local dev server script
```

## Tests

- **Generator** — solution validity, region connectivity, solvability, PRNG reproducibility
- **Solver** — individual techniques, full solve on fixtures, difficulty validation (6×6–10×10)
- **Engine** — game creation, placement, marks, timer, win/lose conditions

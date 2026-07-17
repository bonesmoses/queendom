// Board Generator — produces valid, solvable Queens puzzles.
// Strategy: design regions around a known queen placement so that logical deduction
// can recover the solution. Regions are shaped to create tight constraints.

import { createRng, rngInt, rngFloat, rngShuffle } from './prng.js';
import { solveWithMaxTechnique } from './solver.js';

export const Difficulty = Object.freeze({
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
});

// Each difficulty specifies:
//   maxTechnique — highest solver technique allowed (1–8)
//   maxForcing   — how many times forcing chains (tech viii) may fire
const DIFF_CONFIG = {
  [Difficulty.EASY]:  { maxTechnique: 5, maxForcing: 0 },
  [Difficulty.MEDIUM]: { maxTechnique: 6, maxForcing: 1 },
  [Difficulty.HARD]:  { maxTechnique: 7, maxForcing: 2 },
};

/**
 * Generate a complete puzzle. Retries until solver can solve it.
 */
export function generateBoard(size, difficulty = Difficulty.HARD, seed = null) {
  if (seed === null) {
    seed = Math.floor(Math.random() * 2 ** 31);
  }

  let attempt = 0;
  const maxAttempts = 10000;

  while (attempt < maxAttempts) {
    const rng = createRng(seed + attempt * 1000);

    const solution = generateQueenPlacement(size, rng);
    if (!solution) { attempt++; continue; }

    const regions = designRegions(size, solution, difficulty, rng);
    if (!regions) { attempt++; continue; }

    // Validate: all cells assigned, all regions connected
    if (!validateRegions(regions, size)) { attempt++; continue; }

    // Validate solvability within the difficulty's constraints
    const config = DIFF_CONFIG[difficulty];

    // Cheap pre-filter — reject obviously bad boards before running the solver
    if (!preFilter(regions, size)) { attempt++; continue; }

    const result = solveWithMaxTechnique(regions, size, config.maxTechnique, config.maxForcing);
    if (result.solved) {
      return { regions, solution, seed: seed + attempt * 1000 };
    }

    // If the solver got close, try mutating the board instead of starting over
    const diag = result.diagnostics;
    if (diag && isCloseEnough(diag, size)) {
      let mutations = 0;
      const maxMutations = 10;
      while (mutations < maxMutations) {
        mutateRegions(regions, size, diag.stuckRegions, rng);
        if (!validateRegions(regions, size)) { mutations++; continue; }
        const mutatedResult = solveWithMaxTechnique(regions, size, config.maxTechnique, config.maxForcing);
        if (mutatedResult.solved) {
          // Extract the actual solution from the solver — the original queen placement
          // may no longer be valid for the mutated regions.
          const newSolution = [];
          for (const [, cellKey] of mutatedResult.placements) {
            const key = Number(cellKey);
            newSolution.push([Math.floor(key / 100), key % 100]);
          }
          return { regions, solution: newSolution, seed: seed + attempt * 1000 };
        }
        mutations++;
      }
    }

    attempt++;
  }

  throw new Error(
    `Failed to generate solvable ${size}x${size} puzzle (${difficulty}) after ${maxAttempts} attempts`
  );
}

// ===========================================================================
// Guided mutation — fix "close" boards instead of discarding them
// ===========================================================================

/**
 * Is this failed board close enough to bother mutating?
 * Criteria: placed at least half the regions, not a contradiction,
 * and total remaining candidates is manageable.
 */
function isCloseEnough(diag, size) {
  if (diag.contradiction) return false; // contradictions are hard to fix with small changes
  const placedFraction = diag.placed / diag.totalRegions;
  if (placedFraction < 0.5) return false; // too far from solved
  // Total candidates across stuck regions should be reasonable
  const maxCandidates = size * 6;
  if (diag.totalCandidates > maxCandidates) return false;
  return true;
}

/**
 * Mutate region boundaries to tighten constraints on stuck regions.
 * Strategy: pick a cell from the most-stuck region, reassign it to an adjacent region.
 * This shrinks the stuck region (fewer candidates) and grows another.
 */
function mutateRegions(regions, size, stuckRegions, rng) {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Pick one of the top 3 most-stuck regions (most candidates)
  const targetIdx = rngInt(rng, 0, Math.min(3, stuckRegions.length));
  const targetRegion = stuckRegions[targetIdx].regionId;

  // Find all cells in this region
  const cells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] === targetRegion) cells.push([r, c]);
    }
  }

  if (cells.length <= 1) return; // can't shrink further

  // Find boundary cells (adjacent to a different region)
  const boundaryCells = [];
  for (const [r, c] of cells) {
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] !== targetRegion) {
        boundaryCells.push([r, c]);
        break;
      }
    }
  }

  if (boundaryCells.length === 0) return; // isolated region, can't mutate safely

  // Pick a random boundary cell and reassign to a random adjacent region
  const [mr, mc] = boundaryCells[rngInt(rng, 0, boundaryCells.length)];

  // Collect adjacent regions
  const adjRegions = new Set();
  for (const [dr, dc] of dirs) {
    const nr = mr + dr, nc = mc + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] !== targetRegion) {
      adjRegions.add(regions[nr][nc]);
    }
  }

  if (adjRegions.size === 0) return;

  const newRegion = [...adjRegions][rngInt(rng, 0, adjRegions.size)];
  regions[mr][mc] = newRegion;
}

// ===========================================================================
// Queen Placement (backtracking with random ordering)
// ===========================================================================

function generateQueenPlacement(size, rng) {
  const usedCols = new Set();
  const placedQueens = [];

  function backtrack(row) {
    if (row === size) return true;
    const available = [];
    for (let c = 0; c < size; c++) if (!usedCols.has(c)) available.push(c);
    rngShuffle(available, rng);

    for (const col of available) {
      let ok = true;
      for (const [pr, pc] of placedQueens) {
        if (Math.max(Math.abs(pr - row), Math.abs(pc - col)) <= 1) { ok = false; break; }
      }
      if (!ok) continue;
      usedCols.add(col);
      placedQueens.push([row, col]);
      if (backtrack(row + 1)) return true;
      usedCols.delete(col);
      placedQueens.pop();
    }
    return false;
  }

  if (backtrack(0)) return placedQueens.map((q) => [...q]);
  return null;
}

// ===========================================================================
// Region Design — create regions that enable logical deduction
// ===========================================================================

/**
 * Design N connected regions using a weighted Voronoi partition.
 *
 * Strategy:
 * 1. Use queen positions as seeds with adjustable weights.
 *    Lower weight → smaller cell (distance is divided by weight).
 * 2. On easy/medium, many seeds get low weights to create small regions
 *    (2-6 cells) needed for naked singles deductions.
 * 3. Assign every grid cell to the nearest weighted seed.
 * 4. Voronoi cells on a rectangular grid with distinct seeds are always
 *    connected, so no explicit connectivity check is needed beyond validation.
 */
function designRegions(size, solution, difficulty, rng) {
  // Weighted Voronoi: dist_i = hypot(r - sr, c - sc) / weight[i]
  // Lower weight → smaller cell. Default weight = 1.0.
  const weights = new Array(size).fill(1.0);
  let nSmall;
  switch (difficulty) {
    case 'easy':
      nSmall = Math.ceil(size * 0.7);
      break;
    case 'medium':
      nSmall = size >= 10 ? Math.ceil(size * 0.55) : Math.ceil(size * 0.5);
      break;
    default: // hard
      nSmall = Math.ceil(size * 0.2);
  }

  // Pick random seeds to shrink
  const smallIndices = new Set();
  while (smallIndices.size < nSmall) {
    smallIndices.add(rngInt(rng, 0, size));
  }

  for (let i = 0; i < size; i++) {
    if (smallIndices.has(i)) {
      // Random weight between 0.25 and 0.6 → much smaller cells
      weights[i] = 0.25 + rngFloat(rng) * 0.35;
    }
  }

  // Weighted Voronoi partition: each cell → nearest (weighted) seed
  const regions = Array.from({ length: size }, () => new Array(size).fill(-1));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let bestDist = Infinity;
      const ties = [];

      for (let i = 0; i < solution.length; i++) {
        const [sr, sc] = solution[i];
        const dist = Math.hypot(r - sr, c - sc) / weights[i];
        if (dist < bestDist) {
          bestDist = dist;
          ties.length = 0;
          ties.push(i);
        } else if (dist === bestDist) {
          ties.push(i);
        }
      }

      regions[r][c] = ties[rngInt(rng, 0, ties.length)];
    }
  }

  // Ensure each queen's original cell belongs to its own region.
  for (let i = 0; i < solution.length; i++) {
    const [r, c] = solution[i];
    regions[r][c] = i;
  }

  return regions;
}

// ===========================================================================
// Pre-filter — cheap heuristics to reject obviously unsolvable boards early
// ===========================================================================

/**
 * Reject boards that are obviously unsolvable before running the expensive solver.
 * Checks:
 *  - At least half the regions have ≤6 cells (need small regions for naked singles)
 *  - No region is too dominant (>40% of board — leaves no room for deduction)
 */
function preFilter(regions, size) {
  const regSize = new Map();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const id = regions[r][c];
      regSize.set(id, (regSize.get(id) || 0) + 1);
    }
  }

  const totalCells = size * size;
  let smallCount = 0;
  for (const [, s] of regSize) {
    if (s > totalCells * 0.4) return false; // One region dominates the board
    if (s <= 6) smallCount++;
  }

  // Need enough small regions relative to board size
  const minSmall = Math.ceil(size * 0.3);
  if (smallCount < minSmall) return false;

  return true;
}

// ===========================================================================
// Validation helpers
// ===========================================================================

function validateRegions(regions, size) {
  // All cells assigned?
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] === -1) return false;
    }
  }

  // Each region connected?
  const regionIds = new Set();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      regionIds.add(regions[r][c]);
    }
  }

  for (const id of regionIds) {
    if (!isRegionConnected(regions, size, id)) return false;
  }

  return true;
}

function isRegionConnected(regions, size, regionId) {
  let startR = -1, startC = -1, count = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] === regionId) {
        count++;
        if (startR === -1) { startR = r; startC = c; }
      }
    }
  }
  if (count === 0 || startR === -1) return false;

  const visited = Array.from({ length: size }, () => new Array(size).fill(false));
  const queue = [[startR, startC]];
  visited[startR][startC] = true;
  let reached = 0;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    reached++;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited[nr][nc] && regions[nr][nc] === regionId) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }

  return reached === count;
}

/**
 * Validate that a queen placement satisfies all constraints.
 */
export function isValidSolution(solution, size) {
  if (solution.length !== size) return false;
  const rows = new Set(), cols = new Set();
  for (let i = 0; i < solution.length; i++) {
    const [r1, c1] = solution[i];
    if (rows.has(r1) || cols.has(c1)) return false;
    rows.add(r1); cols.add(c1);
    for (let j = i + 1; j < solution.length; j++) {
      const [r2, c2] = solution[j];
      if (Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)) <= 1) return false;
    }
  }
  return true;
}

export function areRegionsConnected(regions, size) {
  const ids = new Set();
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) ids.add(regions[r][c]);
  for (const id of ids) if (!isRegionConnected(regions, size, id)) return false;
  return true;
}

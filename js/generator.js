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
 * Design N connected regions around queen positions.
 *
 * Strategy:
 * 1. Each queen's cell is the seed for its region (region ID = queen index).
 * 2. Grow regions using BFS from seeds, respecting target sizes.
 *    Target sizes ensure some small regions (2-4 cells) exist so naked singles fire early,
 *    creating a cascade of eliminations.
 */
function designRegions(size, solution, difficulty, rng) {
  const regions = Array.from({ length: size }, () => new Array(size).fill(-1));

  // Seed queen cells
  for (let i = 0; i < size; i++) {
    const [r, c] = solution[i];
    regions[r][c] = i;
  }

  // Determine target sizes: some small, some larger
  const targetSizes = computeTargetSizes(size, difficulty, rng);

  // Grow regions using BFS from seeds, respecting target sizes
  const regionCurrentSize = new Array(size).fill(1);
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Track assigned cells so we can build the frontier by scanning only neighbors
  const assignedCells = [];
  for (let i = 0; i < size; i++) {
    const [r, c] = solution[i];
    assignedCells.push([r, c]);
  }

  function buildFrontier() {
    // Scan neighbors of assigned cells to find all unassigned frontier cells.
    // Each cell may border multiple regions, so it appears once per adjacent region.
    const adj = new Map(); // key (r*size+c) -> Set of regionIds
    for (const [ar, ac] of assignedCells) {
      const reg = regions[ar][ac];
      for (const [dr, dc] of dirs) {
        const nr = ar + dr, nc = ac + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] === -1) {
          const key = nr * size + nc;
          if (!adj.has(key)) adj.set(key, new Set());
          adj.get(key).add(reg);
        }
      }
    }
    const frontier = [];
    for (const [key, regs] of adj) {
      const r = Math.floor(key / size), c = key % size;
      for (const reg of regs) {
        frontier.push({ r, c, fromRegion: reg });
      }
    }
    return frontier;
  }

  let assigned = size;
  const totalCells = size * size;

  while (assigned < totalCells) {
    const frontier = buildFrontier();
    if (frontier.length === 0) break; // shouldn't happen with connected growth

    // Filter: only regions that haven't reached their target
    const eligible = frontier.filter(
      (f) => regionCurrentSize[f.fromRegion] < targetSizes[f.fromRegion]
    );

    let chosen;
    if (eligible.length === 0) {
      // All targets met but cells remain — relax and allow any region to grow
      chosen = frontier[rngInt(rng, 0, frontier.length)];
    } else {
      // Weighted pick: prefer regions that are behind their target
      const weights = eligible.map(
        (f) => targetSizes[f.fromRegion] - regionCurrentSize[f.fromRegion] + 1
      );
      chosen = eligible[weightedPick(eligible.length, weights, rng)];
    }

    assignCell(chosen, regions, regionCurrentSize);
    assignedCells.push([chosen.r, chosen.c]);
    assigned++;
  }

  if (assigned < totalCells) return null; // unreachable cells
  return regions;
}

function assignCell({ r, c, fromRegion }, regions, regionCurrentSize) {
  regions[r][c] = fromRegion;
  regionCurrentSize[fromRegion]++;
}

function weightedPick(n, weights, rng) {
  let total = 0;
  for (const w of weights) total += w;
  let r = rngFloat(rng) * total;
  for (let i = 0; i < n; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return n - 1;
}

/**
 * Compute target region sizes. Small regions create easy deductions.
 * Easy: more small regions (2-3 cells). Hard: more varied/larger regions.
 * For larger boards at easy/medium, keep most regions very small so basic techniques suffice.
 */
function computeTargetSizes(size, difficulty, rng) {
  const totalCells = size * size;

  // Scale small region count based on both difficulty and board size
  let nSmall, smallMax;
  switch (difficulty) {
    case 'easy':
      nSmall = Math.ceil(size * 0.7);
      smallMax = size <= 8 ? 4 : 3;
      break;
    case 'medium':
      nSmall = size >= 10 ? Math.ceil(size * 0.65) : Math.ceil(size * 0.5);
      smallMax = size <= 8 ? 5 : (size <= 10 ? 4 : 3);
      break;
    default: // hard
      nSmall = Math.ceil(size * 0.2);
      smallMax = Math.floor(totalCells / size) + 2;
  }

  const sizes = new Array(size).fill(0);

  // Assign small sizes to some regions
  for (let i = 0; i < nSmall; i++) {
    sizes[i] = rngInt(rng, 2, smallMax + 1);
  }

  // Distribute remaining cells among larger regions
  const remainingCells = totalCells - sizes.slice(0, nSmall).reduce((a, b) => a + b, 0);
  const largeCount = size - nSmall;

  if (largeCount > 0) {
    const baseLarge = Math.floor(remainingCells / largeCount);
    let extra = remainingCells - baseLarge * largeCount;
    for (let i = nSmall; i < size; i++) {
      sizes[i] = baseLarge + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
    }
  }

  // Shuffle so small regions aren't always first
  rngShuffle(sizes, rng);

  // Ensure no region is smaller than 1 or larger than totalCells - size + 1
  for (let i = 0; i < size; i++) {
    sizes[i] = Math.max(1, Math.min(sizes[i], totalCells - size + 1));
  }

  // Adjust to exactly fill the board
  let sum = sizes.reduce((a, b) => a + b, 0);
  while (sum < totalCells) {
    const idx = rngInt(rng, 0, size);
    sizes[idx]++;
    sum++;
  }
  while (sum > totalCells) {
    const idx = rngInt(rng, 0, size);
    if (sizes[idx] > 1) { sizes[idx]--; sum--; }
  }

  return sizes;
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

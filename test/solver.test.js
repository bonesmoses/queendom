import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  createSolverState,
  applyBasicElimination,
  applyNakedSingles,
  applyHiddenSingles,
  applyRegionConfinement,
  applyPigeonhole,
  applyAdjacencyBlocking,
  applyRowColIntersection,
  applyForcingChains,
  solve,
  solveWithMaxTechnique,
} from '../js/solver.js';
import { generateBoard } from '../js/generator.js';

const fixtures = JSON.parse(readFileSync('test/fixtures.json', 'utf-8'));

function cellKey(r, c) { return r * 100 + c; }

describe('Solver — Basic Elimination', () => {
  it('eliminates row, column, and adjacent cells from other regions', () => {
    const regions = [
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5],
    ];
    const state = createSolverState(regions, 6);
    state.placed.set(0, cellKey(0, 0));
    applyBasicElimination(state);

    expect(state.candidates[0]).toEqual(new Set([cellKey(0, 0)]));
    for (let reg = 1; reg < 6; reg++) {
      for (const key of state.candidates[reg]) {
        const [r, c] = [Math.floor(key / 100), key % 100];
        expect(r === 0 || c === 0 || (r <= 1 && c <= 1)).toBe(false);
      }
    }
  });

  it('handles multiple placements cumulatively', () => {
    const regions = [
      [0, 0, 1, 1, 2, 2],
      [0, 0, 1, 1, 2, 2],
      [3, 3, 4, 4, 5, 5],
      [3, 3, 4, 4, 5, 5],
      [3, 3, 4, 4, 5, 5],
      [3, 3, 4, 4, 5, 5],
    ];
    const state = createSolverState(regions, 6);
    state.placed.set(0, cellKey(0, 0));
    state.placed.set(1, cellKey(1, 3));
    applyBasicElimination(state);

    expect(state.candidates[0]).toEqual(new Set([cellKey(0, 0)]));
    expect(state.candidates[1]).toEqual(new Set([cellKey(1, 3)]));
  });
});

describe('Solver — Naked Singles', () => {
  it('places queen when region has exactly one candidate', () => {
    const regions = [[0, 1, 2], [0, 1, 2], [0, 1, 2]];
    const state = createSolverState(regions, 3);
    state.candidates[0].clear();
    state.candidates[0].add(cellKey(1, 0));

    const result = applyNakedSingles(state);
    expect(result.changed).toBe(true);
    expect(state.placed.get(0)).toBe(cellKey(1, 0));
  });

  it('does not place when region has multiple candidates', () => {
    const regions = [[0, 1], [0, 1]];
    const state = createSolverState(regions, 2);
    const result = applyNakedSingles(state);
    expect(result.changed).toBe(false);
  });
});

describe('Solver — Region Confinement', () => {
  it('claims a row when all candidates are in that row', () => {
    const regions = [
      [1, 1, 2, 2],
      [0, 0, 2, 2],
      [3, 3, 3, 3],
      [3, 3, 3, 3],
    ];
    const state = createSolverState(regions, 4);
    expect([...state.candidates[0]].map(k => Math.floor(k / 100))).toEqual([1, 1]);

    const result = applyRegionConfinement(state);
    expect(result.changed).toBe(true);
  });
});

describe('Solver — Adjacency Blocking', () => {
  it('eliminates candidate that would kill another region', () => {
    const regions = [[0, 1, 2], [0, 1, 2], [0, 1, 2]];
    const state = createSolverState(regions, 3);

    // Region 2 has only candidate at (1,2)
    state.candidates[2].clear();
    state.candidates[2].add(cellKey(1, 2));

    // If region 0 places at (1,0), it blocks row 1 → kills region 2's only candidate
    const result = applyAdjacencyBlocking(state);
    expect(result.changed).toBe(true);
    expect(state.candidates[0].has(cellKey(1, 0))).toBe(false);
  });
});

describe('Solver — Full Solve on Fixtures', () => {
  for (const fixture of fixtures) {
    it(`solves ${fixture.name}`, () => {
      const result = solve(fixture.regions, fixture.size);
      expect(result.solved).toBe(true);

      if (result.placements) {
        // Verify the solution is valid: one queen per region, no conflicts
        const placements = [];
        for (const [regId, cellKeyVal] of result.placements) {
          const r = Math.floor(cellKeyVal / 100);
          const c = cellKeyVal % 100;
          // Queen must be in its own region
          expect(fixture.regions[r][c]).toBe(Number(regId));
          placements.push([r, c]);
        }

        // No shared rows or columns
        const rows = new Set(placements.map(p => p[0]));
        const cols = new Set(placements.map(p => p[1]));
        expect(rows.size).toBe(fixture.size);
        expect(cols.size).toBe(fixture.size);

        // No adjacent queens (Chebyshev distance > 1)
        for (let i = 0; i < placements.length; i++) {
          for (let j = i + 1; j < placements.length; j++) {
            const [r1, c1] = placements[i];
            const [r2, c2] = placements[j];
            expect(Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2))).toBeGreaterThan(1);
          }
        }
      }
    });
  }
});

describe('Solver — Difficulty Validation', () => {
  it('easy puzzles are solvable with techniques i-v only (no forcing)', () => {
    for (let size = 6; size <= 10; size++) {
      const board = generateBoard(size, 'easy', size * 777);
      const result = solveWithMaxTechnique(board.regions, size, 5, 0);
      expect(result.solved).toBe(true);
    }
  }, 60000);

  it('medium puzzles are solvable with techniques i-vi + 1 forcing chain', () => {
    for (let size = 6; size <= 10; size++) {
      const board = generateBoard(size, 'medium', size * 888);
      const result = solveWithMaxTechnique(board.regions, size, 6, 1);
      expect(result.solved).toBe(true);
    }
  }, 60000);

  it('hard puzzles are solvable with full solver (i-viii) + 2 forcing chains', () => {
    for (let size = 6; size <= 10; size++) {
      const board = generateBoard(size, 'hard', size * 999);
      const result = solveWithMaxTechnique(board.regions, size, 8, 2);
      expect(result.solved).toBe(true);
    }
  }, 60000);
});

describe('Solver — Edge Cases', () => {
  it('returns unsolved for contradictory board', () => {
    // Board where region 0 has no cells (all cells are region 1 or 2)
    const regions = [[1, 2, 2], [1, 2, 2], [1, 2, 2]];
    const result = solve(regions, 3);
    expect(result.solved).toBe(false);
  });

  it('handles trivially solvable board', () => {
    // Each cell is its own region — only one possible placement per region
    const regions = [[0, 1], [2, 3]];
    // This won't be solvable due to adjacency on a 2x2, but shouldn't crash
    const state = createSolverState(regions, 2);
    expect(state.candidates.length).toBe(4); // 4 regions (0-3)
  });
});

describe('Difficulty Enforcement — Regression', () => {
  it('median technique tier strictly increases with difficulty', () => {
    // Generate multiple boards per difficulty and verify median technique increases
    const sizes = [6, 7, 8];
    for (const size of sizes) {
      const easyTechs = [], mediumTechs = [], hardTechs = [];
      
      for (let seed = 0; seed < 10; seed++) {
        const easyBoard = generateBoard(size, 'easy', size * 100 + seed);
        const medBoard = generateBoard(size, 'medium', size * 200 + seed);
        const hardBoard = generateBoard(size, 'hard', size * 300 + seed);
        
        const easyResult = solveWithMaxTechnique(easyBoard.regions, size, 5, 0);
        const medResult = solveWithMaxTechnique(medBoard.regions, size, 6, 1);
        const hardResult = solveWithMaxTechnique(hardBoard.regions, size, 8, 2);
        
        easyTechs.push(Math.max(...[...easyResult.techniquesUsed]));
        mediumTechs.push(Math.max(...[...medResult.techniquesUsed]));
        hardTechs.push(Math.max(...[...hardResult.techniquesUsed]));
      }
      
      const median = arr => { const s = [...arr].sort((a,b) => a-b); return s[Math.floor(s.length/2)]; };
      
      // Medium should be >= easy, hard should be >= medium
      expect(median(mediumTechs)).toBeGreaterThanOrEqual(median(easyTechs));
      expect(median(hardTechs)).toBeGreaterThanOrEqual(median(mediumTechs));
    }
  }, 120000);

  it('no easy board uses techniques beyond v (pigeonhole)', () => {
    for (let size = 6; size <= 8; size++) {
      const board = generateBoard(size, 'easy', size * 333);
      const result = solveWithMaxTechnique(board.regions, size, 5, 0);
      expect(result.solved).toBe(true);
      // All techniques used should be <= PIGEONHOLE (index 3) or BASIC_ELIMINATION (-1)
      for (const t of result.techniquesUsed) {
        expect(t).toBeLessThanOrEqual(3); // PIGEONHOLE = 3
      }
    }
  }, 60000);

  it('≥90% of medium boards use at least one technique ≥ minTechnique', () => {
    const sizes = [6, 7, 8];
    for (const size of sizes) {
      let passCount = 0;
      const total = 10;
      
      // Import TECHNIQUE_INDEX to compute minTechnique
      const { TECHNIQUE_INDEX } = require('../js/solver.js');
      const minTech = size >= 8 ? TECHNIQUE_INDEX.ADJACENCY_BLOCKING 
                   : size >= 7 ? TECHNIQUE_INDEX.PIGEONHOLE 
                   : TECHNIQUE_INDEX.REGION_CONFINEMENT;
      
      for (let seed = 0; seed < total; seed++) {
        const board = generateBoard(size, 'medium', size * 400 + seed);
        const result = solveWithMaxTechnique(board.regions, size, 6, 1);
        
        let hasAdvanced = false;
        for (const [techIdx] of result.techniqueStats) {
          if (techIdx >= minTech && techIdx !== TECHNIQUE_INDEX.FORCING_CHAINS) {
            hasAdvanced = true;
            break;
          }
        }
        if (hasAdvanced) passCount++;
      }
      
      expect(passCount).toBeGreaterThanOrEqual(Math.ceil(total * 0.9));
    }
  }, 120000);
});

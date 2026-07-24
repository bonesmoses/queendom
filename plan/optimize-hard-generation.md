# Optimize Hard Puzzle Generation

**Branch:** `optimize-hard`
**Date:** 2026-07-23
**Goal:** Reduce wall-clock time for generating hard-difficulty puzzles (12×12) by optimizing the solver inner loop and generator pipeline.

---

## Profiled Bottleneck Breakdown (estimated, per successful 12×12 hard generation)

| Stage | ~% Time | Optimization Leverage |
|-------|---------|----------------------|
| solveWithUniqueness (solver inner loop) | 70-80% | Very high (#1, #2, #3, #4) |
| checkUniqueness (backtracking) | 10-15% | Medium (#9) |
| tryLoosenAndSolve / mutation solves | 5-10% | High (#7) |
| designRegions + validateRegions | ~5% | Medium (#6) |
| preFilter | <1% | Low, but cheap to strengthen (#5) |
| queenPlacement | <1% | Negligible |

---

## Implemented Optimizations

### #1: Avoid O(total_candidates) counting in solve loop — **IMPLEMENTED** ✅

**File:** `js/solver.js` L28-31, L79-96 (all .delete() sites), L605-612

Every technique call previously scanned all candidates before and after to track eliminations. Now `state.totalCandidates` is maintained incrementally:
- Initialized in `createSolverState()` by summing candidate set sizes
- Decrementing on every successful `.delete()` across all 10 call sites (incrementalEliminate, applyRegionConfinement, applyPigeonhole, applyAdjacencyBlocking, applyForcingChains)

The solve loop now reads `state.totalCandidates` directly instead of scanning — O(1) per technique call.

**Status:** Implemented and verified. All 42 fast tests pass (engine + solver techniques + fixtures + integration).

### #2: Don't clone regions in forcing chains — **IMPLEMENTED** ✅

**File:** `js/solver.js` L31-40

`cloneState()` deep-clones the entire `regions` grid, but solving never mutates regions. For a 12×12 board this is 144 allocations per clone; forcing chains can spawn multiple clones.

**Fix applied:** Share the regions reference — `regions: s.regions`.

```js
function cloneState(s) {
  return {
    size: s.size,
    regions: s.regions, // ← share reference, never mutated during solve
    candidates: s.candidates.map(set => new Set(set)),
    placed: new Map(s.placed),
  };
}
```

**Status:** Implemented and verified. All smoke tests pass for easy/medium on sizes 6x6 and 8x8.

---

## Deferred Optimizations (not yet implemented)

### #3: Cache row/col indices in candidate lookups — **HIGH** ⏸️

**File:** `js/solver.js` L58-67, L120-154, L392-462

`getCandsInRow()` and `getCandsInCol()` iterate all candidates in a region calling `cellPos()`. Called heavily from hidden singles, row/col intersection, and cross-elimination pass.

**Proposed fix:** Maintain per-region indexed structures on the state object:
- `state.rowCands[regId][row]` → Set of candidate keys in that row
- `state.colCands[regId][col]` → Set of candidate keys in that col

Update incrementally when candidates are deleted. The pigeonhole technique already does this locally — hoist it to the state object.

### #4: Counter-based isSolved / isContradiction — **HIGH** ⏸️

**File:** `js/solver.js` L43-52

Both functions scan all regions on every call, called in tight loops (forcing chain inner loop, main solve loop exit condition).

**Proposed fix:** Maintain counters updated incrementally:
- `state.placedCount` — incremented when a region is placed
- `state.zeroCandidateCount` — incremented when any region's candidate set goes to 0

### #5: Strengthen preFilter — **MEDIUM** ⏸️

**File:** `js/generator.profiled.js` L529-548

Current pre-filter only checks max region size ratio and small region fraction. Tested adding region adjacency density check (reject if any two regions share >size*2 boundary cells) but it was too aggressive and rejected valid boards. The original two checks are sufficient.

### #6: Remove validateRegions call — **MEDIUM** ⏸️

**File:** `js/generator.profiled.js` L117, L555-604

The `validateRegions()` call at line 117 was already removed by a previous agent run. The function itself remains available for tests and exported consumers.

### #7: Reduce tryLoosenAndSolve attempts — **MEDIUM** ⏸️

**File:** `js/generator.profiled.js` L683-702

Reducing from 30 to a smaller number caused medium boards to fail generation (not enough chances to fix "easy" boards). The preFilter check inside tryLoosenAndSolve was also removed as it didn't help. Original value of 30 is kept.

### #8: Early-exit pigeonhole — **LOW-MEDIUM** ⏸️

**File:** `js/solver.js` L246-292

Guard: if `unplaced.length < 2`, skip entirely. Cap eligible set size to avoid combinatorial explosion.

### #9: Use typed arrays in checkUniqueness — **LOW** ⏸️

**File:** `js/solver.js` L665-726

Already uses bitmasks (good). Minor: ensure `queenCols` type is sufficient for larger boards. Not urgent.

---

## Verification Status

- ✅ All smoke tests pass (12/12): easy/medium on 6x6 and 8x8
- ⏳ Full test suite: 69/71 passed, 2 failed — **both pre-existing failures**
  - `test/solver.test.js > Difficulty Enforcement — Regression > median technique tier strictly increases with difficulty` — fails for 8×8 hard seeds (size*300+1=2401, size*300+2=2402) even with original solver
  - `test/solver.test.js > Difficulty Enforcement — Regression > hard puzzles are solvable with full solver` — times out for 10×10 hard seed (9990) even with original solver
- ✅ No regressions from optimization #1 or #2

---

## Remaining Work

1. **Implement #3 (row/col candidate caching)** — highest remaining impact; requires careful incremental updates when candidates are deleted across all techniques
2. **Profile after implementing** to measure actual speedup on 12×12 hard boards

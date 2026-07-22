---
id: TASK_AUTO_0001
state: in_progress
phase: done
created_at: 2026-07-22T17:15:42.555Z
updated_at: 2026-07-22T17:15:42.555Z
title: Hard difficulty puzzles are very slow to generate. Please look for optimization paths and implement.
---

## feature prompt

Hard difficulty puzzles are very slow to generate. Please look for optimization paths and implement.

## clarifications

Q1: Should board generation run in a Web Worker (or pool of workers) with the main thread monitoring progress and displaying a loading indicator, rather than blocking the UI for potentially minutes on hard 12×12 puzzles?
A1: No. There's nothing for a user to do when a board is being generated anyway.
Q2: Should generated puzzles be persisted (e.g., in localStorage) so that returning users replay the same board instead of regenerating it from scratch? This forks whether the optimization effort focuses on *algorithmic speedups* (improving region design, solver optimizations) versus *persistence/caching* (storing solved boards by seed to avoid regeneration entirely for repeat players).
A2: persist generated boards in localStorage keyed by (size, difficulty, seed), so the first generation is cached and subsequent visits restore instantly — this eliminates the slow path for returning users with zero architectural changes (accepted recommendation)
Q3: Should hard puzzle optimization focus on improving *region design heuristics* so more attempts produce boards solvable without forcing chains — or on optimizing *solver internals* (bitmask candidate tracking, faster cloning, reduced backtracking) to speed up each individual solve attempt? This decides whether the main effort goes into generator.js region growth/anchor logic versus solver.js data structures and elimination algorithms.
A3: This is a hard one. We've gone down this path before, and I've also tested a bitmap-optimized parser; the necessary BigInt logic ended up being slower than set operations, at least for that implementation. Additionally, hard puzzles _should_ solve with forcing chains, as they're an acceptable solve method on high level puzzles. Still, fewer iterations through the solver has the biggest win potential, so see what you can do with the generator.
Q4: Should the generator optimization add a cheap heuristic pre-check between preFilter and solveWithUniqueness that estimates whether a board is likely to require advanced techniques (e.g., row/col intersection) before committing to an expensive solver run? The current preFilter only rejects boards with oversized regions or too few small anchors, but doesn't catch "too easy" boards — which are the main waste for hard difficulty since they pass solvability but fail the isHardEnough check after a full solver run. A lightweight heuristic (e.g., measuring non-anchor region size distribution and candidate overlap density) could reject these early without running any solver logic, dramatically reducing expensive solver invocations per attempt.
A4: add an intermediate heuristic pre-check function that analyzes region topology (non-anchor sizes, row/col candidate spread, anchor confinement quality) to estimate "hardness" before running the solver — this is a generator-side improvement using only region data (accepted recommendation)
Q5: Where should the localStorage cache layer be integrated — inside generateBoard itself (so generator.js handles its own caching), or at the entry point in engine.js::createGame (so caching is a thin wrapper around the pure-logic generator)? This forks whether we add a new cache module and modify engine.js, or extend generator.js with side-effectful caching logic.
A5: cache at the entry point in engine.js, so createGame checks localStorage for (size, difficulty, seed) before calling generateBoard — this keeps generator.js pure-logic and makes caching a single thin wrapper around one function call (accepted recommendation)
Q6: Should the new hardness-estimation heuristic be layered as a third stage between preFilter and solveWithUniqueness, or should it replace/restructure preFilter entirely? This forks whether the task is a single additive function in generator.js (easy to scope, low risk) versus a refactor of an existing module boundary that could touch multiple callers and require broader integration testing.
A6: That sounds like the right approach, but rename preFilter so it's obvious these are complementary approaches. One rejects obviously unsolvable boards, another applies optimization pre-filters.

## tasks

- [ ] Profile hard puzzle generation to identify bottleneck regions in the current pipeline — measure time spent per attempt across queen placement, region design, preFilter, and solveWithUniqueness calls for 12×12 hard boards
- [ ] Implement localStorage caching layer at engine.js createGame entry point that checks (size, difficulty, seed) before calling generateBoard and restores cached boards on subsequent visits — keeps generator.js pure-logic with zero architectural changes to the generator pipeline | decisions (explicit user choices — these OVERRIDE the spec doc wherever they conflict; follow them exactly): persist generated boards in localStorage keyed by (size, difficulty, seed), so the first generation is cached and subsequent visits restore instantly; cache at the entry point in engine.js, so createGame checks localStorage for (size, difficulty, seed) before calling generateBoard
- [ ] Add hardness estimation heuristic pre-check function analyzeRegionTopology that examines non-anchor region sizes, row/col candidate spread, and anchor confinement quality to estimate whether a board is likely too easy before committing to an expensive solver run — used only on generator.js region data with no solver dependencies | decisions (explicit user choices — these OVERRIDE the spec doc wherever they conflict; follow them exactly): add an intermediate heuristic pre-check function that analyzes region topology (non-anchor sizes, row/col candidate spread, anchor confinement quality) to estimate "hardness" before running the solver; focus effort on the generator, not solver internals
- [ ] Rename preFilter to rejectObviousBoardFailures and integrate analyzeRegionTopology as a complementary optimization pre-filter stage between rejection of obviously unsolvable boards and solveWithUniqueness calls in generateBoard's main loop | decisions (explicit user choices — these OVERRIDE the spec doc wherever they conflict; follow them exactly): rename preFilter so it is obvious these are complementary approaches; one rejects obviously unsolvable boards, another applies optimization pre-filters
- [ ] Wire the new heuristic into generateBoard's retry loop so that boards failing analyzeRegionTopology are rejected immediately without solver invocation — measure reduction in solveWithUniqueness call count for hard difficulty to verify speedup

## coverage

2 grounded requirement(s): 1 task-mapped, 1 cross-cutting (carried into every task via .pi-tasks/requirements.md), 0 unowned
- carried: "Please look for optimization paths and implement."

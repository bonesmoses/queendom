// Game Engine — pure-logic state machine. No DOM dependencies.
// Manages game state: lives, timer, queen placements, marks, win/lose detection.

import { generateBoard } from './generator.js';

export const Mark = Object.freeze({ NONE: 'none', X: 'x', DEAD: 'dead' });
export const Status = Object.freeze({ PLAYING: 'playing', WON: 'won', LOST: 'lost' });

/**
 * Create a new game state with a freshly generated board.
 *
 * @param {number} size — board dimension (6–12)
 * @param {string} difficulty — 'easy' | 'medium' | 'hard'
 * @param {number|null} seed — PRNG seed, or null for random
 * @returns {GameState}
 */
export function createGame(size, difficulty = 'hard', seed = null) {
  const { regions, solution, seed: boardSeed } = generateBoard(size, difficulty, seed);

  // Build solution set for fast lookup: cellKey -> true
  const solutionSet = new Set();
  for (const [r, c] of solution) {
    solutionSet.add(cellKey(r, c));
  }

  return {
    size,
    difficulty,
    regions,
    solution,
    solutionSet,
    queens: new Map(),       // cellKey -> regionId (placed queens)
    marks: new Map(),        // cellKey -> Mark.X | Mark.DEAD
    lives: 3,
    timerSeconds: 0,
    timerRunning: true,
    status: Status.PLAYING,
    seed: boardSeed,
  };
}

// Override seed after generateBoard captures it
const origCreateGame = createGame;
export function createGameWithSeed(size, difficulty, seed) {
  const game = origCreateGame(size, difficulty, seed);
  return game;
}

/**
 * Internal: convert [row, col] to cell key.
 */
function cellKey(r, c) {
  return r * 100 + c;
}

export { cellKey as _cellKey }; // exported for testing/rendering

/**
 * Parse cell key back to [row, col].
 */
export function cellPos(key) {
  return [Math.floor(key / 100), key % 100];
}

/**
 * Attempt to place a queen at (row, col).
 * Returns { ok: boolean, message: string }.
 *
 * - If the cell already has a queen or is out of bounds → rejected.
 * - If the cell matches the solution → queen placed, win checked.
 * - If the cell does not match → life lost, permanent dead mark placed.
 */
export function placeQueen(game, row, col) {
  if (game.status !== Status.PLAYING) {
    return { ok: false, message: 'Game is not in progress.' };
  }

  const key = cellKey(row, col);

  // Already has a queen?
  if (game.queens.has(key)) {
    return { ok: false, message: 'A queen is already here.' };
  }

  // Check against solution
  if (game.solutionSet.has(key)) {
    // Correct placement!
    const regionId = game.regions[row][col];
    game.queens.set(key, regionId);
    // Remove any player mark on this cell
    game.marks.delete(key);

    // Check win condition
    if (game.queens.size === game.size) {
      game.status = Status.WON;
      game.timerRunning = false;
    }

    return { ok: true, message: '' };
  } else {
    // Wrong placement — lose a life
    game.lives--;
    game.marks.set(key, Mark.DEAD);

    if (game.lives <= 0) {
      game.status = Status.LOST;
      game.timerRunning = false;
    }

    return { ok: false, message: 'Incorrect! Life lost.' };
  }
}

/**
 * Toggle a player X mark on a cell.
 * - If no mark → add Mark.X
 * - If Mark.X → remove it
 * - If Mark.DEAD → no change (permanent)
 * - If queen present → no change
 */
export function toggleMark(game, row, col) {
  if (game.status !== Status.PLAYING) return;

  const key = cellKey(row, col);

  // Can't mark a cell with a queen
  if (game.queens.has(key)) return;

  const current = game.marks.get(key);

  if (current === Mark.DEAD) {
    // Permanent mark — cannot be removed
    return;
  }

  if (current === Mark.X) {
    game.marks.delete(key);
  } else {
    game.marks.set(key, Mark.X);
  }
}

/**
 * Check if all queens are correctly placed.
 */
export function checkWin(game) {
  return game.status === Status.WON;
}

/**
 * Check if the player has lost.
 */
export function checkLose(game) {
  return game.status === Status.LOST;
}

/**
 * Get the number of correctly placed queens.
 */
export function getQueenCount(game) {
  return game.queens.size;
}

/**
 * Pause the timer.
 */
export function pauseTimer(game) {
  game.timerRunning = false;
}

/**
 * Resume the timer.
 */
export function resumeTimer(game) {
  if (game.status === Status.PLAYING) {
    game.timerRunning = true;
  }
}

/**
 * Tick the timer (call this every second when timer is running).
 * Returns the updated timer value in seconds.
 */
export function tickTimer(game) {
  if (game.timerRunning && game.status === Status.PLAYING) {
    game.timerSeconds++;
  }
  return game.timerSeconds;
}

/**
 * Format timer seconds as MM:SS.
 */
export function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Start a new game. Resets everything.
 */
export function newGame(size, difficulty = 'hard', seed = null) {
  return createGame(size, difficulty, seed);
}

/**
 * Get the mark at a cell, or Mark.NONE if none.
 */
export function getMark(game, row, col) {
  const key = cellKey(row, col);
  return game.marks.get(key) || Mark.NONE;
}

/**
 * Check if a cell has a placed queen.
 */
export function hasQueen(game, row, col) {
  return game.queens.has(cellKey(row, col));
}

/**
 * Get the solution as an array of [row, col] pairs.
 */
export function getSolution(game) {
  return [...game.solution];
}

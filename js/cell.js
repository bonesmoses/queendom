/**
 * Cell coordinate utilities.
 * Positions are encoded as r * 100 + c (supports boards up to 99x99).
 */

export function cellKey(r, c) {
  return r * 100 + c;
}

export function cellPos(key) {
  const size = key >= 100 ? Math.floor(key / 100) : 0;
  // For keys < 100 (single-cell boards), floor division gives 0 — correct.
  return [Math.floor(key / 100), key % 100];
}

// Main — Entry point for Queendom. Wires game engine to renderer.

import { createGame, placeQueen, toggleMark, pauseTimer, resumeTimer, tickTimer, newGame, Status } from './engine.js';
import { Renderer, formatTimer } from './renderer.js';

let game;
let renderer;
let timerInterval = null;

function init() {
  const boardContainer = document.getElementById('board-container');
  const sizeSelect = document.getElementById('size-select');
  const difficultySelect = document.getElementById('difficulty-select');

  // Populate size selector
  for (let s = 6; s <= 12; s++) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = `${s}×${s}`;
    if (s === 8) opt.selected = true;
    sizeSelect.appendChild(opt);
  }

  // Populate difficulty selector
  for (const diff of ['easy', 'medium', 'hard']) {
    const opt = document.createElement('option');
    opt.value = diff;
    opt.textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
    if (diff === 'medium') opt.selected = true;
    difficultySelect.appendChild(opt);
  }

  // Button handlers
  document.getElementById('btn-new-game').addEventListener('click', startNewGame);
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-resume').addEventListener('click', resumeFromPause);

  sizeSelect.addEventListener('change', startNewGame);
  difficultySelect.addEventListener('change', startNewGame);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'n' || e.key === 'N') startNewGame();
  });

  startNewGame();
}

function startNewGame() {
  const sizeSelect = document.getElementById('size-select');
  const difficultySelect = document.getElementById('difficulty-select');
  const size = parseInt(sizeSelect.value);
  const difficulty = difficultySelect.value;

  // Stop old timer
  if (timerInterval) clearInterval(timerInterval);

  // Create new game
  game = createGame(size, difficulty);

  // Setup renderer
  const boardContainer = document.getElementById('board-container');
  renderer = new Renderer(game, boardContainer);

  // Set grid size CSS variable for solution reveal overlay
  const solutionReveal = document.getElementById('solution-reveal');
  solutionReveal.style.setProperty('--grid-size', size);
  solutionReveal.className = 'solution-reveal hidden';

  // Wire renderer callbacks
  renderer.onToggleMark = (row, col) => {
    toggleMark(game, row, col);
    updateLives();
  };
  renderer.onPlaceQueen = (row, col) => {
    const result = placeQueen(game, row, col);
    if (!result.ok && game.lives < 3) {
      // Animate lives shake on life loss
      const livesEl = document.getElementById('lives');
      livesEl.classList.add('shake');
      setTimeout(() => livesEl.classList.remove('shake'), 600);
    }
    updateLives();
  };
  renderer.onNewGame = startNewGame;

  // Hide all overlays
  hideAllOverlays();

  // Update UI
  updateLives();
  updateTimerDisplay();

  // Start timer
  game.timerRunning = true;
  timerInterval = setInterval(() => {
    tickTimer(game);
    updateTimerDisplay();
  }, 1000);

  renderer.render();
}

function togglePause() {
  if (game.status !== 'playing') return;

  if (game.timerRunning) {
    pauseTimer(game);
    document.getElementById('pause-overlay').className = 'overlay pause-overlay';
    document.getElementById('btn-pause').textContent = 'Resume';
  } else {
    resumeFromPause();
  }
}

function resumeFromPause() {
  if (game.status !== 'playing') return;

  resumeTimer(game);
  document.getElementById('pause-overlay').className = 'overlay hidden';
  document.getElementById('btn-pause').textContent = 'Pause';
  renderer.render(); // Re-render to remove pause obscuring
}

function hideAllOverlays() {
  document.getElementById('pause-overlay').className = 'overlay hidden';
  document.getElementById('game-over-overlay').className = 'overlay hidden';
  document.getElementById('solution-reveal').className = 'solution-reveal hidden';
  document.getElementById('btn-pause').textContent = 'Pause';
}

function updateLives() {
  const livesEl = document.getElementById('lives');
  livesEl.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const span = document.createElement('span');
    // Full heart or empty heart
    span.textContent = i < game.lives ? '❤️' : '🪵';
    livesEl.appendChild(span);
  }
}

function updateTimerDisplay() {
  document.getElementById('timer').textContent = formatTimer(game.timerSeconds);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

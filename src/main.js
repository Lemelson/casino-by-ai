// Точка входа: канвас низкого разрешения, целочисленный апскейл, игровой цикл.
import { Renderer } from './engine/gfx.js';
import { createInput } from './engine/input.js';
import { createAudio } from './engine/audio.js';
import { createEconomy } from './engine/economy.js';
import { createSceneManager } from './engine/scene.js';
import { createLobby } from './scenes/lobby.js';
import { createSlots } from './scenes/slots.js';
import { createBlackjack } from './scenes/blackjack.js';
import { createRoulette } from './scenes/roulette.js';
import { createPlinko } from './scenes/plinko.js';

const W = 320, H = 180;

const canvas = document.getElementById('screen');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const g = new Renderer(ctx, W, H);
const input = createInput(canvas, W, H);
const audio = createAudio();
const economy = createEconomy(1000);

const scenes = createSceneManager();
const game = { W, H, input, audio, economy, scenes };
scenes.register('lobby', createLobby(game));
scenes.register('slots', createSlots(game));
scenes.register('blackjack', createBlackjack(game));
scenes.register('roulette', createRoulette(game));
scenes.register('plinko', createPlinko(game));
scenes.go('lobby');

// разблокировка звука по первому жесту
function unlock() { audio.ensure(); audio.resume(); }
window.addEventListener('mousedown', unlock);
window.addEventListener('keydown', unlock);
window.addEventListener('touchstart', unlock);

// целочисленный масштаб под окно, чёткие пиксели
function resize() {
  const scale = Math.max(1, Math.min(Math.floor(window.innerWidth / W), Math.floor(window.innerHeight / H)));
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
}
window.addEventListener('resize', resize);
resize();

// Debug-хук: ручная прогонка кадров (полезно, когда вкладка в фоне и rAF спит).
window.__casino = {
  game, scenes,
  step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) { scenes.update(dt); scenes.render(g); input.lateUpdate(); } },
};

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // защита от больших скачков (вкладка ушла в фон)
  scenes.update(dt);
  scenes.render(g);
  input.lateUpdate();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

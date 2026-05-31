// СЛОТЫ: 3 барабана, честный взвешенный RNG, выплаты по центральной линии,
// сочные анимации (тормоз барабанов с easing, вспышка линии, монетопад).
import { C } from '../engine/palette.js';
import { drawText, drawTextCentered, textWidth, drawTextCenteredOutlined } from '../engine/font.js';
import { clamp, lerp, easeOutCubic, easeOutBack, randint, randRange } from '../engine/util.js';
import { drawSymbol } from './slots-art.js';

const SYMS = ['cherry', 'lemon', 'bell', 'bar', 'seven', 'diamond', 'wild'];
const WEIGHT = { cherry: 5, lemon: 5, bell: 4, bar: 3, seven: 2, diamond: 2, wild: 1 };
// Таблица откалибрована симуляцией: RTP ~96% (маржа казино ~4%).
// Множители применяются к ДОЛЕ линии = ставка / 5.
const PAY3 = { cherry: 3, lemon: 4, bell: 6, bar: 10, seven: 18, diamond: 26, wild: 88 };
const PAY2 = { cherry: 0, lemon: 0, bell: 1, bar: 2, seven: 3, diamond: 5 };
const BET_LEVELS = [5, 10, 25, 50, 100];
// 5 линий выплат: 3 горизонтали + 2 диагонали. Каждая запись — [row для reel0, reel1, reel2].
const LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
// строки таблицы выплат для отображения (3 в ряд, множитель на линию)
const PAYTABLE_ROWS = [['wild', 88], ['diamond', 26], ['seven', 18], ['bar', 10], ['bell', 6]];

// геометрия
const REELS = 3, ROWS = 3, CELL = 34, RW = 36, GAP = 3;
const TOTAL_W = REELS * RW + (REELS - 1) * GAP;       // 114
const START_X = Math.round((320 - TOTAL_W) / 2);       // 103
const REEL_TOP = 30;
const WINDOW_H = ROWS * CELL;                          // 102
const PAYLINE_Y = REEL_TOP + CELL + CELL / 2;          // центр строки 1

const CAB = { x: START_X - 9, y: REEL_TOP - 9, w: TOTAL_W + 18, h: WINDOW_H + 18 };

// кнопки (x, y, w, h)
const BACK = { x: 2, y: 3, w: 54, h: 14 };
const MUTE = { x: 300, y: 4, w: 16, h: 12 };
const BTN_MINUS = { x: 116, y: 156, w: 16, h: 16 };
const BTN_PLUS = { x: 172, y: 156, w: 16, h: 16 };
const BTN_SPIN = { x: 232, y: 150, w: 82, h: 26 };

function buildReel() {
  const strip = [];
  for (const s of SYMS) for (let i = 0; i < WEIGHT[s]; i++) strip.push(s);
  for (let i = strip.length - 1; i > 0; i--) { // Фишер–Йейтс
    const j = randint(i + 1);
    [strip[i], strip[j]] = [strip[j], strip[i]];
  }
  return { strip, N: strip.length, offset: randint(strip.length), state: 'idle', vel: 0, stopAt: 0, tween: null, result: null };
}

const symbolAt = (reel, row) => reel.strip[((Math.floor(reel.offset) + row) % reel.N + reel.N) % reel.N];

// маленькие треугольные маркеры линии выплат
function triRight(g, x, y, sz, col) { for (let dx = 0; dx <= sz; dx++) { const h = sz - dx; g.vline(x + dx, y - h, 2 * h + 1, col); } }
function triLeft(g, x, y, sz, col) { for (let dx = 0; dx <= sz; dx++) { const h = sz - dx; g.vline(x - dx, y - h, 2 * h + 1, col); } }

export function createSlots(game) {
  const { input, audio, economy } = game;

  let time = 0;
  let state = 'idle';            // 'idle' | 'spinning'
  let reels = [];
  let betIndex = 0;
  let lastWin = 0;
  let winTimer = 0;
  let winningCells = [];   // [{reel, row}]
  let winningLines = [];   // номера выигравших рядов
  let particles = [];
  let stoppedCount = 0;
  let denyFlash = 0;

  function reset() {
    reels = [buildReel(), buildReel(), buildReel()];
    state = 'idle'; lastWin = 0; winTimer = 0; winningCells = []; winningLines = []; particles = []; denyFlash = 0;
  }

  function trySpin() {
    const bet = BET_LEVELS[betIndex];
    if (!economy.canBet(bet)) { denyFlash = 0.5; audio.deny(); return; }
    economy.bet(bet);
    lastWin = 0; winningCells = []; winningLines = []; particles = []; winTimer = 0; stoppedCount = 0;
    state = 'spinning'; audio.spin();
    reels.forEach((r, i) => {
      r.state = 'spin';
      r.vel = 16 + i * 1.5;
      r.stopAt = time + 0.55 + i * 0.32;
      r.tween = null;
    });
  }

  // лучший выигрыш одной линии (wild подставляется, но нужен хотя бы 1 реальный символ)
  function evalLine(syms) {
    const wc = syms.filter((s) => s === 'wild').length;
    if (wc === 3) return { mult: PAY3.wild, sym: 'wild' };
    let best = 0, bestSym = null;
    for (const s of SYMS) {
      if (s === 'wild') continue;
      const real = syms.filter((x) => x === s).length;
      if (real === 0) continue;            // нельзя «собрать» символ, которого нет на линии
      const m = real + wc;
      if (m >= 3 && PAY3[s] > best) { best = PAY3[s]; bestSym = s; }
      else if (m === 2 && (PAY2[s] || 0) > best) { best = PAY2[s]; bestSym = s; }
    }
    return { mult: best, sym: bestSym };
  }

  function evaluate() {
    state = 'idle';
    const bet = BET_LEVELS[betIndex];
    const share = bet / LINES.length;       // ставка делится на 5 линий
    let total = 0;
    winningCells = [];
    winningLines = [];
    for (let k = 0; k < LINES.length; k++) {
      const def = LINES[k];
      const syms = def.map((row, reel) => symbolAt(reels[reel], row));
      const { mult, sym } = evalLine(syms);
      if (mult > 0) {
        total += mult * share;
        winningLines.push(k);
        for (let reel = 0; reel < REELS; reel++) {
          if (sym === 'wild' || syms[reel] === sym || syms[reel] === 'wild') winningCells.push({ reel, row: def[reel] });
        }
      }
    }
    total = Math.round(total);
    if (total > 0) {
      economy.add(total);
      lastWin = total; winTimer = 0;
      spawnCoins();
      audio.win(total >= bet * 8);
    } else { lastWin = 0; }
  }

  function spawnCoins() {
    let budget = 0;
    for (const { reel, row } of winningCells) {
      const cx = START_X + reel * (RW + GAP) + RW / 2;
      const cy = REEL_TOP + row * CELL + CELL / 2;
      for (let k = 0; k < 6 && budget < 60; k++, budget++) {
        particles.push({ x: cx + randRange(-6, 6), y: cy, vx: randRange(-55, 55), vy: randRange(-160, -60), life: randRange(0.8, 1.5) });
      }
    }
  }

  function updateReels(dt) {
    for (let i = 0; i < reels.length; i++) {
      const r = reels[i];
      if (r.state === 'spin') {
        r.offset += r.vel * dt;
        if (time >= r.stopAt) {
          const cur = r.offset;
          const targetInt = Math.ceil(cur + 2 + i) + randint(r.N);
          r.tween = { from: cur, to: targetInt, t: 0, dur: 0.55 + i * 0.07 };
          r.result = r.strip[((targetInt + 1) % r.N + r.N) % r.N];
          r.state = 'stop';
        }
      } else if (r.state === 'stop') {
        r.tween.t += dt;
        const k = clamp(r.tween.t / r.tween.dur, 0, 1);
        r.offset = lerp(r.tween.from, r.tween.to, easeOutCubic(k));
        if (k >= 1) {
          r.offset = r.tween.to; r.state = 'done';
          stoppedCount++; audio.reelStop();
          if (stoppedCount === reels.length) evaluate();
        }
      }
    }
  }

  // === жизненный цикл сцены ===
  return {
    enter() { reset(); time = 0; },

    update(dt) {
      time += dt;
      winTimer += dt;
      if (denyFlash > 0) denyFlash -= dt;

      // глобальные кнопки
      if (input.clicked(BACK.x, BACK.y, BACK.w, BACK.h) || input.wasPressed('Escape')) {
        audio.nav(); game.scenes.go('lobby'); return;
      }
      if (input.clicked(MUTE.x, MUTE.y, MUTE.w, MUTE.h) || input.wasPressed('KeyM')) audio.toggleMute();

      if (state === 'idle') {
        if (input.clicked(BTN_MINUS.x, BTN_MINUS.y, BTN_MINUS.w, BTN_MINUS.h)) {
          if (betIndex > 0) { betIndex--; audio.bet(); }
        }
        if (input.clicked(BTN_PLUS.x, BTN_PLUS.y, BTN_PLUS.w, BTN_PLUS.h)) {
          if (betIndex < BET_LEVELS.length - 1) { betIndex++; audio.bet(); }
        }
        if (input.clicked(BTN_SPIN.x, BTN_SPIN.y, BTN_SPIN.w, BTN_SPIN.h) || input.wasPressed('Space')) trySpin();
      }

      updateReels(dt);

      // монетки
      for (const p of particles) {
        p.vy += 320 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
      }
      particles = particles.filter((p) => p.life > 0 && p.y < 200);
    },

    render(g) {
      drawBackground(g);

      // заголовок
      drawTextCenteredOutlined(g, 'SLOTS', 160, 5, C.gold, C.redDk, { scale: 2 });

      // back (треугольник-стрелка + LOBBY)
      const backHover = input.inRect(BACK.x, BACK.y, BACK.w, BACK.h);
      const backCol = backHover ? C.white : C.silver;
      triLeft(g, BACK.x + 8, BACK.y + 7, 3, backCol);
      drawText(g, 'LOBBY', BACK.x + 11, BACK.y + 4, backCol);

      // mute
      drawMute(g);

      drawPaytable(g);
      drawHints(g);
      drawCabinet(g);
      drawReels(g);
      drawPaylines(g);
      drawWinCells(g);
      drawParticles(g);
      drawWinPopup(g);
      drawControls(g);
    },
  };

  // ---------- отрисовка ----------
  function drawBackground(g) {
    g.clear(C.bg0);
    g.rect(0, 0, 320, 26, C.bg1);
    g.rect(0, 142, 320, 38, C.bg1);
    // мягкое свечение за автоматом
    g.alpha(0.18);
    g.rect(CAB.x - 10, CAB.y - 6, CAB.w + 20, CAB.h + 12, C.purple);
    g.resetAlpha();
  }

  function drawCabinet(g) {
    g.rect(CAB.x, CAB.y, CAB.w, CAB.h, C.bg2);
    g.rectLine(CAB.x, CAB.y, CAB.w, CAB.h, C.gold, 2);
    g.rectLine(CAB.x + 2, CAB.y + 2, CAB.w - 4, CAB.h - 4, C.goldDk, 1);
    // лампы маркизы по верху
    const blink = Math.floor(time * 6);
    for (let bx = CAB.x + 6; bx < CAB.x + CAB.w - 4; bx += 9) {
      const on = ((bx + blink) & 1) === 0;
      g.circle(bx, CAB.y - 1, 1, on ? C.gold : C.red);
    }
    // тёмная подложка окна барабанов
    g.rect(START_X - 2, REEL_TOP - 2, TOTAL_W + 4, WINDOW_H + 4, C.void);
  }

  function drawReels(g) {
    for (let i = 0; i < REELS; i++) {
      const rx = START_X + i * (RW + GAP);
      g.rect(rx, REEL_TOP, RW, WINDOW_H, C.bg0);
      g.clip(rx, REEL_TOP, RW, WINDOW_H);
      const reel = reels[i];
      const frac = reel.offset - Math.floor(reel.offset);
      for (let row = 0; row <= ROWS; row++) {
        const sym = symbolAt(reel, row);
        const y = REEL_TOP + row * CELL - frac * CELL;
        drawSymbol(g, sym, rx + 2, Math.round(y) + 1, 2);
      }
      g.unclip();
      // разделители катушек
      g.rectLine(rx, REEL_TOP, RW, WINDOW_H, C.grayDk, 1);
    }
  }

  function drawPaylines(g) {
    // статичные маркеры трёх рядов по краям
    for (let row = 0; row < ROWS; row++) {
      const y = Math.round(REEL_TOP + row * CELL + CELL / 2);
      triRight(g, START_X - 7, y, 2, C.goldDk);
      triLeft(g, START_X + TOTAL_W + 6, y, 2, C.goldDk);
    }
    if (lastWin <= 0) return;
    // выигравшие линии — яркая ломаная по центрам ячеек (работает и для диагоналей)
    const col = Math.sin(time * 12) > 0 ? C.yellow : C.gold;
    for (const k of winningLines) {
      const pts = LINES[k].map((row, reel) => ({
        x: START_X + reel * (RW + GAP) + RW / 2,
        y: Math.round(REEL_TOP + row * CELL + CELL / 2),
      }));
      for (let i = 0; i < pts.length - 1; i++) g.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, col);
    }
  }

  function drawWinCells(g) {
    if (lastWin <= 0) return;
    if (Math.sin(time * 14) <= 0) return;
    for (const { reel, row } of winningCells) {
      const rx = START_X + reel * (RW + GAP);
      g.rectLine(rx, REEL_TOP + row * CELL, RW, CELL, C.yellow, 2);
    }
  }

  function drawParticles(g) {
    for (const p of particles) {
      g.circle(p.x, p.y, 2, C.gold);
      g.px(p.x - 1, p.y - 1, C.yellow);
    }
  }

  function drawWinPopup(g) {
    if (lastWin <= 0) return;
    const a = clamp(1 - (winTimer - 1.8) / 0.6, 0, 1);
    if (a <= 0) return;
    const pop = easeOutBack(clamp(winTimer / 0.4, 0, 1));
    const shown = Math.floor(lerp(0, lastWin, easeOutCubic(clamp(winTimer / 0.7, 0, 1))));
    const label = 'WIN ' + shown;
    const scale = Math.round(1 + pop); // 1..2
    const w = textWidth(label, { scale: 2 });
    g.alpha(a);
    g.rect(160 - w / 2 - 6, 64, w + 12, 20, C.shadow);
    g.rectLine(160 - w / 2 - 6, 64, w + 12, 20, C.gold, 1);
    drawTextCenteredOutlined(g, label, 160, 68, C.yellow, C.redDk, { scale: 2 });
    g.resetAlpha();
  }

  function button(g, b, label, opts = {}) {
    const hover = input.inRect(b.x, b.y, b.w, b.h);
    const enabled = opts.enabled !== false;
    let face = opts.primary ? C.gold : C.bg2;
    if (opts.primary && !enabled) face = C.goldDk;
    if (hover && enabled) face = opts.primary ? C.yellow : C.gray;
    g.rect(b.x, b.y, b.w, b.h, face);
    g.rectLine(b.x, b.y, b.w, b.h, opts.primary ? C.goldDk : C.gray, 1);
    const ts = opts.labelScale || 1;
    const col = opts.primary ? C.bg0 : (enabled ? C.white : C.gray);
    drawTextCentered(g, label, b.x + b.w / 2, b.y + (b.h - 7 * ts) / 2, col, { scale: ts });
  }

  function drawControls(g) {
    g.rect(0, 142, 320, 2, C.gold);

    // кредиты
    drawText(g, 'CREDITS', 6, 147, C.silver);
    drawText(g, String(economy.credits), 6, 157, denyFlash > 0 ? C.red : C.gold, { scale: 1 });

    // ставка
    drawTextCentered(g, 'BET', 152, 146, C.silver);
    button(g, BTN_MINUS, '-', { enabled: state === 'idle' && betIndex > 0 });
    button(g, BTN_PLUS, '+', { enabled: state === 'idle' && betIndex < BET_LEVELS.length - 1 });
    drawTextCentered(g, String(BET_LEVELS[betIndex]), 152, 160, C.white);

    // спин
    button(g, BTN_SPIN, state === 'spinning' ? '...' : 'SPIN', {
      primary: true, enabled: state === 'idle', labelScale: 2,
    });
  }

  // таблица выплат слева
  function drawPaytable(g) {
    drawText(g, 'PAYTABLE', 6, 30, C.gold);
    g.rect(6, 39, 48, 1, C.goldDk);
    for (let i = 0; i < PAYTABLE_ROWS.length; i++) {
      const [id, val] = PAYTABLE_ROWS[i];
      const y = 43 + i * 19;
      drawSymbol(g, id, 6, y, 1);
      drawText(g, 'x' + val, 26, y + 5, C.silver);
    }
  }

  // подсказки справа
  function drawHints(g) {
    const hx = 232;
    drawText(g, 'KEYS', hx, 30, C.gold);
    g.rect(hx, 39, 36, 1, C.goldDk);
    const lines = ['SPACE SPIN', 'ESC  LOBBY', 'M    MUTE'];
    for (let i = 0; i < lines.length; i++) drawText(g, lines[i], hx, 44 + i * 11, C.silver);
    drawSymbol(g, 'wild', hx, 86, 1);
    drawText(g, '= ANY', hx + 20, 91, C.green);
  }

  function drawMute(g) {
    const hover = input.inRect(MUTE.x, MUTE.y, MUTE.w, MUTE.h);
    const col = hover ? C.white : C.silver;
    g.rect(MUTE.x + 2, MUTE.y + 4, 3, 4, col);
    g.line(MUTE.x + 5, MUTE.y + 4, MUTE.x + 8, MUTE.y + 1, col);
    g.line(MUTE.x + 8, MUTE.y + 1, MUTE.x + 8, MUTE.y + 11, col);
    g.line(MUTE.x + 5, MUTE.y + 8, MUTE.x + 8, MUTE.y + 11, col);
    if (audio.muted) g.line(MUTE.x + 10, MUTE.y + 1, MUTE.x + 15, MUTE.y + 11, C.red);
    else { g.px(MUTE.x + 11, MUTE.y + 5, col); g.px(MUTE.x + 13, MUTE.y + 6, col); }
  }
}

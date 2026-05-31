// ЛОББИ: неоновая вывеска + выбор игр. Активны слоты; остальные — заглушки "SOON".
import { C } from '../engine/palette.js';
import { drawText, drawTextCentered, textWidth, drawTextCenteredOutlined } from '../engine/font.js';
import { clamp } from '../engine/util.js';

const GAMES = [
  { id: 'slots', name: 'SLOTS', active: true },
  { id: 'blackjack', name: 'BLACKJACK', active: true },
  { id: 'roulette', name: 'ROULETTE', active: true },
  { id: 'plinko', name: 'PLINKO', active: true },
];

const CARD_W = 66, CARD_H = 78, GAP = 8, START_X = 16, CARD_Y = 70;
const MUTE = { x: 300, y: 4, w: 16, h: 12 };
const FREE = { x: 110, y: 140, w: 100, h: 13 };

const cardRect = (i) => ({ x: START_X + i * (CARD_W + GAP), y: CARD_Y, w: CARD_W, h: CARD_H });

export function createLobby(game) {
  const { input, audio, economy } = game;

  // звёзды генерим один раз
  const stars = [];
  for (let i = 0; i < 46; i++) {
    stars.push({ x: Math.floor(Math.random() * 320), y: Math.floor(Math.random() * 64), p: Math.random() * 6.28 });
  }

  let time = 0;
  let sel = 0;
  let toast = 0;

  function activate(i) {
    const gme = GAMES[i];
    if (gme.active) { audio.nav(); game.scenes.go(gme.id); }
    else { audio.deny(); toast = 1.4; }
  }

  return {
    enter() { time = 0; },

    update(dt) {
      time += dt;
      if (toast > 0) toast -= dt;

      if (input.clicked(MUTE.x, MUTE.y, MUTE.w, MUTE.h) || input.wasPressed('KeyM')) audio.toggleMute();

      // навигация клавишами
      if (input.wasPressed('ArrowRight')) { sel = (sel + 1) % GAMES.length; audio.click(); }
      if (input.wasPressed('ArrowLeft')) { sel = (sel - 1 + GAMES.length) % GAMES.length; audio.click(); }
      if (input.wasPressed('Enter') || input.wasPressed('Space')) activate(sel);

      // мышь: ховер выделяет, клик активирует
      for (let i = 0; i < GAMES.length; i++) {
        const r = cardRect(i);
        if (input.inRect(r.x, r.y, r.w, r.h)) sel = i;
        if (input.clicked(r.x, r.y, r.w, r.h)) activate(i);
      }

      // бесплатные фишки при нуле
      if (economy.credits < 25 && input.clicked(FREE.x, FREE.y, FREE.w, FREE.h)) {
        economy.topUp(1000); audio.coin();
      }
    },

    render(g) {
      g.clear(C.bg0);
      g.rect(0, 0, 320, 64, C.bg1);
      for (const s of stars) {
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 2 + s.p));
        g.alpha(tw); g.px(s.x, s.y, C.white); g.resetAlpha();
      }

      // вывеска
      drawMarquee(g, time);
      drawTextCenteredOutlined(g, 'CASINO', 160, 12, C.gold, C.redDk, { scale: 3 });
      drawTextCentered(g, 'B Y   A I', 160, 38, C.magenta, { scale: 1 });
      g.rect(96, 50, 128, 1, C.purple);

      // кредиты
      const cr = 'CREDITS ' + economy.credits;
      drawText(g, cr, 314 - textWidth(cr), 6, C.gold);

      drawMute(g);

      // карточки игр
      for (let i = 0; i < GAMES.length; i++) drawCard(g, i, GAMES[i], i === sel, time, input);

      // подсказки / тосты
      if (economy.credits < 25) {
        const hover = input.inRect(FREE.x, FREE.y, FREE.w, FREE.h);
        g.rect(FREE.x, FREE.y, FREE.w, FREE.h, hover ? C.green : C.felt);
        g.rectLine(FREE.x, FREE.y, FREE.w, FREE.h, C.green, 1);
        drawTextCentered(g, 'GET 1000 CHIPS', FREE.x + FREE.w / 2, FREE.y + 3, C.white);
      }

      if (toast > 0) {
        g.alpha(clamp(toast, 0, 1));
        drawTextCentered(g, 'COMING SOON', 160, 158, C.yellow);
        g.resetAlpha();
      } else {
        drawTextCentered(g, 'ARROWS + ENTER  OR  CLICK A GAME', 160, 158, C.gray);
      }
      drawTextCentered(g, 'M  MUTE', 160, 170, C.grayDk);
    },
  };
}

function drawMarquee(g, time) {
  const blink = Math.floor(time * 5);
  for (let x = 84; x <= 236; x += 8) {
    const on = ((x / 8 + blink) & 1) === 0;
    g.circle(x, 4, 1, on ? C.gold : C.redDk);
    g.circle(x, 46, 1, on ? C.redDk : C.gold);
  }
}

function drawCard(g, i, gme, selected, time, input) {
  const r = cardRect(i);
  const cx = r.x + r.w / 2;
  const active = gme.active;
  const border = !active ? C.gray : selected ? C.yellow : C.gold;

  // лёгкое «дыхание» выбранной карточки
  const lift = selected ? Math.round(1 + Math.sin(time * 4)) : 0;
  const y = r.y - lift;

  g.rect(r.x, y, r.w, r.h, active ? C.bg2 : C.grayDk);
  g.rectLine(r.x, y, r.w, r.h, border, selected ? 2 : 1);
  if (selected && active) { g.alpha(0.2); g.rect(r.x, y, r.w, r.h, C.gold); g.resetAlpha(); }

  drawGameIcon(g, gme.id, cx, y + 30, active, time);

  drawTextCentered(g, gme.name, cx, y + r.h - 22, active ? C.white : C.gray);
  if (active) drawTextCentered(g, 'PLAY', cx, y + r.h - 11, selected ? C.yellow : C.green);
  else drawTextCentered(g, 'SOON', cx, y + r.h - 11, C.gray);
}

// мини-иконки игр (~28px), всё примитивами
function drawGameIcon(g, id, cx, cy, active, time) {
  const dim = !active;
  if (id === 'slots') {
    g.rect(cx - 13, cy - 12, 26, 24, C.gray);
    g.rect(cx - 13, cy - 12, 26, 3, C.goldDk);
    g.rectLine(cx - 13, cy - 12, 26, 24, C.goldDk, 1);
    g.rect(cx - 10, cy - 6, 20, 11, C.bg0);
    g.rect(cx - 8, cy - 3, 4, 4, C.red);
    drawTextCentered(g, '7', cx, cy - 4, C.gold);
    g.rect(cx + 4, cy - 3, 4, 4, C.cyan);
    g.rect(cx + 13, cy - 4, 2, 8, C.silver);
    g.circle(cx + 14, cy - 5, 2, C.red);
  } else if (id === 'blackjack') {
    g.rect(cx - 3, cy - 11, 15, 21, C.silver);
    g.rectLine(cx - 3, cy - 11, 15, 21, C.gray, 1);
    g.rect(cx - 11, cy - 8, 15, 21, C.white);
    g.rectLine(cx - 11, cy - 8, 15, 21, C.gray, 1);
    drawText(g, 'A', cx - 9, cy - 6, C.red);
    g.circle(cx - 4, cy + 3, 2, C.bg0);
    g.circle(cx - 1, cy + 3, 2, C.bg0);
    g.rect(cx - 4, cy, 3, 3, C.bg0);
    g.rect(cx - 3, cy + 5, 1, 2, C.bg0);
  } else if (id === 'roulette') {
    g.circle(cx, cy, 13, C.goldDk);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + time * 0.6;
      const px = cx + Math.cos(a) * 10, py = cy + Math.sin(a) * 10;
      const col = k === 0 ? C.green : (k % 2 ? C.red : C.bg0);
      g.circle(px, py, 2, col);
    }
    g.circle(cx, cy, 5, C.gold);
    g.circle(cx, cy, 2, C.goldDk);
    g.circle(cx, cy - 10, 1, C.white);
  } else if (id === 'plinko') {
    for (let row = 0; row < 4; row++)
      for (let c = 0; c <= row; c++)
        g.circle(cx + (c - row / 2) * 6, cy - 8 + row * 5, 1, C.silver);
    g.circle(cx, cy - 13, 2, C.magenta);
    for (let x = -12; x <= 12; x += 6) g.vline(cx + x, cy + 9, 4, C.gray);
    g.rect(cx - 6, cy + 9, 5, 4, C.felt);
    g.rect(cx + 1, cy + 9, 5, 4, C.purple);
  }
  if (dim) { g.alpha(0.45); g.rect(cx - 14, cy - 16, 28, 32, C.bg0); g.resetAlpha(); }
}

function drawMute(g) {
  // визуально идентично слотам — переиспользуем простую отрисовку
  const col = C.silver;
  g.rect(MUTE.x + 2, MUTE.y + 4, 3, 4, col);
  g.line(MUTE.x + 5, MUTE.y + 4, MUTE.x + 8, MUTE.y + 1, col);
  g.line(MUTE.x + 8, MUTE.y + 1, MUTE.x + 8, MUTE.y + 11, col);
  g.line(MUTE.x + 5, MUTE.y + 8, MUTE.x + 8, MUTE.y + 11, col);
}

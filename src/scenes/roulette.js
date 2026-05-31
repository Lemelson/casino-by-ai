// РУЛЕТКА (европейская, один зеро). Крутящееся колесо + шарик + интерактивный
// стол ставок: числа (35:1), красное/чёрное/чёт/нечет/1-18/19-36 (1:1), дюжины и колонки (2:1).
import { C } from '../engine/palette.js';
import { drawText, drawTextCentered, textWidth, drawTextCenteredOutlined } from '../engine/font.js';
import { clamp, lerp, easeOutCubic } from '../engine/util.js';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// порядок карманов европейского колеса
const EURO = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const CHIPS = [{ v: 5, c: C.red }, { v: 25, c: C.green }, { v: 100, c: C.bg0 }, { v: 500, c: C.purple }];

// геометрия стола
const CW = 17, CH = 12, Z0W = 16, COLW = 18;
const GX = Math.round((320 - (Z0W + 12 * CW + COLW)) / 2) + Z0W; // левый край сетки чисел
const Z0X = GX - Z0W;
const GY = 70;
const WHEEL = { x: 40, y: 42, r: 22 };

const BACK = { x: 2, y: 3, w: 54, h: 14 };
const MUTE = { x: 300, y: 4, w: 16, h: 12 };
const B_CLEAR = { x: 184, y: 154, w: 44, h: 16 };
const B_SPIN = { x: 234, y: 148, w: 80, h: 26 };

// предикаты внешних ставок
function betWins(key, n) {
  if (key[0] === 'n') return n === +key.slice(1);
  switch (key) {
    case 'red': return n !== 0 && RED.has(n);
    case 'black': return n !== 0 && !RED.has(n);
    case 'even': return n !== 0 && n % 2 === 0;
    case 'odd': return n % 2 === 1;
    case 'low': return n >= 1 && n <= 18;
    case 'high': return n >= 19 && n <= 36;
    case 'd1': return n >= 1 && n <= 12;
    case 'd2': return n >= 13 && n <= 24;
    case 'd3': return n >= 25 && n <= 36;
    case 'c1': return n !== 0 && n % 3 === 0;
    case 'c2': return n !== 0 && n % 3 === 2;
    case 'c3': return n !== 0 && n % 3 === 1;
    default: return false;
  }
}
const payMult = (key) => (key[0] === 'n' ? 35 : ['d1', 'd2', 'd3', 'c1', 'c2', 'c3'].includes(key) ? 2 : 1);

// собрать кликабельные ячейки стола
function buildCells() {
  const cells = [];
  cells.push({ key: 'n0', x: Z0X, y: GY, w: Z0W, h: 3 * CH, label: '0', color: 'green' });
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 12; col++) {
      const n = col * 3 + (3 - row);
      cells.push({ key: 'n' + n, x: GX + col * CW, y: GY + row * CH, w: CW, h: CH, label: '' + n, color: colorOf(n) });
    }
    cells.push({ key: 'c' + (row + 1), x: GX + 12 * CW, y: GY + row * CH, w: COLW, h: CH, label: '2:1' });
  }
  const DY = GY + 3 * CH;
  ['1ST 12', '2ND 12', '3RD 12'].forEach((t, i) => cells.push({ key: 'd' + (i + 1), x: GX + i * 4 * CW, y: DY, w: 4 * CW, h: CH, label: t }));
  const EY = DY + CH;
  [['low', '1-18'], ['even', 'EVEN'], ['red', '◆'], ['black', '◆'], ['odd', 'ODD'], ['high', '19-36']]
    .forEach(([key, t], i) => cells.push({ key, x: GX + i * 2 * CW, y: EY, w: 2 * CW, h: CH, label: t }));
  return cells;
}

export function createRoulette(game) {
  const { input, audio, economy } = game;
  const cells = buildCells();

  let time = 0;
  let state = 'betting';       // betting | spinning
  let bets = {};               // key -> сумма
  let sel = 1;                 // выбранная фишка (25)
  let winNum = -1;
  let spinT = 0;
  const SPIN_DUR = 3.2;
  let ballFinal = 0;
  let history = [];
  let lastWin = 0;
  let roundOver = false;
  let bannerTimer = 0;
  let denyFlash = 0;

  const totalBet = () => Object.values(bets).reduce((a, b) => a + b, 0);

  function place(key) {
    const amt = CHIPS[sel].v;
    if (totalBet() + amt > economy.credits) { denyFlash = 0.4; audio.deny(); return; }
    bets[key] = (bets[key] || 0) + amt; audio.bet();
  }

  function spin() {
    const tb = totalBet();
    if (tb <= 0 || !economy.canBet(tb)) { denyFlash = 0.5; audio.deny(); return; }
    economy.bet(tb);
    winNum = (Math.random() * 37) | 0;
    const idx = EURO.indexOf(winNum);
    ballFinal = (idx + 0.5) / 37 * Math.PI * 2 - Math.PI / 2; // карман у верхнего маркера
    state = 'spinning'; spinT = 0; roundOver = false; lastWin = 0; audio.spin();
  }

  function resolve() {
    let win = 0;
    for (const key in bets) if (betWins(key, winNum)) win += bets[key] * (payMult(key) + 1);
    if (win > 0) { economy.add(win); audio.win(win >= totalBet() * 5); } else audio.deny();
    lastWin = win; roundOver = true; bannerTimer = 0; state = 'betting';
    history.unshift(winNum); if (history.length > 8) history.pop();
  }

  return {
    enter() { time = 0; state = 'betting'; },

    update(dt) {
      time += dt; bannerTimer += dt;
      if (denyFlash > 0) denyFlash -= dt;

      if (input.clicked(BACK.x, BACK.y, BACK.w, BACK.h) || input.wasPressed('Escape')) { audio.nav(); game.scenes.go('lobby'); return; }
      if (input.clicked(MUTE.x, MUTE.y, MUTE.w, MUTE.h) || input.wasPressed('KeyM')) audio.toggleMute();

      if (state === 'spinning') {
        spinT += dt;
        if (spinT >= SPIN_DUR) resolve();
        return;
      }

      // выбор фишки
      for (let i = 0; i < CHIPS.length; i++) {
        const cx = 22 + i * 28;
        if (input.clicked(cx - 10, 150, 20, 20)) { sel = i; audio.click(); }
      }
      if (input.clicked(B_CLEAR.x, B_CLEAR.y, B_CLEAR.w, B_CLEAR.h)) { bets = {}; audio.click(); }
      if (input.clicked(B_SPIN.x, B_SPIN.y, B_SPIN.w, B_SPIN.h) || input.wasPressed('Space')) { spin(); return; }
      // ставки на ячейки
      if (input.pressed) for (const c of cells) if (input.inRect(c.x, c.y, c.w, c.h)) { place(c.key); break; }
    },

    render(g) {
      g.clear(C.felt);
      g.rect(0, 0, 320, 16, C.bg1);
      g.rect(0, 144, 320, 36, C.bg1);
      g.rect(0, 16, 320, 1, C.gold);
      g.rect(0, 143, 320, 1, C.gold);

      drawTextCenteredOutlined(g, 'ROULETTE', 150, 4, C.gold, C.redDk, { scale: 1 });
      const backHover = input.inRect(BACK.x, BACK.y, BACK.w, BACK.h);
      triLeft(g, BACK.x + 8, BACK.y + 7, 3, backHover ? C.white : C.silver);
      drawText(g, 'LOBBY', BACK.x + 11, BACK.y + 4, backHover ? C.white : C.silver);
      const cr = 'CREDITS ' + economy.credits;
      drawText(g, cr, 296 - textWidth(cr), 5, denyFlash > 0 ? C.red : C.gold);
      drawMute(g, audio.muted);

      drawWheel(g);
      drawHistory(g);
      drawTable(g);
      drawBanner(g);
      drawControls(g);
    },
  };

  // ---------- отрисовка ----------
  function drawWheel(g) {
    const { x: cx, y: cy, r } = WHEEL;
    const inner = 9;
    // кольцо карманов
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r || d < inner) continue;
        let a = Math.atan2(dy, dx) + Math.PI / 2;
        a = a / (Math.PI * 2); a -= Math.floor(a);
        const n = EURO[Math.floor(a * 37) % 37];
        g.px(cx + dx, cy + dy, n === 0 ? C.green : RED.has(n) ? C.red : C.bg0);
      }
    }
    g.ring(cx, cy, r, C.gold, 1);
    g.circle(cx, cy, inner, C.goldDk);
    // маркер сверху
    g.rect(cx, cy - r - 3, 1, 3, C.white);

    // шарик
    let ballA;
    const spinning = state === 'spinning';
    if (spinning) {
      const e = easeOutCubic(clamp(spinT / SPIN_DUR, 0, 1));
      ballA = ballFinal + (1 - e) * 7 * Math.PI * 2;
    } else if (winNum >= 0) {
      ballA = ballFinal;
    }
    if (ballA != null) {
      const bx = cx + Math.cos(ballA) * (r - 3), by = cy + Math.sin(ballA) * (r - 3);
      g.circle(bx, by, 2, C.white);
    }

    // результат в центре
    if (!spinning && winNum >= 0) {
      const col = winNum === 0 ? C.green : RED.has(winNum) ? C.redLt : C.silver;
      drawTextCentered(g, '' + winNum, cx, cy - 3, col);
    }
  }

  function drawHistory(g) {
    drawText(g, 'LAST', 72, 22, C.silver);
    for (let i = 0; i < history.length; i++) {
      const n = history[i];
      const x = 72 + i * 18, y = 32;
      g.rect(x, y, 16, 14, n === 0 ? C.green : RED.has(n) ? C.red : C.bg0);
      g.rectLine(x, y, 16, 14, C.goldDk, 1);
      drawTextCentered(g, '' + n, x + 8, y + 4, C.white);
    }
    // текущая сумма ставок
    drawText(g, 'ON TABLE: ' + totalBet(), 72, 52, C.gold);
  }

  function drawTable(g) {
    for (const c of cells) {
      // фон ячейки
      let bg = C.felt;
      if (c.color === 'red') bg = C.red;
      else if (c.color === 'black') bg = C.bg0;
      else if (c.color === 'green') bg = C.green;
      g.rect(c.x, c.y, c.w, c.h, bg);
      g.rectLine(c.x, c.y, c.w, c.h, C.feltLt, 1);
      // подсветка выигрышного числа
      if (roundOver && c.key === 'n' + winNum) g.rectLine(c.x, c.y, c.w, c.h, Math.sin(time * 12) > 0 ? C.yellow : C.gold, 1);
      // ховер
      if (state === 'betting' && input.inRect(c.x, c.y, c.w, c.h)) { g.alpha(0.18); g.rect(c.x, c.y, c.w, c.h, C.white); g.resetAlpha(); }

      // подпись
      if (c.key === 'red') drawDiamond(g, c.x + c.w / 2, c.y + c.h / 2, C.red);
      else if (c.key === 'black') drawDiamond(g, c.x + c.w / 2, c.y + c.h / 2, C.bg0);
      else drawTextCentered(g, c.label, c.x + c.w / 2, c.y + (c.h - 7) / 2, c.color ? C.white : C.silver);

      // фишка ставки
      if (bets[c.key]) {
        const ccx = c.x + c.w - 7, ccy = c.y + c.h - 6;
        g.circle(ccx, ccy, 5, C.gold);
        g.ring(ccx, ccy, 5, C.bg0, 1);
        drawTextCentered(g, '' + bets[c.key], ccx, ccy - 3, C.bg0);
      }
    }
  }

  function drawBanner(g) {
    if (!roundOver || lastWin <= 0) return;
    const a = clamp(1 - (bannerTimer - 3.0) / 0.8, 0, 1);
    if (a <= 0) return;
    const txt = 'WIN  +' + lastWin;
    g.alpha(a);
    const w = textWidth(txt, { scale: 2 });
    g.rect(160 - w / 2 - 6, 86, w + 12, 18, C.shadow);
    g.rectLine(160 - w / 2 - 6, 86, w + 12, 18, C.gold, 1);
    drawTextCenteredOutlined(g, txt, 160, 89, C.yellow, C.redDk, { scale: 2 });
    g.resetAlpha();
  }

  function drawControls(g) {
    for (let i = 0; i < CHIPS.length; i++) {
      const cx = 22 + i * 28;
      drawChip(g, cx, 160, CHIPS[i], i === sel);
    }
    drawText(g, 'BET', 132, 150, C.silver);
    drawText(g, '' + totalBet(), 132, 160, denyFlash > 0 ? C.red : C.gold);
    button(g, B_CLEAR, 'CLEAR', { enabled: totalBet() > 0 && state === 'betting' });
    button(g, B_SPIN, state === 'spinning' ? '...' : 'SPIN', { primary: true, enabled: state === 'betting' && totalBet() > 0 });
  }

  function drawChip(g, cx, cy, chip, seld) {
    g.circle(cx, cy, 9, chip.c);
    g.ring(cx, cy, 9, seld ? C.yellow : C.silver, 1);
    g.ring(cx, cy, 5, seld ? C.yellow : C.silver, 1);
    const tc = chip.c === C.bg0 || chip.c === C.purple ? C.white : C.bg0;
    drawTextCentered(g, '' + chip.v, cx, cy - 3, tc);
    if (seld) g.ring(cx, cy, 11, C.yellow, 1);
  }

  function button(g, b, label, opts = {}) {
    const hover = input.inRect(b.x, b.y, b.w, b.h);
    const enabled = opts.enabled !== false;
    let face = opts.primary ? C.gold : C.bg2;
    if (opts.primary && !enabled) face = C.goldDk;
    if (!opts.primary && !enabled) face = C.grayDk;
    if (hover && enabled) face = opts.primary ? C.yellow : C.gray;
    g.rect(b.x, b.y, b.w, b.h, face);
    g.rectLine(b.x, b.y, b.w, b.h, opts.primary ? C.goldDk : C.gray, 1);
    const col = opts.primary ? C.bg0 : (enabled ? C.white : C.gray);
    drawTextCentered(g, label, b.x + b.w / 2, b.y + (b.h - 7) / 2, col);
  }

  function drawDiamond(g, cx, cy, col) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let dy = -3; dy <= 3; dy++) { const w = 3 - Math.abs(dy); g.rect(cx - w, cy + dy, 2 * w + 1, 1, col); }
  }

  function drawMute(g, muted) {
    const col = input.inRect(MUTE.x, MUTE.y, MUTE.w, MUTE.h) ? C.white : C.silver;
    g.rect(MUTE.x + 2, MUTE.y + 4, 3, 4, col);
    g.line(MUTE.x + 5, MUTE.y + 4, MUTE.x + 8, MUTE.y + 1, col);
    g.line(MUTE.x + 8, MUTE.y + 1, MUTE.x + 8, MUTE.y + 11, col);
    g.line(MUTE.x + 5, MUTE.y + 8, MUTE.x + 8, MUTE.y + 11, col);
    if (muted) g.line(MUTE.x + 10, MUTE.y + 1, MUTE.x + 15, MUTE.y + 11, C.red);
  }

  function triLeft(g, x, y, sz, col) { for (let dx = 0; dx <= sz; dx++) { const hh = sz - dx; g.vline(x - dx, y - hh, 2 * hh + 1, col); } }
}

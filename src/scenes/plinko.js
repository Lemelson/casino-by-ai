// ПЛИНКО: 8 рядов пегов, шарик падает (50/50 на каждом ряду — честный биномиал),
// ловит множитель в корзине. Множители откалиброваны: RTP 96.56%.
import { C } from '../engine/palette.js';
import { drawText, drawTextCentered, textWidth, drawTextCenteredOutlined } from '../engine/font.js';
import { clamp, lerp } from '../engine/util.js';

const ROWS = 8, BINS = 9;
const CX = 160, PGAP = 22, RGAP = 11, TOP = 28;
const SLOT_Y = TOP + ROWS * RGAP;            // верх корзин
const BIN_W = PGAP, BIN_X0 = CX - 4 * PGAP - PGAP / 2;
const MULT = [10, 3, 1.5, 0.6, 0.4, 0.6, 1.5, 3, 10];
const BET_LEVELS = [5, 10, 25, 50, 100];
const FALL_DUR = 1.3;

const BACK = { x: 2, y: 3, w: 54, h: 14 };
const MUTE = { x: 300, y: 4, w: 16, h: 12 };
const B_MINUS = { x: 10, y: 152, w: 16, h: 16 };
const B_PLUS = { x: 66, y: 152, w: 16, h: 16 };
const B_DROP = { x: 232, y: 150, w: 82, h: 26 };

const binColor = (m) => (m >= 10 ? C.gold : m >= 3 ? C.orange : m >= 1 ? C.green : m >= 0.6 ? C.cyan : C.grayDk);

export function createPlinko(game) {
  const { input, audio, economy } = game;

  let time = 0;
  let betIndex = 2;
  let balls = [];
  let binFlash = new Array(BINS).fill(0);
  let lastWin = 0, winTimer = 99;
  let denyFlash = 0;

  function drop() {
    const bet = BET_LEVELS[betIndex];
    if (!economy.canBet(bet)) { denyFlash = 0.5; audio.deny(); return; }
    economy.bet(bet);
    const dirs = [];
    let sum = 0;
    for (let r = 0; r < ROWS; r++) { const d = Math.random() < 0.5 ? -1 : 1; dirs.push(d); sum += d; }
    const prefix = [0];
    for (let r = 0; r < ROWS; r++) prefix.push(prefix[r] + dirs[r]);
    const bin = 4 + sum / 2;
    balls.push({ dirs, prefix, bin, bet, t: 0, trail: [] });
    audio.spin();
  }

  function land(b) {
    const m = MULT[b.bin];
    const win = Math.round(b.bet * m);
    if (win > 0) economy.add(win);
    binFlash[b.bin] = 0.6;
    lastWin = win - b.bet; winTimer = 0; // показываем чистый результат
    if (m >= 3) audio.win(m >= 10); else if (win >= b.bet) audio.coin(); else audio.reelStop();
  }

  function ballPos(b) {
    const p = clamp(b.t / FALL_DUR, 0, 1);
    const rf = p * ROWS;
    const r = Math.min(ROWS - 1, Math.floor(rf));
    const frac = rf - Math.floor(rf);
    const offBefore = prefixOffset(b, Math.floor(rf));
    const offAfter = prefixOffset(b, Math.floor(rf) + 1);
    const off = lerp(offBefore, offAfter, frac);
    const x = CX + off * PGAP;
    const y = lerp(TOP - 8, SLOT_Y - 4, p) - Math.abs(Math.sin(p * ROWS * Math.PI)) * 2;
    return { x, y, p };
  }
  function prefixOffset(b, rowsDone) {
    const r = clamp(rowsDone, 0, ROWS);
    return 0.5 * b.prefix[r];
  }

  return {
    enter() { time = 0; balls = []; },

    update(dt) {
      time += dt;
      winTimer += dt;
      if (denyFlash > 0) denyFlash -= dt;
      for (let i = 0; i < BINS; i++) if (binFlash[i] > 0) binFlash[i] -= dt;

      if (input.clicked(BACK.x, BACK.y, BACK.w, BACK.h) || input.wasPressed('Escape')) { audio.nav(); game.scenes.go('lobby'); return; }
      if (input.clicked(MUTE.x, MUTE.y, MUTE.w, MUTE.h) || input.wasPressed('KeyM')) audio.toggleMute();
      if (input.clicked(B_MINUS.x, B_MINUS.y, B_MINUS.w, B_MINUS.h)) { if (betIndex > 0) { betIndex--; audio.bet(); } }
      if (input.clicked(B_PLUS.x, B_PLUS.y, B_PLUS.w, B_PLUS.h)) { if (betIndex < BET_LEVELS.length - 1) { betIndex++; audio.bet(); } }
      if (input.clicked(B_DROP.x, B_DROP.y, B_DROP.w, B_DROP.h) || input.wasPressed('Space')) drop();

      for (const b of balls) {
        b.t += dt;
        const pos = ballPos(b);
        b.trail.push({ x: pos.x, y: pos.y });
        if (b.trail.length > 6) b.trail.shift();
        if (b.t >= FALL_DUR && !b.done) { b.done = true; land(b); }
      }
      balls = balls.filter((b) => b.t < FALL_DUR + 0.3);
    },

    render(g) {
      g.clear(C.bg0);
      g.rect(0, 0, 320, 16, C.bg1);
      g.rect(0, 140, 320, 40, C.bg1);
      g.rect(0, 16, 320, 1, C.gold);
      g.rect(0, 139, 320, 1, C.gold);

      drawTextCenteredOutlined(g, 'PLINKO', 160, 4, C.gold, C.redDk, { scale: 1 });
      const backHover = input.inRect(BACK.x, BACK.y, BACK.w, BACK.h);
      triLeft(g, BACK.x + 8, BACK.y + 7, 3, backHover ? C.white : C.silver);
      drawText(g, 'LOBBY', BACK.x + 11, BACK.y + 4, backHover ? C.white : C.silver);
      const cr = 'CREDITS ' + economy.credits;
      drawText(g, cr, 296 - textWidth(cr), 5, denyFlash > 0 ? C.red : C.gold);
      drawMute(g, audio.muted);

      // пеги
      for (let r = 0; r < ROWS; r++) {
        for (let i = 0; i <= r; i++) {
          const x = CX + (i - r / 2) * PGAP;
          const y = TOP + r * RGAP;
          g.circle(x, y, 1, C.silver);
        }
      }

      // корзины
      for (let b = 0; b < BINS; b++) {
        const x = BIN_X0 + b * BIN_W;
        const col = binColor(MULT[b]);
        const flash = binFlash[b] > 0;
        g.rect(x + 1, SLOT_Y, BIN_W - 2, 22, flash ? C.yellow : col);
        g.rectLine(x + 1, SLOT_Y, BIN_W - 2, 22, C.bg0, 1);
        const label = (MULT[b] % 1 === 0 ? '' + MULT[b] : '' + MULT[b]);
        const tc = (MULT[b] >= 0.6 && MULT[b] < 1) || MULT[b] >= 10 ? C.bg0 : C.white;
        drawTextCentered(g, label, x + BIN_W / 2, SLOT_Y + 3, flash ? C.bg0 : tc);
        drawTextCentered(g, 'x', x + BIN_W / 2, SLOT_Y + 12, flash ? C.bg0 : tc);
      }

      // шарики + трейл
      for (const b of balls) {
        for (let i = 0; i < b.trail.length; i++) {
          g.alpha(0.12 + 0.1 * i);
          g.circle(b.trail[i].x, b.trail[i].y, 1, C.magenta);
        }
        g.resetAlpha();
        const pos = ballPos(b);
        g.circle(pos.x, pos.y, 2, C.magenta);
        g.px(pos.x - 1, pos.y - 1, C.white);
      }

      // результат последнего шарика
      if (winTimer < 2.2) {
        const a = clamp(1 - (winTimer - 1.6) / 0.6, 0, 1);
        g.alpha(a);
        const txt = lastWin > 0 ? '+' + lastWin : '' + lastWin;
        drawTextCenteredOutlined(g, txt, 160, 124, lastWin > 0 ? C.yellow : C.silver, C.redDk, { scale: 2 });
        g.resetAlpha();
      }

      drawControls(g);
    },
  };

  function drawControls(g) {
    drawText(g, 'BET', 30, 143, C.silver);
    button(g, B_MINUS, '-', { enabled: betIndex > 0 });
    button(g, B_PLUS, '+', { enabled: betIndex < BET_LEVELS.length - 1 });
    drawTextCentered(g, '' + BET_LEVELS[betIndex], 46, 156, denyFlash > 0 ? C.red : C.gold);
    button(g, B_DROP, 'DROP', { primary: true, enabled: economy.canBet(BET_LEVELS[betIndex]) });
    drawTextCentered(g, 'SPACE OR CLICK = DROP', 200, 143, C.gray);
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

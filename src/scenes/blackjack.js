// БЛЭКДЖЕК: шуз 4 колоды, раздача с анимацией, hit/stand/double/split,
// дилер добирает до 17 (стоит на мягкой 17), выплаты 3:2, корректная логика.
import { C } from '../engine/palette.js';
import { drawText, drawTextCentered, textWidth, drawTextCenteredOutlined } from '../engine/font.js';
import { clamp, lerp, easeOutCubic, easeOutBack } from '../engine/util.js';
import { drawCard, CARD_W, CARD_H } from './cards-art.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const CHIPS = [{ v: 5, c: C.red }, { v: 25, c: C.green }, { v: 100, c: C.bg0 }, { v: 500, c: C.purple }];

// геометрия
const DEALER_Y = 24;
const PLAYER_Y = 84;
const SHOE = { x: 290, y: 18 };
const DEAL_T = 0.22, STAGGER = 0.16;

const BACK = { x: 2, y: 3, w: 54, h: 14 };
const MUTE = { x: 300, y: 4, w: 16, h: 12 };
// кнопки действий игрока
const B_HIT = { x: 8, y: 152, w: 72, h: 24 };
const B_STAND = { x: 84, y: 152, w: 72, h: 24 };
const B_DOUBLE = { x: 160, y: 152, w: 72, h: 24 };
const B_SPLIT = { x: 236, y: 152, w: 72, h: 24 };
// кнопки ставки
const B_CLEAR = { x: 188, y: 155, w: 42, h: 16 };
const B_DEAL = { x: 236, y: 150, w: 78, h: 26 };

const rankValue = (r) => (r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(r) ? 10 : parseInt(r, 10));

function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += rankValue(c.rank); if (c.rank === 'A') aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export function createBlackjack(game) {
  const { input, audio, economy } = game;

  let time = 0;
  let state = 'betting';        // betting | dealing | player | dealer
  let shoe = [];
  let hands = [];               // [{cards, bet, done, busted, result, doubled, blackjack, splitAces}]
  let dealer = [];
  let holeDown = true;
  let active = 0;
  let bet = 25;
  let dealEndsAt = 0;
  let dealerTimer = 0;
  let roundOver = false;
  let lastWin = 0;
  let bannerTimer = 0;
  let denyFlash = 0;

  function newShoe() {
    shoe = [];
    for (let d = 0; d < 4; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ rank: r, suit: s });
    for (let i = shoe.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
  }
  function draw(target, faceDown, delay) {
    if (shoe.length < 20) newShoe();
    const c = shoe.pop();
    c.bornAt = time; c.delay = delay; c.faceDown = !!faceDown;
    target.push(c);
    return c;
  }
  function revealHole() { holeDown = false; if (dealer[1]) dealer[1].faceDown = false; }

  function startRound() {
    if (!economy.canBet(bet) || bet <= 0) { denyFlash = 0.5; audio.deny(); return; }
    economy.bet(bet);
    if (shoe.length < 20) newShoe();
    hands = [{ cards: [], bet, done: false, busted: false, result: null, doubled: false, blackjack: false, splitAces: false }];
    dealer = []; holeDown = true; active = 0; roundOver = false; lastWin = 0;
    state = 'dealing';
    draw(hands[0].cards, false, 0);
    draw(dealer, false, STAGGER);
    draw(hands[0].cards, false, STAGGER * 2);
    draw(dealer, true, STAGGER * 3);
    dealEndsAt = time + STAGGER * 3 + DEAL_T + 0.05;
    audio.nav();
  }

  function afterDeal() {
    hands[0].blackjack = handValue(hands[0].cards).total === 21;
    const dealerBJ = handValue(dealer).total === 21;
    if (hands[0].blackjack || dealerBJ) { revealHole(); settle(); }
    else state = 'player';
  }

  function curHand() { return hands[active]; }

  function advance() {
    while (active < hands.length && hands[active].done) active++;
    if (active >= hands.length) {
      // если все руки сгорели — дилер не добирает
      if (hands.every((h) => h.busted)) { revealHole(); settle(); }
      else { revealHole(); state = 'dealer'; dealerTimer = 0; audio.reelStop(); }
    }
  }

  function hit() {
    const h = curHand();
    draw(h.cards, false, 0); audio.bet();
    if (handValue(h.cards).total > 21) { h.busted = true; h.done = true; audio.deny(); advance(); }
  }
  function stand() { curHand().done = true; audio.click(); advance(); }
  function double() {
    const h = curHand();
    if (!(state === 'player' && h.cards.length === 2 && economy.canBet(h.bet) && !h.splitAces)) return;
    economy.bet(h.bet); h.bet *= 2; h.doubled = true;
    draw(h.cards, false, 0); audio.bet();
    if (handValue(h.cards).total > 21) h.busted = true;
    h.done = true; advance();
  }
  function canSplit() {
    const h = hands[active];
    return state === 'player' && hands.length === 1 && h.cards.length === 2 &&
      rankValue(h.cards[0].rank) === rankValue(h.cards[1].rank) && economy.canBet(h.bet);
  }
  function split() {
    if (!canSplit()) return;
    const h = hands[active];
    economy.bet(h.bet); audio.coin();
    const moved = h.cards.pop();
    const aces = h.cards[0].rank === 'A';
    const nh = { cards: [moved], bet: h.bet, done: false, busted: false, result: null, doubled: false, blackjack: false, splitAces: aces };
    h.splitAces = aces;
    hands.push(nh);
    // по одной карте каждой руке
    draw(h.cards, false, 0);
    draw(nh.cards, false, STAGGER);
    if (aces) { h.done = true; nh.done = true; advance(); } // сплит тузов — по одной карте и стоп
  }

  function settle() {
    const dv = handValue(dealer);
    const dealerBJ = dealer.length === 2 && dv.total === 21;
    const dbust = dv.total > 21;
    let win = 0;
    for (const h of hands) {
      const hv = handValue(h.cards).total;
      if (h.busted) { h.result = 'BUST'; continue; }
      if (h.blackjack) {
        if (dealerBJ) { h.result = 'PUSH'; win += h.bet; }
        else { h.result = 'BJ'; win += Math.round(h.bet * 2.5); }
        continue;
      }
      if (dealerBJ) { h.result = 'LOSE'; continue; }
      if (dbust || hv > dv.total) { h.result = 'WIN'; win += h.bet * 2; }
      else if (hv < dv.total) { h.result = 'LOSE'; }
      else { h.result = 'PUSH'; win += h.bet; }
    }
    if (win > 0) economy.add(win);
    lastWin = win; bannerTimer = 0; roundOver = true; state = 'betting';
    const anyWin = hands.some((h) => h.result === 'WIN' || h.result === 'BJ');
    if (anyWin) audio.win(hands.some((h) => h.result === 'BJ'));
    else audio.deny();
  }

  // ---- жизненный цикл ----
  return {
    enter() { time = 0; state = 'betting'; hands = []; dealer = []; roundOver = false; lastWin = 0; if (!shoe.length) newShoe(); },

    update(dt) {
      time += dt; bannerTimer += dt;
      if (denyFlash > 0) denyFlash -= dt;

      if (input.clicked(BACK.x, BACK.y, BACK.w, BACK.h) || input.wasPressed('Escape')) { audio.nav(); game.scenes.go('lobby'); return; }
      if (input.clicked(MUTE.x, MUTE.y, MUTE.w, MUTE.h) || input.wasPressed('KeyM')) audio.toggleMute();

      if (state === 'betting') {
        // выбор фишек
        for (let i = 0; i < CHIPS.length; i++) {
          const cx = 26 + i * 30;
          if (input.clicked(cx - 11, 150, 22, 22)) {
            if (economy.canBet(bet + CHIPS[i].v)) { bet += CHIPS[i].v; audio.bet(); }
            else { denyFlash = 0.4; audio.deny(); }
          }
        }
        if (input.clicked(B_CLEAR.x, B_CLEAR.y, B_CLEAR.w, B_CLEAR.h)) { bet = 0; audio.click(); }
        if (input.clicked(B_DEAL.x, B_DEAL.y, B_DEAL.w, B_DEAL.h) || input.wasPressed('Space') || input.wasPressed('Enter')) startRound();
      } else if (state === 'dealing') {
        if (time >= dealEndsAt) afterDeal();
      } else if (state === 'player') {
        if (input.clicked(B_HIT.x, B_HIT.y, B_HIT.w, B_HIT.h) || input.wasPressed('KeyH')) hit();
        else if (input.clicked(B_STAND.x, B_STAND.y, B_STAND.w, B_STAND.h) || input.wasPressed('KeyS')) stand();
        else if (input.clicked(B_DOUBLE.x, B_DOUBLE.y, B_DOUBLE.w, B_DOUBLE.h) || input.wasPressed('KeyD')) double();
        else if (input.clicked(B_SPLIT.x, B_SPLIT.y, B_SPLIT.w, B_SPLIT.h) || input.wasPressed('KeyP')) split();
      } else if (state === 'dealer') {
        dealerTimer += dt;
        if (dealerTimer >= 0.45) {
          dealerTimer = 0;
          if (handValue(dealer).total < 17) draw(dealer, false, 0);
          else settle();
        }
      }
    },

    render(g) {
      drawTable(g);
      drawTextCenteredOutlined(g, 'BLACKJACK', 160, 4, C.gold, C.redDk, { scale: 1 });
      const backHover = input.inRect(BACK.x, BACK.y, BACK.w, BACK.h);
      triLeft(g, BACK.x + 8, BACK.y + 7, 3, backHover ? C.white : C.silver);
      drawText(g, 'LOBBY', BACK.x + 11, BACK.y + 4, backHover ? C.white : C.silver);
      const cr = 'CREDITS ' + economy.credits;
      drawText(g, cr, 296 - textWidth(cr), 5, denyFlash > 0 ? C.red : C.gold);
      drawMute(g, audio.muted);

      // ДИЛЕР
      drawText(g, 'DEALER', 8, 18, C.silver);
      drawHand(g, dealer, 160, DEALER_Y, dealer.length > 4 ? 16 : 22);
      if (dealer.length) drawTotalBadge(g, 160, DEALER_Y + CARD_H + 2, holeDown ? null : handValue(dealer));

      // ИГРОК (одна или две руки)
      if (hands.length === 1) {
        drawHand(g, hands[0].cards, 160, PLAYER_Y, hands[0].cards.length > 4 ? 16 : 22, active === 0 && state === 'player');
        if (hands[0].cards.length) drawTotalBadge(g, 160, PLAYER_Y + CARD_H + 2, handValue(hands[0].cards), hands[0].result);
      } else {
        const centers = [92, 224];
        hands.forEach((h, i) => {
          drawHand(g, h.cards, centers[i], PLAYER_Y, 15, active === i && state === 'player');
          if (h.cards.length) drawTotalBadge(g, centers[i], PLAYER_Y + CARD_H + 2, handValue(h.cards), h.result);
        });
      }

      drawBanner(g);
      drawControls(g);
    },
  };

  // ---------- отрисовка ----------
  function drawTable(g) {
    g.clear(C.felt);
    g.rect(0, 0, 320, 16, C.bg1);
    g.rect(0, 146, 320, 34, C.bg1);
    // дуга-подпись
    drawTextCentered(g, 'BLACKJACK PAYS 3 TO 2', 160, DEALER_Y + CARD_H + 14, C.feltLt);
    drawTextCentered(g, 'DEALER STANDS ON 17', 160, DEALER_Y + CARD_H + 23, C.feltLt);
    g.rect(0, 16, 320, 1, C.gold);
    g.rect(0, 145, 320, 1, C.gold);
  }

  function drawHand(g, cards, centerX, topY, spread, highlight) {
    const w = cards.length ? (cards.length - 1) * spread + CARD_W : 0;
    const startX = centerX - w / 2;
    if (highlight) g.rectLine(startX - 3, topY - 3, w + 6, CARD_H + 6, Math.sin(time * 10) > 0 ? C.yellow : C.gold, 1);
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const p = clamp((time - c.bornAt - (c.delay || 0)) / DEAL_T, 0, 1);
      if (p <= 0) continue;
      const e = easeOutCubic(p);
      const slotX = startX + i * spread;
      const x = lerp(SHOE.x, slotX, e);
      const y = lerp(SHOE.y, topY, e);
      drawCard(g, c, x, y, c.faceDown);
    }
  }

  function drawTotalBadge(g, cx, y, val, result) {
    let label, col = C.bg0, face = C.white;
    if (result) {
      label = { WIN: 'WIN', LOSE: 'LOSE', PUSH: 'PUSH', BUST: 'BUST', BJ: 'BLACKJACK!' }[result];
      face = result === 'WIN' || result === 'BJ' ? C.gold : result === 'PUSH' ? C.silver : C.red;
      col = result === 'PUSH' ? C.bg0 : C.white;
    } else if (val == null) {
      label = '?';
    } else {
      label = (val.soft ? '' : '') + val.total + (val.soft && val.total !== 21 ? '/' + (val.total - 10) : '');
      if (val.total > 21) { label = 'BUST ' + val.total; face = C.red; col = C.white; }
      else if (val.total === 21) face = C.gold;
    }
    const w = textWidth(label) + 6;
    g.rect(cx - w / 2, y, w, 11, face);
    g.rectLine(cx - w / 2, y, w, 11, C.bg0, 1);
    drawTextCentered(g, label, cx, y + 2, col);
  }

  function drawBanner(g) {
    if (!roundOver) return;
    const a = clamp(1 - (bannerTimer - 3.0) / 0.8, 0, 1);
    if (a <= 0) return;
    const pop = easeOutBack(clamp(bannerTimer / 0.4, 0, 1));
    let txt;
    if (lastWin > 0) txt = hands.some((h) => h.result === 'BJ') ? 'BLACKJACK!  +' + lastWin : 'WIN  +' + lastWin;
    else txt = 'DEALER WINS';
    g.alpha(a);
    const w = textWidth(txt, { scale: 2 });
    const bx = 160 - w / 2 - 6, by = 64 - Math.round(pop * 2);
    g.rect(bx, by, w + 12, 20, C.shadow);
    g.rectLine(bx, by, w + 12, 20, lastWin > 0 ? C.gold : C.red, 1);
    drawTextCenteredOutlined(g, txt, 160, by + 4, lastWin > 0 ? C.yellow : C.redLt, C.redDk, { scale: 2 });
    g.resetAlpha();
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

  function drawChip(g, cx, cy, chip, hover) {
    g.circle(cx, cy, 10, chip.c);
    g.ring(cx, cy, 10, hover ? C.white : C.silver, 1);
    g.ring(cx, cy, 6, hover ? C.white : C.silver, 1);
    const tc = chip.c === C.bg0 || chip.c === C.purple ? C.white : C.bg0;
    drawTextCentered(g, String(chip.v), cx, cy - 3, tc);
  }

  function drawControls(g) {
    if (state === 'player') {
      const h = curHand();
      button(g, B_HIT, 'HIT', { enabled: true });
      button(g, B_STAND, 'STAND', { enabled: true });
      button(g, B_DOUBLE, 'DOUBLE', { enabled: h.cards.length === 2 && economy.canBet(h.bet) && !h.splitAces });
      button(g, B_SPLIT, 'SPLIT', { enabled: canSplit() });
      drawTextCentered(g, 'H HIT   S STAND   D DOUBLE   P SPLIT', 160, 142, C.feltLt);
    } else {
      // ставка: фишки + CLEAR + DEAL
      for (let i = 0; i < CHIPS.length; i++) {
        const cx = 26 + i * 30;
        drawChip(g, cx, 161, CHIPS[i], input.inRect(cx - 11, 150, 22, 22));
      }
      drawText(g, 'BET', 132, 150, C.silver);
      drawText(g, String(bet), 132, 160, denyFlash > 0 ? C.red : C.gold);
      button(g, B_CLEAR, 'CLEAR', { enabled: bet > 0 });
      button(g, B_DEAL, roundOver ? 'DEAL' : 'DEAL', { primary: true, enabled: bet > 0 && economy.canBet(bet) });
    }
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

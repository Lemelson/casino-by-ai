// Рисовка игральных карт: масти, лицо (ранг+пипы), рубашка. Всё примитивами.
import { C } from '../engine/palette.js';
import { drawText, textWidth } from '../engine/font.js';

export const CARD_W = 24;
export const CARD_H = 32;

// масть-пип с центром в (cx, cy), высота ~9px
export function drawSuit(g, suit, cx, cy, col) {
  cx = Math.round(cx); cy = Math.round(cy);
  if (suit === 'hearts') {
    g.rect(cx - 3, cy - 2, 3, 1, col); g.rect(cx + 1, cy - 2, 3, 1, col);
    g.rect(cx - 3, cy - 1, 7, 1, col);
    g.rect(cx - 3, cy, 7, 1, col);
    g.rect(cx - 2, cy + 1, 5, 1, col);
    g.rect(cx - 1, cy + 2, 3, 1, col);
    g.rect(cx, cy + 3, 1, 1, col);
  } else if (suit === 'diamonds') {
    g.rect(cx, cy - 3, 1, 1, col);
    g.rect(cx - 1, cy - 2, 3, 1, col);
    g.rect(cx - 2, cy - 1, 5, 1, col);
    g.rect(cx - 3, cy, 7, 1, col);
    g.rect(cx - 2, cy + 1, 5, 1, col);
    g.rect(cx - 1, cy + 2, 3, 1, col);
    g.rect(cx, cy + 3, 1, 1, col);
  } else if (suit === 'spades') {
    g.rect(cx, cy - 3, 1, 1, col);
    g.rect(cx - 1, cy - 2, 3, 1, col);
    g.rect(cx - 2, cy - 1, 5, 1, col);
    g.rect(cx - 3, cy, 7, 1, col);
    g.rect(cx - 3, cy + 1, 7, 1, col);
    g.rect(cx - 1, cy + 2, 3, 1, col);
    g.rect(cx, cy + 2, 1, 2, col);
    g.rect(cx - 2, cy + 4, 5, 1, col);
  } else { // clubs
    g.circle(cx, cy - 1, 2, col);
    g.circle(cx - 2, cy + 1, 2, col);
    g.circle(cx + 2, cy + 1, 2, col);
    g.rect(cx, cy + 1, 1, 3, col);
    g.rect(cx - 2, cy + 4, 5, 1, col);
  }
}

export function drawCard(g, card, x, y, faceDown) {
  x = Math.round(x); y = Math.round(y);
  g.rect(x + 1, y + 2, CARD_W, CARD_H, C.shadow); // тень

  if (faceDown) {
    g.rect(x, y, CARD_W, CARD_H, C.redDk);
    g.rectLine(x, y, CARD_W, CARD_H, C.white, 1);
    g.rectLine(x + 2, y + 2, CARD_W - 4, CARD_H - 4, C.gold, 1);
    for (let yy = y + 5; yy < y + CARD_H - 4; yy += 3)
      for (let xx = x + 5; xx < x + CARD_W - 4; xx += 4)
        g.px(xx + (((yy - y) / 3) & 1 ? 2 : 0), yy, C.red);
    return;
  }

  g.rect(x, y, CARD_W, CARD_H, C.white);
  g.rectLine(x, y, CARD_W, CARD_H, C.gray, 1);
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  const col = red ? C.red : C.bg0;

  drawText(g, card.rank, x + 2, y + 2, col);
  drawSuit(g, card.suit, x + CARD_W / 2, y + CARD_H / 2 + 2, col);
  drawText(g, card.rank, x + CARD_W - 2 - textWidth(card.rank), y + CARD_H - 9, col);
}

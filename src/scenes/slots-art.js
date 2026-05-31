// Рисовка символов слотов. Каждый символ — в логическом боксе 16x16,
// s = пикселей на клетку (s=2 -> символ 32x32). Всё примитивами, без ассетов.
import { C } from '../engine/palette.js';
import { drawText, textWidth } from '../engine/font.js';

export function drawSymbol(g, id, x, y, s = 2) {
  const R = (bx, by, bw, bh, col) => g.rect(x + bx * s, y + by * s, bw * s, bh * s, col);
  const CIRC = (bx, by, r, col) => g.circle(x + bx * s, y + by * s, r * s, col);
  const box = 16 * s;

  switch (id) {
    case 'cherry': {
      // черенки + лист
      R(8, 2, 2, 2, C.green);
      R(6, 4, 2, 2, C.green); R(5, 6, 2, 2, C.green);
      R(10, 4, 2, 2, C.green); R(11, 6, 2, 2, C.green);
      R(10, 1, 4, 2, C.green);
      // две вишни
      CIRC(5, 11, 3, C.red); CIRC(11, 12, 3, C.red);
      CIRC(5, 12, 2, C.redDk); CIRC(11, 13, 2, C.redDk);
      CIRC(5, 11, 2, C.red); CIRC(11, 12, 2, C.red);
      R(3, 10, 1, 1, C.white); R(9, 11, 1, 1, C.white);
      break;
    }
    case 'lemon': {
      CIRC(8, 9, 5, C.yellow);
      CIRC(9, 10, 4, C.gold);
      CIRC(8, 8, 4, C.yellow);
      R(5, 6, 2, 2, C.white);
      R(10, 3, 3, 2, C.green); R(12, 4, 1, 1, C.green);
      break;
    }
    case 'bell': {
      R(7, 2, 2, 1, C.goldDk);
      R(6, 3, 4, 2, C.gold);
      R(5, 5, 6, 2, C.gold);
      R(4, 7, 8, 3, C.gold);
      R(3, 10, 10, 2, C.gold);
      R(2, 12, 12, 1, C.goldDk);
      R(5, 4, 1, 6, C.yellow);
      R(7, 13, 2, 2, C.goldDk);
      break;
    }
    case 'bar': {
      R(2, 5, 12, 6, C.cyan);
      R(2, 5, 12, 1, C.white);
      g.rectLine(x + 2 * s, y + 5 * s, 12 * s, 6 * s, C.cyanDk, s);
      const t = 'BAR';
      drawText(g, t, x + Math.round((box - textWidth(t)) / 2), y + Math.round(6.5 * s), C.bg0);
      break;
    }
    case 'seven': {
      const t = '7';
      const tw = textWidth(t, { scale: 3 });
      const tx = x + Math.round((box - tw) / 2);
      const ty = y + Math.round((box - 21) / 2);
      // обводка
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (dx || dy) drawText(g, t, tx + dx * s, ty + dy * s, C.redDk, { scale: 3 });
      drawText(g, t, tx, ty, C.red, { scale: 3 });
      R(2, 2, 2, 2, C.gold); R(12, 2, 2, 2, C.gold);
      break;
    }
    case 'diamond': {
      for (let by = 2; by <= 14; by++) {
        const h = 6 - Math.abs(by - 8);
        if (h < 0) continue;
        const col = by < 8 ? C.cyan : C.cyanDk;
        R(8 - h, by, 2 * h + 1, 1, col);
      }
      R(6, 4, 2, 2, C.white);
      R(7, 6, 3, 1, C.white);
      break;
    }
    case 'wild': {
      CIRC(8, 8, 7, C.gold);
      g.ring(x + 8 * s, y + 8 * s, 7 * s, C.goldDk, s);
      CIRC(8, 8, 6, C.yellow);
      const t = 'WILD';
      drawText(g, t, x + Math.round((box - textWidth(t)) / 2), y + Math.round(6 * s), C.redDk);
      // искры
      R(1, 1, 1, 1, C.white); R(14, 2, 1, 1, C.white); R(2, 13, 1, 1, C.white); R(14, 13, 1, 1, C.white);
      break;
    }
  }
}

// Рендерер: всё рисуем примитивами в маленький буфер 320x180.
// Контекст уже работает в низком разрешении — апскейл делает CSS (pixelated).
export class Renderer {
  constructor(ctx, w, h) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
  }

  clear(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  px(x, y, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x | 0, y | 0, 1, 1);
  }

  rect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x | 0, y | 0, Math.max(0, w | 0), Math.max(0, h | 0));
  }

  // Рамка толщиной t пикселей.
  rectLine(x, y, w, h, color, t = 1) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    this.rect(x, y, w, t, color);
    this.rect(x, y + h - t, w, t, color);
    this.rect(x, y, t, h, color);
    this.rect(x + w - t, y, t, h, color);
  }

  hline(x, y, w, color) { this.rect(x, y, w, 1, color); }
  vline(x, y, h, color) { this.rect(x, y, 1, h, color); }

  line(x0, y0, x1, y1, color) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  circle(cx, cy, r, color) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    const r2 = r * r;
    this.ctx.fillStyle = color;
    for (let y = -r; y <= r; y++) {
      const span = Math.floor(Math.sqrt(r2 - y * y + 0.5));
      this.ctx.fillRect(cx - span, cy + y, span * 2 + 1, 1);
    }
  }

  ring(cx, cy, r, color, th = 1) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    const inner = (r - th) * (r - th), outer = r * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (d <= outer && d > inner) this.px(cx + x, cy + y, color);
      }
    }
  }

  // Спрайт: rows — массив строк; map — { символ: цвет }, '.'/' ' = прозрачно.
  sprite(def, x, y, scale = 1) {
    const { rows, map } = def;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const col = map[row[c]];
        if (col) this.rect(x + c * scale, y + r * scale, scale, scale, col);
      }
    }
  }

  // Ограничение области рисования (для окошек барабанов и т.п.).
  clip(x, y, w, h) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
  }
  unclip() { this.ctx.restore(); }

  // Альфа для мягких свечений/затемнений.
  alpha(a) { this.ctx.globalAlpha = a; }
  resetAlpha() { this.ctx.globalAlpha = 1; }
}

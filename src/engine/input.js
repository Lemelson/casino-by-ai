// Ввод: мышь (в координатах низкого разрешения) + клавиатура.
// pressed/released/keyPressed — события одного кадра, чистятся в lateUpdate().
export function createInput(canvas, W, H) {
  const s = { x: 0, y: 0, down: false, pressed: false, released: false };
  const keys = new Set();
  const keyPressed = new Set();

  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const py = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    s.x = Math.floor(px * (W / r.width));
    s.y = Math.floor(py * (H / r.height));
  }

  canvas.addEventListener('mousemove', toLocal);
  canvas.addEventListener('mousedown', (e) => { toLocal(e); s.down = true; s.pressed = true; });
  window.addEventListener('mouseup', () => { s.down = false; s.released = true; });

  // Базовый тач (один палец = клик).
  canvas.addEventListener('touchstart', (e) => { toLocal(e); s.down = true; s.pressed = true; e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend', () => { s.down = false; s.released = true; });

  window.addEventListener('keydown', (e) => {
    if (!e.repeat) { keys.add(e.code); keyPressed.add(e.code); }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  return {
    get x() { return s.x; },
    get y() { return s.y; },
    get down() { return s.down; },
    get pressed() { return s.pressed; },
    get released() { return s.released; },
    isDown: (code) => keys.has(code),
    wasPressed: (code) => keyPressed.has(code),
    inRect: (x, y, w, h) => s.x >= x && s.x < x + w && s.y >= y && s.y < y + h,
    // true в кадр, когда мышь нажали внутри прямоугольника.
    clicked(x, y, w, h) { return s.pressed && s.x >= x && s.x < x + w && s.y >= y && s.y < y + h; },
    lateUpdate() { s.pressed = false; s.released = false; keyPressed.clear(); },
  };
}

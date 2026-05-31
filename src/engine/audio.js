// Синтезированный 8-битный звук через WebAudio — без файлов, всё генерим.
// Контекст создаётся лениво на первый жест пользователя (политика браузеров).
export function createAudio() {
  let ctx = null, master = null, muted = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function tone(freq, dur, type = 'square', vol = 0.5, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    ensure, resume,
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },

    click() { ensure(); tone(420, 0.05, 'square', 0.35); },
    nav() { ensure(); tone(620, 0.05, 'triangle', 0.3); tone(880, 0.06, 'triangle', 0.25, 0.04); },
    deny() { ensure(); tone(150, 0.12, 'sawtooth', 0.35); },
    spin() { ensure(); tone(200, 0.08, 'square', 0.25); tone(320, 0.08, 'square', 0.2, 0.03); },
    reelStop() { ensure(); tone(170, 0.05, 'square', 0.5); tone(85, 0.06, 'square', 0.4, 0.01); },
    coin() { ensure(); tone(900, 0.04, 'square', 0.28); tone(1350, 0.05, 'square', 0.22, 0.025); },
    bet() { ensure(); tone(520, 0.04, 'triangle', 0.3); },
    win(big = false) {
      ensure();
      const seq = big ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784];
      seq.forEach((f, i) => tone(f, 0.13, 'square', 0.33, i * 0.07));
    },
  };
}

// Кредиты игрока: единый кошелёк на все игры, сохраняется в localStorage.
const KEY = 'casinobyai.credits';

export function createEconomy(start = 1000) {
  let credits = start;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null) credits = Math.max(0, parseInt(saved, 10) || 0);
  } catch (e) { /* приватный режим — просто в памяти */ }

  function save() { try { localStorage.setItem(KEY, String(credits)); } catch (e) {} }

  return {
    get credits() { return credits; },
    set(v) { credits = Math.max(0, Math.floor(v)); save(); },
    add(n) { credits = Math.max(0, credits + Math.floor(n)); save(); return credits; },
    canBet(n) { return credits >= n; },
    bet(n) { if (credits < n) return false; credits -= n; save(); return true; },
    topUp(n = 1000) { credits += n; save(); return credits; },
  };
}

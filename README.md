# 🎰 CASINO BY AI

A retro pixel-art casino that runs entirely in the browser — every pixel is drawn in
code, with **zero external assets**. It renders at a tiny internal resolution
(320×180) and integer-upscales for crisp, chunky pixels, uses a neon palette, and
synthesizes its own 8-bit sound. Pure **JavaScript + Canvas**, no build step, no
dependencies.

**▶️ Play it live:** https://lemelson.github.io/casino-by-ai/

![Made with vanilla JS](https://img.shields.io/badge/vanilla-JS-f7df1e?logo=javascript&logoColor=black)
![No build step](https://img.shields.io/badge/build-none-brightgreen)
![Canvas](https://img.shields.io/badge/render-Canvas%202D-7b2ff7)

---

## Games

| Game | What's inside | RTP (return to player) |
|------|---------------|------------------------|
| 🎰 **Slots** | 3 reels, 5 paylines (3 horizontal + 2 diagonal), WILD symbol, weighted RNG | ~95.95% |
| 🃏 **Blackjack** | 4-deck shoe, hit / stand / double / split, dealer stands on 17, blackjack pays 3:2 | ~94.4% (dealer strategy) / ~99.5% (basic strategy) |
| 🎡 **Roulette** | European (single zero), animated wheel + ball, interactive betting table | ~97.3% |
| 🪀 **Plinko** | 8 rows of pegs, fair binomial drop, multiplier buckets up to ×10 | ~96.56% |

Every game is tuned to a **small house edge** — over a short session a player can
genuinely come out ahead, but over the long run the house wins (just like a real
casino). All games share a single currency wallet, persisted in `localStorage`.

---

## Running locally

No build is required — any static file server works:

```bash
# clone
git clone https://github.com/Lemelson/casino-by-ai.git
cd casino-by-ai

# serve (any static server is fine)
python3 -m http.server 8137
# then open http://localhost:8137
```

> The app uses native ES modules, so it must be served over HTTP —
> opening `index.html` directly via `file://` will not load the modules.

---

## Controls

- **Lobby:** arrow keys + `Enter`, or click a game card.
- **Slots:** `Space` to spin, `−/+` to change the bet.
- **Blackjack:** `H` hit, `S` stand, `D` double, `P` split, pick chips + `DEAL`.
- **Roulette:** click a chip onto the table, `Space` / `SPIN` to spin.
- **Plinko:** `Space` / click to drop a ball (hold to rain a batch).
- **Everywhere:** `Esc` back to the lobby, `M` toggle sound.

---

## Architecture

```
index.html          canvas host + arcade-cabinet framing (pure CSS)
src/
  main.js           game loop, integer upscaling, scene registration
  engine/
    palette.js      the neon color palette
    gfx.js          low-level Canvas drawing primitives
    font.js         hand-built 5×7 pixel font
    input.js        keyboard + pointer handling
    audio.js        procedural 8-bit sound synthesis (WebAudio)
    economy.js      shared wallet, persisted to localStorage
    scene.js        scene manager (push / pop / transitions)
    util.js         RNG, math, and misc helpers
  scenes/
    lobby.js        game selection screen
    slots.js        + slots-art.js   symbol artwork
    blackjack.js    + cards-art.js   card artwork
    roulette.js
    plinko.js
```

One wallet is shared across all games. Adding a new game is a self-contained job:
write one new scene and register it in `main.js`.

---

## Tech notes

- **Fixed internal resolution** (320×180) drawn to an offscreen buffer, then
  integer-scaled to fill the window for pin-sharp pixels at any size.
- **No sprite sheets** — card faces, slot symbols, the roulette wheel, and the
  pixel font are all generated procedurally at runtime.
- **Sound is synthesized** on the fly with the Web Audio API; there are no audio
  files to download.
- **State persistence** via `localStorage`, so your balance survives a reload.

---

## License

MIT — do whatever you like with it.

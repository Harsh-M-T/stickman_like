# 🥋 Sansad Showdown — Stickman Fighter

[![GitHub Stars](https://img.shields.io/github/stars/Harsh-M-T/stickman_like?style=social)](https://github.com/Harsh-M-T/stickman_like/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Harsh-M-T/stickman_like?style=social)](https://github.com/Harsh-M-T/stickman_like/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/Harsh-M-T/stickman_like)](https://github.com/Harsh-M-T/stickman_like/issues)
[![MIT License](https://img.shields.io/github/license/Harsh-M-T/stickman_like)](LICENSE)

A fast-paced 1v1 stickman fighting game for browsers — best-of-3 rounds, a full
select flow (character → stage → difficulty), five fighters plus a unlockable
boss, contact-accurate combat, and a state-driven CPU that fights you the same
way a human would. Built with vanilla JS (zero-build ES modules), HTML5 Canvas,
and CSS. Reworked from [ioNihal/Game2D](https://github.com/ioNihal/Game2D).

## 🚀 Features

- ⚔️ **Best-of-3 matches** — 60-second rounds, timeout resolves by remaining HP
  (equal HP = draw), round-win pips on the HUD
- 🥊 **Contact-accurate combat** — slim, body-centered hurtboxes and
  front-edge-anchored attack reach: punches connect when the fighters actually
  touch, not from across the screen
- 🤖 **Honest AI** — the CPU reacts only to on-screen state through a virtual
  input buffer; it never reads your inputs. Walks into contact range, blocks,
  punishes recovery, anti-airs, and opens combo windows off landed hits
- ⚡ **SHAKTI super meter** — built by landing and taking hits; spend a full
  bar on a heavy super (boss has his own, nastier version)
- 🛡️ **Guard meter** — blocking drains it, blocked hits add chip damage; empty
  meter = guard break and a long stun
- 🔗 **Combo system** — chained follow-ups, damage scaling per hit (down to a
  floor), combo counter on the HUD
- 💥 **Game feel** — hitstop, screen shake, colored hit sparks (hit / counter /
  block), floating damage numbers, KO slow-motion, knockdown + wakeup with an
  invincible reversal window
- 👥 **5 fighters** with distinct stats and health pools, plus **Atlas, the
  Colossus** — a 320px armored boss with high damage and a unique super
- 🏟️ **3 stages** — Neon Street, Parliament, Protest Grounds (config-driven themes)
- 📈 **3 difficulties** — Easy / Normal / Hard tune reaction time, block rate,
  aggression, mistakes and stats; boss fights run on dedicated boss tuning
- 📱 **Mobile** — landscape-only with a virtual joystick + PUNCH / KICK / GRAB /
  SUPER buttons; rotate-device overlay auto-pauses in portrait
- 🎵 Web Audio pipeline (BGM + SFX with synthesized fallbacks when assets are
  missing), settings-reactive volume
- 🔧 Debug mode via `?debug` (hitbox overlay + killswitch)

## 🕹️ Controls

**Desktop**

| Action | Input |
|---|---|
| Move | `A` / `D` or `←` / `→` |
| Jump | `W` / `↑` |
| Crouch | `S` |
| Block | hold back (`A`/`←` when facing right) |
| Punch | `J` — with `→` held: dash punch; with `↓` held: low punch |
| Heavy punch | `U` |
| Kick | `K` — with `→` held: dash kick; with `↓` held: sweep (knockdown) |
| Grab | `I` (command grab — beats blocking; mash to escape) |
| Super | `L` or `Space` (only with a full SHAKTI meter) |
| Pause | `Esc` |

**Mobile** (landscape): left virtual joystick + PUNCH / KICK / GRAB / SUPER.

## 👥 Roster

| Fighter | Style |
|---|---|
| **Kade** | Rushdown brawler — high damage, slightly squishy |
| **Mira** | Balanced all-rounder |
| **Jin** | Speedster — fast walks, lighter hits |
| **Sable** | Zoner — bigger health pool, stronger heavies |
| **Rook** | Grappler — loves grabs, squishier |
| **Atlas** 🔒 | Boss. 200 HP colossus: armor on heavy moves, high damage, unique super |

**Atlas unlocks** after you win **3 CPU matches in a row** — the streak
persists across fights, so the pressure stays on.

## 📦 Getting Started

1. Clone or download this repo
2. Serve the folder over HTTP and open it in a browser:
   ```bash
   python -m http.server 8000
   # → http://localhost:8000
   ```
3. Play! (Start → pick a fighter → Continue → pick a stage → pick a difficulty)

> ES modules require an HTTP server — opening `index.html` directly from disk
> won't work.

## 🔧 Debug Mode

Append `?debug` to the URL:

- `B` — toggle the hitbox/hurtbox overlay
- `L` — killswitch: instantly KO the opponent (handy for testing game-over flow)

## ⚙️ Tuning

Every gameplay constant lives in **`configs/config.js`**:

- `MOVES` — per-move frame data: startup / active / recovery, damage,
  knockback, hitstun, and hitbox geometry (`offsetX` = reach in px past the
  attacker's front edge; the opponent's hurtbox core is centered on their body)
- `CONFIG` — movement, meters (guard + SHAKTI), combo scaling, hitstop, KO
  timing, rounds
- `COMBO_CHAINS` — which moves chain into which

Characters are config-only too: add an entry to
`configs/characters/index.js` and it appears on the character select screen
automatically. Stages live in `configs/arena.js`.

## 📁 Structure

```
ai/                 AIController — drives the enemy via a VirtualInput action buffer
configs/            Central configs: constants, arena themes, assets manifest,
                    per-character configs (roster.js adds Kade..Rook + Atlas)
core/               EventBus, state machine, Game facade, fixed-60Hz GameLoop
debug/              DebugControls — killswitch (L) + hitbox toggle (B), ?debug only
entities/           Fighter FSM + Hitbox (front-edge anchored), CharacterFactory
input/              InputHandler (frame-buffered) + single key→action map
render/             Renderer (theme layers), HUD, overlays, floating text,
                    animation controller (procedural stickman fallback)
systems/            CombatSystem (hitboxes/damage/meters) + MatchSystem (rounds)
ui/                 UIManager (screens via EventBus), SettingsStore, MobileControls
utils/              AssetLoader, AudioManager (Web Audio, settings-reactive)
main.js             Composition root — wires SettingsStore → Audio → Game → UI
```

## 🏗️ Architecture Notes

- **Fixed-timestep loop** — logic advances at a strict 60 Hz (frame-rate
  independent), rendering on every rAF; KO slow-motion scales the timestep
- **Config-driven content** — moves, characters, stages and audio are all
  data; no magic numbers scattered through systems
- **EventBus decoupling** — UI emits `ui:*`, Game emits `game:*`, nothing
  reaches into another system's internals
- **Facing is owned by the Game** — fighters always face their opponent;
  walking backward never turns you around
- **Resilient assets** — missing sprites fall back to a procedural stickman;
  missing audio falls back to synthesized tones; the game stays playable with
  zero assets present
- **Loop safety** — an error inside the game loop is logged loudly instead of
  silently killing the rAF chain (frozen fights now tell you why)

## 🤝 Contributing

PRs welcome! Please open issues for bugs or suggestions.

## 🙏 Credits

Based on [Game2D](https://github.com/ioNihal/Game2D) by ioNihal — thanks for
the clean modular architecture this project was built on top of.

---

Made with ❤️ for learning & fun.

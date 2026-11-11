import AssetLoader from '../utils/assetLoader.js';
import GameLoop from './gameLoop.js';
import CombatSystem from '../systems/combat.js';
import MatchSystem from '../systems/match.js';
import { CONFIG } from '../configs/config.js';
import { getArenaTheme } from '../configs/arena.js';
import { ASSET_MANIFEST } from '../configs/assets.js';
import { GAME_AUDIO } from '../configs/audio.js';
import { getCharacter } from '../configs/characters/index.js';
import { buildFighter } from '../entities/characterFactory.js';
import Fighter from '../entities/fighter.js';
import { PLAYER_CHARACTER } from '../configs/characters/player.js';
import { ENEMY_CHARACTER } from '../configs/characters/enemy.js';
import { BOSS_CHARACTER } from '../configs/characters/roster.js';
import AIController from '../ai/aiController.js';
import HUD from '../render/hud.js';
import Overlays from '../render/overlays.js';
import FloatingText from '../render/floatingText.js';

/**
 * Game — orchestration facade.
 *
 * Composes systems (GameLoop, CombatSystem, MatchSystem, EventBus), entities
 * (fighters built from character configs and reused across rounds via reset()),
 * and the render modules. Gameplay logic lives in the systems; this class only
 * wires them together and applies visual/audio side-effects in response to
 * their events.
 *
 * Dependencies are injected via constructor (no UIManager construction here):
 *   renderer, bus, audio, input, settingsStore, debug (optional)
 */
export default class Game {
    /**
     * @param {{
     *   renderer: import('../render/renderer.js').default,
     *   bus: import('../core/eventBus.js').default,
     *   audio: import('../utils/audioManager.js').default,
     *   input: import('../input/inputHandler.js').default,
     *   settingsStore: import('../ui/settingsStore.js').default,
     *   debug?: import('../debug/debugControls.js').default,
     *   characterId?: string,
     *   stageId?: string,
     * }} deps
     */
    constructor({ renderer, bus, audio, input, settingsStore, debug = null, characterId = 'player', stageId = 'street' }) {
        this._renderer = renderer;
        this._bus = bus;
        this._audio = audio;
        this._input = input;
        this._settingsStore = settingsStore;
        this._debug = debug;

        this._hud = new HUD();
        this._overlays = new Overlays;
        this._floatingTexts = [];

        this._assetLoader = new AssetLoader();

        // Combat + Match systems
        this._combat = new CombatSystem({ bus: this._bus });
        this._match = new MatchSystem({ bus: this._bus });

        // Slow-motion during the KO delay; restored when the round settles
        this._bus.on('match:ko', () => this._loop?.setTimeScale(0.35));
        this._bus.on('match:roundEnd', () => this._loop?.setTimeScale(1));

        // System event handlers
        this._bus.on('sfx', ({ sound, actor }) => {
            const { key, volume } = this._resolveSFX(actor, sound);
            if (key) this._audio.playSFX(key, { volume });
        });
        this._bus.on('combat:hit', (payload) => this._onCombatHit(payload));
        this._bus.on('match:roundStart', () => this._onRoundStart());
        this._bus.on('match:roundEnd', (p) => this._onRoundEnd(p));

        // Debug killswitch (only fires when CONFIG.debug is true)
        this._bus.on('debug:killswitch', () => {
            if (this._enemy && this._enemy.state !== 'ko') {
                this._enemy.health = 0;
                this._enemy.enterState('ko');
            }
        });

        // Boss unlock: 3 consecutive CPU wins → boss fight
        this._cpuWins = 0;
        this._bossUnlocked = false;

        // Game flags
        this._running = false;
        this._paused = false;
        this._hitstopFrames = 0;

        // Auto-advance to the next round after a non-final round settles
        this._autoNextRoundFrames = 0;

        // Screen shake
        this._shakeX = 0;
        this._shakeY = 0;

        // Visual collections
        this._sparks = [];

        // Ghost health bar (lag behind real HP visually)
        this._playerGhostHP = 1000;
        this._enemyGhostHP = 1000;

        // Fixed-timestep loop: 60 Hz logic, rAF render
        this._loop = new GameLoop({
            update: () => this._step(),
            render: () => this._draw(),
            timeScale: 1,
        });

        this._selectedCharacterId = characterId;
        this._stageId = stageId;
        this._arenaTheme = getArenaTheme(stageId);

        this._buildFighters();
        this.setDifficulty(this._settingsStore.difficulty);

        // Difficulty is live-switchable: apply settings changes to the AI
        this._settingsStore.onChange(s => this.setDifficulty(s.difficulty));

        this._preloadAll();
    }

    //  Asset loading

    _preloadAssets() {
        return this._assetLoader.loadImages(ASSET_MANIFEST.images).catch(err =>
            console.error('[Game] Asset load error:', err)
        );
    }

    async _preloadAudio() {
        await this._audio.loadAudioList(ASSET_MANIFEST.audio).catch(err =>
            console.error('[Game] Audio load error:', err)
        );
    }

    /**
     * Loads images + audio, then emits game:assetsReady so the UI can enable
     * the Start button. Individual load failures are logged but don't block —
     * fallback placeholders keep the game playable.
     */
    async _preloadAll() {
        await Promise.all([this._preloadAssets(), this._preloadAudio()]);
        this._bus.emit('game:assetsReady');
    }

    //  Fighters 

    _buildFighters() {
        const playerChar = getCharacter(this._selectedCharacterId) ?? PLAYER_CHARACTER;
        const bossFight = this._bossFight === true || this._difficulty === 'boss' || this._cpuWins >= 3;
        const enemyChar = bossFight ? BOSS_CHARACTER : ENEMY_CHARACTER;

        this._playerCharacter = playerChar;
        this._enemyCharacter = enemyChar;

        this._player = buildFighter({
            character: playerChar,
            x: playerChar.start?.x ?? 100,
            y: (playerChar.start?.y ?? CONFIG.groundY) - playerChar.physics.height,
            assetLoader: this._assetLoader,
            bus: this._bus,
        });
        this._enemy = buildFighter({
            character: enemyChar,
            x: enemyChar.start?.x ?? CONFIG.canvasWidth - 100 - enemyChar.physics.width,
            y: (enemyChar.start?.y ?? CONFIG.groundY) - enemyChar.physics.height,
            assetLoader: this._assetLoader,
            bus: this._bus,
        });
        this._combat.setFighters([this._player, this._enemy]);
        this._match.setFighters({ player: this._player, enemy: this._enemy });

        this._enemyAI = new AIController(this._enemy, this._player, {
            difficulty: bossFight ? 'boss' : this._difficulty,
            characterConfig: enemyChar,
        });
        this._builtForBoss = bossFight;
    }

    //  Public game state API

    startGame() {
        if (this._running) return;
        this._running = true;
        this._paused = false;
        this._match.startMatch();
        this._loop.start();
        this._bus.emit('game:started');
    }

    /** Start a fight with the currently selected character / stage / difficulty. */
    startFight() {
        this._difficulty = this._settingsStore.difficulty;
        // Boss fight: chosen explicitly via the (locked) Boss card, or earned
        // with 3 consecutive CPU match wins. Streak persists across matches.
        this._bossFight = this._difficulty === 'boss' || this._cpuWins >= 3;
        this._autoNextRoundFrames = 0;

        this._buildFighters();
        this._match.startMatch();
        this._loop.start();
        this._bus.emit('game:started');
    }

    stopGame() {
        this._running = false;
        this._paused = false;
        this._loop.stop();
        this._bus.emit('game:stopped');
    }

    pauseGame() {
        if (this._running && !this._paused) {
            this._paused = true;
            this._bus.emit('game:paused');
        }
    }
    resumeGame() {
        if (this._running && this._paused) {
            this._paused = false;
            this._loop.resetTiming();
            this._bus.emit('game:resumed');
        }
    }

    isRunning() { return this._running; }
    isPaused() { return this._paused; }
    isGameOver() { return this._match.isSettled; }

    rematch() {
        this._match.nextRound();
    }

    /** Player picked a character for this fight. */
    selectCharacter(id) {
        this._selectedCharacterId = id;
        this._bossFight = false;
    }

    /** Player picked a stage for this fight. */
    selectStage(id) {
        this._stageId = id;
        this._arenaTheme = getArenaTheme(id);
    }

    /** Player picked a difficulty for this fight. */
    setDifficulty(val) {
        this._difficulty = val;
        this._enemyAI?.setDifficulty(val);
        // Enemy stats scale with difficulty; the player is never touched.
        const stats = this._enemyCharacter?.ai?.[val]?.stats ?? {};
        this._enemy?.setStatMultipliers(stats);
        if (val === 'boss') this._enemyAI?.setDifficulty('boss');
    }

    //  Config-driven audio resolution

    /**
     * Resolve a sound for an actor to a loaded buffer key + volume.
     * Order: character audio block (ref → fallback) → shared game key.
     * @param {string} actor  — character id (e.g. 'player', 'enemy')
     * @param {string} sound  — sound name (e.g. 'punch', 'jump')
     * @returns {{ key: string|null, volume: number }}
     */
    _resolveSFX(actor, sound) {
        const char = getCharacter(actor);
        const entry = char?.audio?.[sound] ?? {};
        const shared = GAME_AUDIO.sfx ?? {};
        let key = null;
        let volume = 1;
        if (entry.ref && this._audio.has(entry.ref)) { key = entry.ref; volume = entry.volume ?? 1; }
        else if (entry.urls && this._audio.has(`${actor}_${sound}`)) { key = `${actor}_${sound}`; volume = entry.volume ?? 1; }
        else if (this._audio.has(sound)) { key = sound; volume = entry.volume ?? 1; }
        else { key = shared?.[sound] ? shared[sound] : null; volume = 1; }
        if (!key) {
            // Generated WebAudio fallback for sounds without loaded assets
            if (sound === 'super') key = 'super';
            else if (sound === 'counter') key = 'counter';
            else if (sound === 'whiff') key = 'whiff';
            else if (sound === 'grab') key = 'grab';
            else key = sound;
        }
        return { key, volume };
    }

    /** Pick the BGM entry for the current round (round map → final → default). */
    _resolveRoundBGM() {
        const bgm = GAME_AUDIO.bgm ?? {};
        const { round, playerWins, enemyWins } = this._match;
        const isFinal = Math.max(playerWins, enemyWins) >= CONFIG.roundsToWin - 1;
        const entry = isFinal
            ? bgm.final
            : (bgm.fight?.[String(round)] ?? bgm.fight?._default);
        return entry ?? bgm.fight?._default ?? null;
    }

    //  Fixed-timestep logic (one step = 1/60 s)

    _step() {
        if (this._paused) return;

        this._match.update();

        // Auto-advance to the next round after a settled non-final round
        // (keeps the flow fast while still showing the round result briefly).
        if (this._autoNextRoundFrames > 0) {
            this._autoNextRoundFrames--;
            if (this._autoNextRoundFrames === 0 && this._match.isRoundEnd) {
                this._match.nextRound();
            }
        }

        // Hitstop freeze (heavier hits = longer freeze): freeze gameplay,
        // but keep the input frame counter ticking so buffered inputs stay live.
        if (this._hitstopFrames > 0) {
            this._hitstopFrames--;
            this._input.update();
            return;
        }

        // Frozen during intro and after a round settles (KO anim still runs during delay)
        const frozen = this._match.isIntro || this._match.isSettled;
        if (!frozen) {
            this._updateFighters();
            this._updateVisuals();
            this._detectKO();
        }

        this._input.update();
    }

    _updateFighters() {
        // Player reads physical keyboard + virtual touch via InputHandler
        this._player.update(this._input);

        // AI writes to its own VirtualInput, then fighter reads it
        this._enemyAI.update();
        this._enemy.update(this._enemyAI.getInput());

        // Fighters can't stand inside each other (no pass-through bodies)
        Fighter.resolveBodyOverlap(this._player, this._enemy);

        // Facing always points toward the opponent (fighting-game convention;
        // walking backwards must NOT turn a fighter around)
        const plc = this._player.x + this._player.width / 2;
        const elc = this._enemy.x + this._enemy.width / 2;
        if (plc !== elc) {
            this._player.facingRight = elc > plc;
            this._enemy.facingRight = plc > elc;
        }

        // Collect + resolve hitboxes (emits combat:hit events)
        for (const fighter of [this._player, this._enemy]) {
            this._combat.collect(fighter);
        }
        this._combat.update();
    }

    _updateVisuals() {
        this._updateFloatingTexts();
        this._updateSparks();
        this._updateScreenShake();
        this._updateGhostHP();
        this._updateCombo();
    }

    _detectKO() {
        if (!this._match.isFighting) return;
        if (this._player.state === 'ko' || this._enemy.state === 'ko') {
            this._match.onKO(this._player.state === 'ko' ? 'enemy' : 'player');
        }
    }

    //  Match event side-effects

    _onRoundStart() {
        // Reuse fighters: reset to their start positions + full health
        this._player.reset(this._playerCharacter.start?.x ?? PLAYER_CHARACTER.start.x);
        this._enemy.reset(this._enemyCharacter.start?.x ?? ENEMY_CHARACTER.start.x);
        this._enemyAI.reset();
        this._combat.clear();

        // Ghost HP bars
        this._playerGhostHP = this._player.health;
        this._enemyGhostHP = this._enemy.health;

        // Reset per-round visual state
        this._floatingTexts = [];
        this._sparks = [];
        this._player.comboCount = 0;
        this._enemy.comboCount = 0;
        this._shakeX = 0;
        this._shakeY = 0;

        this._audio.resumeContext().then(() => {
            const track = this._resolveRoundBGM();
            if (track?.track) {
                this._audio.playMusic(track.track, {
                    volume: track.volume,
                    loop: track.loop !== false,
                });
            }
        });
    }

    _onRoundEnd(p) {
        this._audio.stopMusic();
        this._bus.emit('game:roundEnd', p);

        if (p?.matchOver) {
            this._autoNextRoundFrames = 0;

            // Boss unlock: 3 consecutive CPU match wins by the player
            if (p.winner === 'player') this._cpuWins++;
            else this._cpuWins = 0;
            if (this._cpuWins >= 3 && !this._bossUnlocked) {
                this._bossUnlocked = true;
                this._bus.emit('game:bossUnlocked', { cpuWins: this._cpuWins });
            }

            this._bus.emit('game:matchOver', p);
        } else {
            // Brief win-banner moment, then automatically start the next round
            this._autoNextRoundFrames = 150; // 2.5 s at 60 Hz
        }
    }

    //  Combat event side-effects (visual + audio)

    _onCombatHit({ attacker, damage, blocked, counter, ko, x, y, big, hitstopFrames, spark }) {
        if (damage > 0) {
            this._floatingTexts.push(new FloatingText(`-${Math.round(damage)}`, x, y));

            this._triggerShake(big ? CONFIG.shakeMagnitude * 1.5 : CONFIG.shakeMagnitude);
            this._hitstopFrames = hitstopFrames;

            // Hit spark / VFX
            this._sparks.push({
                x, y,
                vx: (Math.random() - 0.5) * 3,
                vy: -2 - Math.random() * 2,
                life: 12,
                maxLife: 12,
                color: spark === 'counter' ? '#22d3ee' : spark === 'block' ? '#94a3b8' : '#fbbf24',
                size: big ? 5 : 3,
            });

            // Combo tracking — comboCount/comboTimer live on the attacker fighter
            // and are consumed by the HUD / combo overlay in _draw().

        }

        if (blocked) {
            const { key, volume } = this._resolveSFX(attacker.id, 'block');
            if (key) this._audio.playSFX(key, { volume });
        } else if (counter) {
            const { key, volume } = this._resolveSFX(attacker.id, 'counter');
            if (key) this._audio.playSFX(key, { volume });
        } else if (ko) {
            const { key, volume } = this._resolveSFX(attacker.id, 'ko');
            if (key) this._audio.playSFX(key, { volume });
        } else {
            const { key, volume } = this._resolveSFX(attacker.id, 'hit');
            if (key) this._audio.playSFX(key, { volume });
        }
    }

    //  Visual systems

    _triggerShake(magnitude) {
        const angle = Math.random() * Math.PI * 2;
        this._shakeX = Math.cos(angle) * magnitude;
        this._shakeY = Math.sin(angle) * magnitude;
    }

    _updateScreenShake() {
        this._shakeX *= CONFIG.shakeDecay;
        this._shakeY *= CONFIG.shakeDecay;
        if (Math.abs(this._shakeX) < 0.1) this._shakeX = 0;
        if (Math.abs(this._shakeY) < 0.1) this._shakeY = 0;
    }

    _updateFloatingTexts() {
        for (let i = this._floatingTexts.length - 1; i >= 0; i--) {
            this._floatingTexts[i].update();
            if (this._floatingTexts[i].isExpired()) this._floatingTexts.splice(i, 1);
        }
    }

    _updateSparks() {
        for (let i = this._sparks.length - 1; i >= 0; i--) {
            const s = this._sparks[i];
            s.life--;
            s.x += s.vx;
            s.y += s.vy;
            s.vy += 0.1;
            if (s.life <= 0) this._sparks.splice(i, 1);
        }
    }

    /** Draw hit spark particles (flash + burst). */
    _drawSparks(ctx) {
        for (const s of this._sparks) {
            const alpha = Math.max(0, s.life / s.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = s.color ?? '#fbbf24';
            ctx.shadowColor = s.color ?? '#fbbf24';
            ctx.shadowBlur = s.size * 3;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    _updateGhostHP() {
        const speed = CONFIG.ghostBarSpeed;
        if (this._playerGhostHP > this._player.health) {
            this._playerGhostHP = Math.max(this._player.health, this._playerGhostHP - speed);
        }
        if (this._enemyGhostHP > this._enemy.health) {
            this._enemyGhostHP = Math.max(this._enemy.health, this._enemyGhostHP - speed);
        }
    }

    _updateCombo() {
        for (const f of [this._player, this._enemy]) {
            if (f.comboTimer > 0) f.comboTimer--;
            if (f.comboTimer <= 0) {
                f.comboCount = 0;
                f.comboOwner = null;
                f.comboQueuedMove = null;
            }
        }
    }

    //  Drawing

    _draw() {
        const ctx = this._renderer.ctx;

        this._renderer.beginWorld(this._shakeX, this._shakeY);

        // Background
        this._renderer.drawBackground(ctx, this._assetLoader.getImage('arena_bg'), this._arenaTheme);

        // Fighters
        if (this._player) this._player.draw(ctx);
        if (this._enemy) this._enemy.draw(ctx);

        // Hit sparks / VFX
        this._drawSparks(ctx);

        // Floating texts
        for (const ft of this._floatingTexts) ft.draw(ctx);

        this._renderer.endWorld();

        // HUD (not shaken)
        if (this._player && this._enemy) {
            this._hud.draw(ctx, {
                playerHealth: this._player.health,
                playerGhostHP: this._playerGhostHP,
                playerMaxHealth: this._player.maxHealth,
                enemyHealth: this._enemy.health,
                enemyGhostHP: this._enemyGhostHP,
                enemyMaxHealth: this._enemy.maxHealth,
                playerSuperMeter: this._player.superMeter,
                enemySuperMeter: this._enemy.superMeter,
                playerGuardMeter: this._player.guardMeter,
                enemyGuardMeter: this._enemy.guardMeter,
                playerWins: this._match.playerWins,
                enemyWins: this._match.enemyWins,
                round: this._match.round,
                timeMs: this._match.timeMs,
                comboCount: this._player.comboCount,
                comboTimer: this._player.comboTimer,
                comboOwner: this._player.comboOwner,
            });
        }

        // Round intro overlay
        if (this._match.isIntro) {
            this._overlays.drawIntro(ctx, { round: this._match.round, timer: this._match.introMs });
        }

        // KO slow-mo + K.O. banner
        if (this._match.isKODelay) {
            this._overlays.drawKO(ctx, { timer: this._match.koDelayFrames });
        }

        // Game over overlay
        if (this._match.isSettled) {
            this._overlays.drawGameOver(ctx, {
                winner: this._match.winner,
                playerWins: this._match.playerWins,
                enemyWins: this._match.enemyWins,
                matchOver: this._match.phase === 'matchOver',
            });
        }

        // Combo display
        if (this._player.comboCount > 2 && this._player.comboTimer > 0) {
            this._overlays.drawCombo(ctx, { count: this._player.comboCount, timer: this._player.comboTimer });
        }

        // Debug hitboxes (only when CONFIG.debug is active)
        this._debug?.drawDebugHitboxes(ctx, this._player, this._enemy, this._combat.getActiveHitboxes());
    }
}

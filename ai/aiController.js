/**
 * VirtualInput — a lightweight action buffer the AI writes to.
 * Mirrors the InputHandler query interface (isDown / justPressed) so the
 * fighter's state machine works identically whether driven by a human or AI.
 * Purely state-based: the AI reacts to on-screen fighter state, never to
 * reading another fighter's input.
 */
class VirtualInput {
    constructor() {
        this._held = {};
        this._justPressed = {};
        this._prev = {};
    }

    isDown(action) { return !!this._held[action]; }
    justPressed(action) { return !!this._justPressed[action]; }

    down(action) { this._held[action] = true; }
    up(action) { this._held[action] = false; }

    /** Snapshot for rising-edge detection — call once per frame AFTER the fighter reads input. */
    update() {
        for (const key of Object.keys(this._held)) {
            this._justPressed[key] = this._held[key] && !this._prev[key];
        }
        this._prev = { ...this._held };
    }
}

//  Action names for the AI VirtualInput, keyed by move name (frame data names
//  like 'jab' / 'straight' / 'sweep' map onto input actions like 'lightPunch').
const MOVE_TO_ACTION = Object.freeze({
    jab: 'lightPunch',
    dashPunch: 'lightPunch',
    lowPunch: 'lightPunch',
    straight: 'heavyPunch',
    airPunch: 'lightPunch',
    kick: 'kick',
    dashKick: 'kick',
    sweep: 'kick',
    grab: 'grab',
    super: 'super',
    rising: 'lightPunch',
});

//  Per-difficulty tuning defaults (overridden by the character's `ai` config block)
const DEFAULT_TUNING = Object.freeze({
    preferredRange: 90,
    blockProbability: 0.5,
    retreatProbability: 0.01,
    jumpProbability: 0.005,
    reactionDelay: 8,
    mistakeChance: 0.15,
    aggressionMult: 1.0,
    comboWindow: 20,
    antiAirChance: 0.1,
});

/**
 * AIController — drives an enemy fighter through a VirtualInput buffer.
 *
 * Instead of manipulating fighter state directly, the AI presses semantic
 * actions (moveLeft, moveRight, jump, crouch, lightPunch, heavyPunch, kick,
 * grab, super) and the fighter's own state machine resolves them exactly as it
 * would for a human player.
 *
 * Difficulty tuning is merged from three sources (last wins):
 *   1. DEFAULT_TUNING (hardcoded)
 *   2. The character config's `ai` block (per-difficulty overrides)
 *   3. SettingsStore difficulty (live-switchable)
 */
export default class AIController {
    /**
     * @param {import('../entities/fighter.js').default} fighter
     * @param {import('../entities/fighter.js').default} opponent
     * @param {{ difficulty?: string, characterConfig?: object }} [opts]
     */
    constructor(fighter, opponent, opts = {}) {
        this.fighter = fighter;
        this.opponent = opponent;
        this._characterConfig = opts.characterConfig ?? {};

        this._input = new VirtualInput();
        this._tuning = { ...DEFAULT_TUNING };
        this._applyCharacterTuning();
        this.setDifficulty(opts.difficulty ?? 'normal');

        this._aiState = 'approach';
        this._stateTimer = 0;
        this._reactionTimer = 0;
        this._retreatTimer = 0;
        this._blockHold = 0; // frames to hold the block (move-away) direction
        this._prevOpponentHealth = opponent.health;
        this._prevOpponentState = 'idle';
        this._comboTimer = 0;
    }

    //  Difficulty 

    /** Returns the VirtualInput buffer for the current frame. */
    getInput() { return this._input; }

    setDifficulty(level) {
        // Merge: defaults → character config → difficulty-specific overrides
        this._applyCharacterTuning();
        const diffOverrides = this._characterConfig.ai?.[level] ?? {};
        Object.assign(this._tuning, diffOverrides);
        if (level === 'boss') {
            // Boss-specific tuning layered on top of hard
            Object.assign(this._tuning, {
                preferredRange: 60,
                blockProbability: 0.9,
                reactionDelay: 1,
                mistakeChance: 0.0,
                aggressionMult: 2.2,
                comboWindow: 40,
            });
        }
    }

    /** Apply the character config's `ai` block (non-difficulty-specific keys). */
    _applyCharacterTuning() {
        const aiCfg = this._characterConfig.ai ?? {};
        const { easy, normal, hard, boss, ...base } = aiCfg;
        Object.assign(this._tuning, base);
    }

    reset() {
        this._aiState = 'approach';
        this._stateTimer = 0;
        this._reactionTimer = 0;
        this._retreatTimer = 0;
        this._blockHold = 0;
        this._prevOpponentHealth = this.opponent.health;
        this._prevOpponentState = 'idle';
        this._releaseAll();
    }

    //  Main update 

    update() {
        const f = this.fighter;
        const p = this.opponent;
        const t = this._tuning;

        if (f.state === 'ko') return;
        if (['attack_startup', 'attack_active', 'attack_recovery', 'grab', 'super'].includes(f.state)) return;
        if (f.state === 'hitstun' && f.stunTimer > 0) return;
        if (f.state === 'jump_rise' || f.state === 'jump_fall') return;

        this._stateTimer++;
        if (this._reactionTimer > 0) this._reactionTimer--;
        if (this._retreatTimer > 0) this._retreatTimer--;

        // Detect landed hit → open combo window
        if (p.health < this._prevOpponentHealth) {
            this._comboTimer = t.comboWindow;
        }
        this._prevOpponentHealth = p.health;

        // Difficulty-based mistake chance
        if (Math.random() < t.mistakeChance) return;

        const dx = p.x - f.x;
        const absDx = Math.abs(dx);
        // Body-aware spacing: two fighters standing adjacent are ~250px apart
        // centre-to-centre, so range checks use the gap between the body boxes
        // (0 = touching) instead of raw centre distance.
        const gap = Math.max(0, absDx - (f.width + p.width) / 2);
        const panicking = f.health / f.maxHealth < 0.3;

        const opponentAttacking = ['attack_startup', 'attack_active'].includes(p.state);
        const opponentAirborne = p.state === 'jump_rise' || p.state === 'jump_fall';

        //  Choose AI state 

        if (opponentAirborne && gap < t.preferredRange + 40 && Math.random() < t.antiAirChance) {
            this._transitionTo('air');
        } else if (opponentAttacking && gap < t.preferredRange + 30 && !panicking) {
            this._transitionTo('defensive');
        } else if (p.state === 'attack_recovery' && gap < t.preferredRange + 40) {
            this._transitionTo('punish');
        } else if ((this._comboTimer > 0 || gap <= t.preferredRange) && !panicking) {
            this._transitionTo('pressure');
        } else if (gap > t.preferredRange) {
            if (!panicking && this._retreatTimer > 0) this._transitionTo('retreat');
            else this._transitionTo('approach');
        }

        //  Execute current AI state 

        switch (this._aiState) {
            case 'approach': this._doApproach(f, dx, gap); break;
            case 'pressure': this._doPressure(f, dx, gap); break;
            case 'defensive': this._doDefensive(f, dx); break;
            case 'retreat': this._doRetreat(f, dx); break;
            case 'punish': this._doPunish(f, dx, gap); break;
            case 'air': this._doAir(f, dx); break;
        }

        // (Facing is owned by Game._updateFighters — both fighters always face
        // their opponent, so the AI never needs to manage facing itself.)

        // Sync virtual input update for justPressed detection
        this._input.update();
    }

    _transitionTo(newState) {
        if (this._aiState !== newState) {
            this._aiState = newState;
            this._stateTimer = 0;
        }
    }

    _releaseAll() {
        this._input.up('moveLeft');
        this._input.up('moveRight');
        this._input.up('jump');
        this._input.up('crouch');
        this._input.up('lightPunch');
        this._input.up('heavyPunch');
        this._input.up('kick');
        this._input.up('grab');
        this._input.up('super');
    }

    //  AI state behaviours — all emit actions via VirtualInput 

    _doApproach(f, dx, absDx) {
        const t = this._tuning;

        if (Math.random() < t.jumpProbability && f.onGround) {
            this._releaseAll();
            this._input.down(dx > 0 ? 'moveRight' : 'moveLeft');
            this._input.down('jump');
            return;
        }

        this._releaseAll();
        this._input.down(dx > 0 ? 'moveRight' : 'moveLeft');
    }

    /** Max body-gap at which attack hitboxes still connect with the hurtbox.
     *  Cores are contact-accurate now: normal attacks reach ~10px past the
     *  opponent's core at body contact, so the AI closes to near-touching. */
    static ATTACK_CONTACT_GAP = 4;

    _doPressure(f, dx, gap) {
        const t = this._tuning;

        if (f.attackCooldown > 0) {
            this._releaseAll();
            return;
        }

        // Out of contact range → walk in first (attacking from preferredRange
        // only whiffs in front of the opponent).
        if (gap > AIController.ATTACK_CONTACT_GAP) {
            this._releaseAll();
            this._input.down(dx > 0 ? 'moveRight' : 'moveLeft');
            return;
        }

        const attack = this._choosePressureAttack(gap);
        if (attack) {
            this._releaseAll();
            this._input.down(MOVE_TO_ACTION[attack] ?? attack);
        } else {
            this._releaseAll();
        }

        // Super usage: full meter + opponent in hitstun → slam them
        if (f.superMeter >= 100 && this._opponentInHitstun()) {
            this._releaseAll();
            this._input.down('super');
            return;
        }
    }

    _doDefensive(f, dx) {
        const t = this._tuning;
        if (this._reactionTimer > 0) return;

        // Hold back (away from opponent) to block — crouch to block lows
        if (Math.random() < t.blockProbability && f.onGround) {
            this._releaseAll();
            this._input.down(dx > 0 ? 'moveLeft' : 'moveRight'); // hold back
            if (Math.random() < 0.35) this._input.down('crouch');
            this._blockHold = 20;
        } else {
            this._releaseAll();
            this._input.down(dx > 0 ? 'moveLeft' : 'moveRight');
            this._input.down('jump');
            this._retreatTimer = 30;
        }
        this._reactionTimer = t.reactionDelay;
    }

    _doRetreat(f, dx) {
        this._releaseAll();
        this._input.down(dx > 0 ? 'moveLeft' : 'moveRight');
    }

    _doPunish(f, dx, gap) {
        if (f.attackCooldown > 0) {
            this._releaseAll();
            return;
        }
        // Walk into contact range first — a punish launched at 130px away whiffs
        if (gap > AIController.ATTACK_CONTACT_GAP) {
            this._releaseAll();
            this._input.down(dx > 0 ? 'moveRight' : 'moveLeft');
            return;
        }
        const punishMove = this._aiAttacks().find(a => a.aiPunish)
            ?? this._aiAttacks().find(a => a.name === 'straight')
            ?? this._aiAttacks()[0];
        if (punishMove) {
            this._releaseAll();
            this._input.down(MOVE_TO_ACTION[punishMove.name] ?? punishMove.name);
        }
    }

    _doAir(f, dx) {
        // Anti-air: jump toward the airborne opponent and throw an air attack
        this._releaseAll();
        this._input.down(dx > 0 ? 'moveRight' : 'moveLeft');
        this._input.down('jump');
        this._input.down('lightPunch');
    }

    _opponentInHitstun() {
        const p = this.opponent;
        return (p.state === 'hitstun' && p.stunTimer > 0) || p.state === 'ko';
    }

    //  Attack selection 

    _aiAttacks() {
        return this.fighter.attacks.filter(a => a.allowAI !== false);
    }

    _choosePressureAttack(absDx) {
        const t = this._tuning;

        const pool = this._aiAttacks()
            .filter(a => !a.aiAirOnly)
            // Random pressure attacks never pick grab or super — those come
            // from dedicated AI decisions (punish / desperation), not roulette.
            .filter(a => a.name !== 'grab' && a.name !== 'super')
            .sort((a, b) => (a.aiPriority ?? Infinity) - (b.aiPriority ?? Infinity));
        if (pool.length === 0) return null;

        const roll = Math.random() * t.aggressionMult;
        for (const a of pool) {
            if (roll < (a.aiPriority ?? Infinity)) return a.name;
        }
        return pool[pool.length - 1].name;
    }
}

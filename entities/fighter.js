import { CONFIG, MOVES, COMBO_CHAINS } from '../configs/config.js';
import Hitbox from './hitbox.js';
import { createStateMachine } from '../core/stateMachine.js';
import { FIGHTER_STATES } from './fighterStates.js';

/**
 * Fighter — a playable or AI-controlled character, built from one character
 * config (configs/characters/*.js). Gameplay state lives in a generic
 * state machine (core/stateMachine.js + entities/fighterStates.js).
 *
 * The fighter owns no rendering concerns beyond drawing its own sprite, and it
 * never touches audio or input directly — sound is emitted as `sfx` events on
 * the optional EventBus (`bus`). Its AnimationController is injected (built by
 * CharacterFactory) so the fighter stays ignorant of asset keys.
 */
export default class Fighter {
    /**
     * @param {{
     *   character: object,
     *   x: number,
     *   y: number,
     *   animController?: import('../render/animationController.js').AnimationController|null,
     *   bus?: import('../core/eventBus.js').default,
     * }} cfg
     */
    constructor({ character, x, y, animController, bus }) {
        this.id = character.id;
        this.displayName = character.displayName;
        this._character = character;

        this.x = x;
        this.y = y;
        this.width = character.physics.width;
        this.height = character.physics.height;
        this._baseMaxHealth = character.physics.maxHealth;
        this._statMultipliers = { maxHealth: 1, damage: 1, walkSpeed: 1, jump: 1, meterGain: 1 };
        this.maxHealth = this._baseMaxHealth * this._statMultipliers.maxHealth;
        this.health = this.maxHealth;

        this.attacks = character.attacks;
        this.facingRight = character.start?.facingRight ?? true;

        // Physics
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;

        // Combat timers
        this.stunTimer = 0;
        this.attackCooldown = 0;
        this.blockHitTimer = 0;

        // Current attack being executed
        this.currentAttack = null;
        this.hitboxSpawned = false;

        // Visual feedback
        this.flashTimer = 0;      // frames remaining for hit-flash
        this.lastHitDamage = 0;   // stored so consumers can spawn a floating text

        /** @type {Hitbox|null} — set by _spawnHitbox, consumed by CombatSystem each frame */
        this.pendingHitbox = null;

        this._bus = bus;

        // State machine
        this.stateTimer = 0;
        this._fsm = createStateMachine(FIGHTER_STATES, 'idle', this);

        // Animation (injected; null → no-op fallback used when assets unavailable)
        this._animController = animController ?? this._fallbackAnimController();

        // Combat state derived from input (set every frame in update())
        this._moveDir = 0;        // -1 | 0 | 1  (movement axis)
        this._inputDir = 'neutral'; // 'neutral' | 'forward' | 'back' | 'down' (attack axis)
        this._crouchHeld = false;
        this._blocking = false;
        this._blockCrouch = false;
        this._justPunchPressed = false;
        this._justGrabPressed = false;
        this._justSuperPressed = false;

        // Meter / combo / special combat state
        this.superMeter = 0;
        this.guardMeter = CONFIG.guardMeterMax;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.comboOwner = null;
        this.comboQueuedMove = null;

        // Invincibility / special timers
        this.invincibleTimer = 0;
        this._grabMash = 0;
    }

    /** A no-op animation controller used when assets are unavailable. Falls back to a procedural stickman. */
    _fallbackAnimController() {
        const self = this;
        return {
            current: 'idle',
            setAnimation: () => { },
            update: () => { },
            draw(ctx, x, y, w, h, facingRight = true, drawOffsetY) {
                const color = self._character.spriteColor ?? '#e879f9';
                const cy = y + (drawOffsetY ?? 70);
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x + w / 2, cy + 12, 11, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x + w / 2, cy + 22);
                ctx.lineTo(x + w / 2, cy + 68);
                ctx.stroke();
                const arm = (side) => {
                    const sx = side === 'L' ? x + 14 : x + w - 14;
                    const ex = side === 'L' ? x + 30 : x + w - 30;
                    ctx.beginPath();
                    ctx.moveTo(sx, cy + 34);
                    ctx.lineTo(ex, cy + 44);
                    ctx.stroke();
                };
                arm('L');
                arm('R');
            },
            drawFlash(ctx, x, y, w, h, facingRight, drawOffsetY, alpha) {
                this.draw(ctx, x, y, w, h, facingRight, drawOffsetY);
            },
        };
    }

    //  Public API 

    get state() { return this._fsm.state; }

    /** Direct transition — used by the AI to force states (jump, block, walk…). */
    enterState(next) { this._fsm.setState(next); }

    /**
     * Apply stat multipliers (per-difficulty enemy scaling). Unknown keys are
     * ignored; the player keeps 1x by never calling this. Recomputes maxHealth
     * and refreshes health to full.
     * @param {object} mults
     */
    setStatMultipliers(mults = {}) {
        for (const key of Object.keys(this._statMultipliers)) {
            if (typeof mults[key] === 'number') {
                this._statMultipliers[key] = mults[key];
            }
        }
        this.maxHealth = Math.round(this._baseMaxHealth * this._statMultipliers.maxHealth);
        this.health = this.maxHealth;
        this.superMeter = Math.min(CONFIG.superMeterMax, this.superMeter);
        this.guardMeter = CONFIG.guardMeterMax;
    }

    /** Scaled walk speed in px/frame. */
    getWalkSpeed() {
        return CONFIG.walkSpeed * this._statMultipliers.walkSpeed;
    }

    /** Scaled jump velocity in px/frame (negative = upward). */
    getJumpVelocity() {
        return CONFIG.jumpVelocity * this._statMultipliers.jump;
    }

    /** Scaled damage multiplier for this fighter. */
    getDamageMultiplier() {
        return this._statMultipliers.damage;
    }

    /** Scaled SHAKTI meter gain per landed hit. */
    getMeterGainMultiplier() {
        return this._statMultipliers.meterGain;
    }

    /**
     * Start an attack: stores it as currentAttack and enters startup.
     * @param {string} attackName
     */
    startAttack(attackName) {
        const atk = this.attacks.find(a => a.name === attackName);
        if (!atk) {
            console.warn(`[Fighter] Attack "${attackName}" not found`);
            return null;
        }
        this.currentAttack = atk;
        this.enterState('attack_startup');
        return atk;
    }

    /**
     * Start the attack bound to an input action via the character's `controls`
     * map, resolving direction modifiers (neutral / forward / down) exactly as
     * the player/AI input dictated (e.g. →+J = dash punch, ↓+K = sweep).
     * @param {string} action — input action name ('lightPunch', 'heavyPunch', 'kick', 'grab', 'super'…)
     * @param {string} [dir]  — 'neutral' | 'forward' | 'back' | 'down'
     * @returns {object|null} the chosen attack, or null when none is mapped
     */
    startAttackForAction(action, dir = 'neutral') {
        const mapped = this._character.controls?.[action] ?? action;
        let name = mapped;

        if (!this.onGround) {
            // Air: punch/kick inputs become air attacks
            name = { jab: 'airPunch', straight: 'airPunch', kick: 'airPunch', airPunch: 'airPunch' }[mapped] ?? mapped;
        } else if (dir === 'forward') {
            // → + action = forward special (dash punch / dash kick)
            const fwd = { jab: 'dashPunch', dashPunch: 'dashPunch', straight: 'dashPunch', kick: 'dashKick', sweep: 'sweep', grab: 'grab', super: 'super', lowPunch: 'dashPunch', airPunch: 'airPunch' };
            name = fwd[mapped] ?? mapped;
        } else if (dir === 'down') {
            // ↓ + action = low special (low punch / sweep)
            const down = { jab: 'lowPunch', straight: 'lowPunch', kick: 'sweep', sweep: 'sweep', lowPunch: 'lowPunch', grab: 'grab', super: 'super', dashPunch: 'lowPunch', dashKick: 'sweep' };
            name = down[mapped] ?? mapped;
        }

        if (name === 'grab') { this.startGrab(); return null; }
        if (name === 'super') { this.startSuper(); return null; }

        const atk = this.attacks.find(a => a.name === name);
        if (!atk) {
            console.warn(`[Fighter] No attack "${name}" for action "${action}"`);
            return null;
        }
        return this.startAttack(atk.name);
    }

    /** Start a grab (command grab). */
    startGrab() {
        this.enterState('attack_startup');
        this.currentAttack = this.attacks.find(a => a.name === 'grab') ?? null;
        if (this.currentAttack) {
            this._bus?.emit('sfx', { sound: 'grab', actor: this.id });
        }
    }

    /** Start an attack by its move name (used by the automatic combo chain). */
    startAttackByMoveName(moveName) {
        const move = this.attacks?.find(a => a.name === moveName);
        if (!move) return 'idle';
        if (moveName === 'grab') { this.startGrab(); return 'attack_startup'; }
        if (moveName === 'super') { this.startSuper(); return 'attack_startup'; }
        if (moveName === 'rising') { this.startRisingAttack(); return 'attack_startup'; }
        const action = {
            jab: 'lightPunch', dashPunch: 'lightPunch', lowPunch: 'lightPunch',
            straight: 'heavyPunch', airPunch: 'lightPunch',
            kick: 'kick', dashKick: 'kick', sweep: 'kick',
            grab: 'grab', super: 'super', rising: 'lightPunch',
        }[moveName] ?? 'lightPunch';
        const dir = moveName === 'lowPunch' ? 'down' : 'neutral';
        this.startAttackForAction(action, dir);
        return 'attack_startup';
    }

    /** Trigger the super (SHAKTI) — only callable with a full meter. */
    startSuper() {
        if (this.superMeter < CONFIG.superMeterMax) return null;
        const atk = this.attacks.find(a => a.name === 'super');
        this.superMeter = 0;
        this.currentAttack = atk ?? MOVES.super;
        this.invincibleTimer = this.currentAttack?.startup ?? MOVES.super.startup;
        this.enterState('attack_startup');
        // Cinematic super cue (screen flash + sfx handled by Game over combat:hit)
        this._bus?.emit('sfx', { sound: 'super', actor: this.id });
        return this.currentAttack;
    }

    /** Quick-rise attack used during the wakeup invincibility window. */
    startRisingAttack() {
        const atk = this.attacks.find(a => a.name === 'rising') ?? MOVES.rising;
        return this.startAttack(atk.name);
    }

    /**
     * Advance the fighter by one frame.
     * `input` is null for the AI-controlled fighter (the AIController drives
     * the state machine directly via enterState / startAttack).
     * @param {import('../input/inputHandler.js').default|null} [input]
     */
    update(input = null) {
        this._decrementTimers();

        // Derive per-frame combat input state
        if (input) {
            this._justPunchPressed = false;
            this._justGrabPressed = false;
            this._justSuperPressed = false;

            this._moveDir = input.isDown('moveLeft') ? -1 : (input.isDown('moveRight') ? 1 : 0);
            const forward = this.facingRight ? this._moveDir > 0 : this._moveDir < 0;
            const back = this.facingRight ? this._moveDir < 0 : this._moveDir > 0;
            this._crouchHeld = !!input.isDown('crouch');
            this._inputDir = !this.onGround && this._crouchHeld
                ? 'down'
                : forward ? 'forward'
                : back ? 'back'
                : 'neutral';

            const heldBlock = back; // hold back to block
            this._blocking = this.onGround && !!input && heldBlock;
            this._blockCrouch = this._blocking && this._crouchHeld;

            this._justPunchPressed = !!(input.justPressed('lightPunch') || input.justPressed('heavyPunch') || input.justPressed('kick'));
            this._justGrabPressed = !!input.justPressed('grab');
            this._justSuperPressed = !!input.justPressed('super');
        }

        // Guard meter slowly regenerates while not actively blocking or broken
        if (this.state !== 'block' && this.state !== 'guard_break') {
            this.guardMeter = Math.min(CONFIG.guardMeterMax, this.guardMeter + CONFIG.guardMeterRegen);
        }

        // Hitstun overrides everything
        if (this.stunTimer > 0) {
            if (this._fsm.state !== 'hitstun') this.enterState('hitstun');
        } else {
            this._fsm.update(input);
        }

        this._applyPhysics();
        this._updateAnimation();
    }

    //  Timers 

    _decrementTimers() {
        if (this.stunTimer > 0) this.stunTimer--;
        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.blockHitTimer > 0) this.blockHitTimer--;
        if (this.flashTimer > 0) this.flashTimer--;
        if (this.invincibleTimer > 0) this.invincibleTimer--;
    }

    //  Attack 

    _spawnHitbox(atk) {
        const dmgMult = this._statMultipliers.damage;
        const gainMult = this._statMultipliers.meterGain;
        this.pendingHitbox = new Hitbox({
            owner: this,
            offsetX: atk.offsetX,
            offsetY: atk.offsetY,
            width: atk.width,
            height: atk.height,
            damage: atk.damage * dmgMult,
            knockbackX: atk.knockbackX * dmgMult,
            knockbackY: atk.knockbackY * dmgMult,
            durationFrames: atk.active,
        });
        this._bus?.emit('sfx', { sound: 'punch', actor: this.id });
    }

    //  Physics 

    /**
     * Separate two fighters standing inside each other's body boxes (no
     * pass-through). Called once per frame after both fighters update.
     * KO'd fighters are excluded so corpses can be walked over. Uses exact
     * separation so wall-clamps can't let bodies drift through each other.
     */
    static resolveBodyOverlap(a, b) {
        if (!a || !b || a.state === 'ko' || b.state === 'ko') return;
        const vOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (vOverlap <= 0) return;
        const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        if (overlap <= 0) return;

        // Identify the left/right fighter by box centre
        const aLeft = (a.x + a.width / 2) < (b.x + b.width / 2);
        const left = aLeft ? a : b;
        const right = aLeft ? b : a;

        // Exact separation: park `left` flush against `right`; if the left
        // fighter is pinned by the arena wall, push `right` out instead.
        const desiredLeft = right.x - left.width;
        if (desiredLeft <= 0) {
            left.x = 0;
            const minRight = left.width;
            if (right.x < minRight) right.x = minRight;
        } else {
            left.x = desiredLeft;
        }
        // Keep both inside the arena afterwards
        left.x = Math.max(0, Math.min(CONFIG.canvasWidth - left.width, left.x));
        right.x = Math.max(0, Math.min(CONFIG.canvasWidth - right.width, right.x));
    }

    _applyPhysics() {
        this.vy += CONFIG.gravity;
        this.x += this.vx;
        this.y += this.vy;

        // Ground
        if (this.y + this.height >= CONFIG.groundY) {
            this.y = CONFIG.groundY - this.height;
            this.vy = 0;
            this.onGround = true;
            if (this._fsm.state === 'jump_fall') this.enterState('idle');
        } else {
            this.onGround = false;
        }

        // Arena walls
        this.x = Math.max(0, Math.min(CONFIG.canvasWidth - this.width, this.x));
    }

    //  Hurtbox 

    getHurtboxBounds() {
        const animKey = this._animController.current;
        const animCfg = this._character.sprites?.[animKey];
        if (!animCfg?.hurtbox) {
            // Fallback: use full bounding box
            return { x: this.x, y: this.y, width: this.width, height: this.height };
        }
        const { offsetY, width, height } = animCfg.hurtbox;
        // Horizontally centered on the fighter: the character art (sprite or
        // procedural stickman) is centered in its bounding box, so the
        // hittable core must be too — a slab spanning the full box makes hits
        // register far outside the visible body.
        const cx = this.x + this.width / 2;
        return { x: cx - width / 2, y: this.y + offsetY, width, height };
    }

    //  Animation 

    _updateAnimation() {
        let key = 'idle';
        if (this.blockHitTimer > 0) {
            key = 'blockHit';
        } else {
            switch (this._fsm.state) {
                case 'idle': key = 'idle'; break;
                case 'walk': key = 'walk'; break;
                case 'jump_rise':
                case 'jump_fall': key = 'jump'; break;
                case 'block': key = 'block'; break;
                case 'hitstun': key = 'hit'; break;
                case 'ko': key = 'ko'; break;
                case 'attack_startup':
                case 'attack_active':
                case 'attack_recovery':
                case 'super':
                case 'grab': key = this.currentAttack?.animKey ?? 'idle'; break;
                case 'knockdown': key = 'ko'; break;
                case 'wakeup': key = 'idle'; break;
                case 'grabbed': key = 'hit'; break;
                case 'guard_break': key = 'hit'; break;
            }
        }
        this._animController.setAnimation(key);
        this._animController.update();
    }

    //  Rendering (delegated to the AnimationController — no canvas logic here)

    draw(ctx) {
        this._animController.draw(ctx, this.x, this.y, this.width, this.height, this.facingRight);

        // Hit flash — white tint drawn over the sprite
        if (this.flashTimer > 0) {
            this._animController.drawFlash(
                ctx,
                this.x,
                this.y,
                this.width,
                this.height,
                this.facingRight,
                undefined,
                (this.flashTimer / 10) * 0.65,
            );
        }
    }

    //  Hit reception 

    /**
     * Called when this fighter is struck by a hitbox.
     * @param {number} damage
     * @param {number} kbX  — knockback X (already direction-adjusted)
     * @param {number} kbY  — knockback Y
     * @returns {{ blocked: boolean, damage: number }} the damage actually applied
     */
    takeHit(damage, kbX, kbY) {
        if (this.state === 'block') {
            const reducedDmg = damage * CONFIG.blockDamageReduction;
            this.health = Math.max(0, this.health - reducedDmg);
            this.vx = kbX * CONFIG.blockKnockbackReduction;
            this.vy = 0;
            this.stunTimer = CONFIG.blockStunFrames;
            this.blockHitTimer = CONFIG.blockHitFrames;
            this.lastHitDamage = reducedDmg;
            // Blocked hits also chip the guard meter (break → guard_break stun)
            this.guardMeter = Math.max(0, this.guardMeter - CONFIG.guardHitDrain);
            this.enterState('block');
            return { blocked: true, damage: reducedDmg };
        }
        if (this.state === 'grabbed') {
            // Victim of a command grab — mash to tech
            this.stunTimer = Math.max(this.stunTimer, MOVES.grab.hitstun);
            this.lastHitDamage = damage;
            return { blocked: false, damage };
        }
        if (this.invincibleTimer > 0) {
            // Invincible (super startup, wakeup reversal window) — no damage
            return { blocked: false, damage: 0, invincible: true };
        }
        this.health = Math.max(0, this.health - damage);
        this.vx = kbX;
        this.vy = kbY;
        this.flashTimer = 10;
        this.lastHitDamage = damage;

        if (this.health <= 0) {
            this.enterState('ko');
        } else {
            this.stunTimer = CONFIG.hitStunFrames;
            this.enterState('hitstun');
        }
        return { blocked: false, damage };
    }

    /** Called on the attacker side when a hit lands (unblocked). */
    registerHit(attacker, damage) {
        // combo bookkeeping lives on the attacker
        const f = attacker;
        const atk = f.currentAttack;
        const hitIndex = f.comboCount; // 0-based index of this hit in the chain
        const scale = hitIndex === 0
            ? 1
            : Math.max(CONFIG.comboDamageFloor, 1 - CONFIG.comboDamageStep * (hitIndex - 1));
        f.comboCount = hitIndex + 1;
        f.comboTimer = CONFIG.comboWindowFrames;
        f.comboOwner = f;

        const chain = atk ? (COMBO_CHAINS[atk.name] ?? []) : [];
        const nextMove = chain[hitIndex + 1];
        f.comboQueuedMove = nextMove ?? null;

        const gain = Math.round(damage * f.getMeterGainMultiplier());
        f.superMeter = Math.min(CONFIG.superMeterMax, f.superMeter + gain);
        return scale;
    }

    /** Reset the combo counter (round start / blocked hit / whiff). */
    resetCombo() {
        this.comboCount = 0;
        this.comboTimer = 0;
        this.comboOwner = null;
        this.comboQueuedMove = null;
    }

    //  Reset 

    reset(startX) {
        this.x = startX;
        this.y = CONFIG.groundY - this.height;
        this.vx = 0;
        this.vy = 0;
        this.health = this.maxHealth;
        this.stunTimer = 0;
        this.attackCooldown = 0;
        this.blockHitTimer = 0;
        this.flashTimer = 0;
        this.currentAttack = null;
        this.pendingHitbox = null;
        this.enterState('idle');
        this.superMeter = 0;
        this.guardMeter = CONFIG.guardMeterMax;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.comboOwner = null;
        this.comboQueuedMove = null;
        this.invincibleTimer = 0;
        this._grabMash = 0;
        this._moveDir = 0;
        this._inputDir = 'neutral';
        this._crouchHeld = false;
        this._blocking = false;
        this._blockCrouch = false;
        this._justPunchPressed = false;
        this._justGrabPressed = false;
        this._justSuperPressed = false;
    }
}

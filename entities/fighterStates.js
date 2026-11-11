/**
 * FIGHTER_STATES — pure state definitions for `createStateMachine`.
 *
 * States: idle | walk | jump_rise | jump_fall | block | attack_startup |
 *         attack_active | attack_recovery | grab | hitstun | ko | knockdown |
 *         wakeup | grabbed | guard_break
 *
 * Transitions:
 *   idle → walk | block | jump_rise | attack_startup
 *   walk → idle | block | jump_rise | attack_startup
 *   jump_rise → jump_fall | attack_startup (air)
 *   jump_fall → idle (on landing) | attack_startup (air)
 *   block → idle | walk | jump_rise
 *   attack_startup → attack_active → attack_recovery → idle
 *   grab → attack_active → attack_recovery → idle   (command grab resolution)
 *   (any) → hitstun (forced by Fighter.update while stunTimer > 0)
 *   (any) → ko
 *   knockdown → wakeup → idle
 *   grabbed → hitstun | idle (mash tech / hold expiry)
 *   guard_break → idle
 *   (any) → guard_break (when guard meter empties while blocking)
 *
 * Every `update` returns the next state name (or null to stay). Methods that
 * start an attack return the target state directly (e.g. 'attack_startup').
 */

import { CONFIG } from '../configs/config.js';

const resetTimer = ctx => { ctx.stateTimer = 0; };

export const FIGHTER_STATES = {
    idle: {
        enter: resetTimer,
        update(ctx, input) {
            ctx.vx = 0;
            if (!input) return null;

            // NOTE: facing is owned by the Game (always toward the opponent),
            // never by walking direction.
            if (ctx._blocking) return 'block';
            if (ctx._moveDir < 0 || ctx._moveDir > 0) return 'walk';
            if (input.justPressed('jump') && ctx.onGround) return 'jump_rise';

            if (ctx._justPunchPressed && ctx.attackCooldown === 0) { ctx.startAttackForAction('lightPunch', ctx._inputDir); return 'attack_startup'; }
            if (ctx._justGrabPressed && ctx.attackCooldown === 0) { ctx.startAttackForAction('grab', 'neutral'); return 'attack_startup'; }
            if (ctx._justSuperPressed) { const atk = ctx.startSuper(); if (atk) return 'attack_startup'; }

            // Automatic combo follow-up (generous cancel window)
            if (ctx.comboQueuedMove && ctx.attackCooldown === 0) {
                const moveName = ctx.comboQueuedMove;
                ctx.comboQueuedMove = null;
                return ctx.startAttackByMoveName(moveName);
            }
            return null;
        },
    },

    walk: {
        enter: resetTimer,
        update(ctx, input) {
            if (!input) return null;

            if (ctx._blocking) {
                ctx.vx = 0;
                return 'block';
            }
            if (ctx._moveDir < 0) { ctx.vx = -ctx.getWalkSpeed(); }
            else if (ctx._moveDir > 0) { ctx.vx = ctx.getWalkSpeed(); }
            else return 'idle';

            if (input.justPressed('jump') && ctx.onGround) return 'jump_rise';

            if (ctx._justPunchPressed && ctx.attackCooldown === 0) { ctx.startAttackForAction('lightPunch', ctx._inputDir); return 'attack_startup'; }
            if (ctx._justGrabPressed && ctx.attackCooldown === 0) { ctx.startAttackForAction('grab', 'neutral'); return 'attack_startup'; }
            if (ctx._justSuperPressed) { const atk = ctx.startSuper(); if (atk) return 'attack_startup'; }

            if (ctx.comboQueuedMove && ctx.attackCooldown === 0) {
                const moveName = ctx.comboQueuedMove;
                ctx.comboQueuedMove = null;
                return ctx.startAttackByMoveName(moveName);
            }
            return null;
        },
    },

    jump_rise: {
        enter(ctx) {
            ctx.stateTimer = 0;
            ctx.vy = ctx.getJumpVelocity();
            ctx.onGround = false;
            ctx._bus?.emit('sfx', { sound: 'jump', actor: ctx.id });
        },
        update(ctx, input) {
            if (ctx.vy >= 0) return 'jump_fall';
            if (input && input.justPressed('lightPunch') && ctx.attackCooldown === 0) {
                return ctx.startAttackForAction('lightPunch', ctx._inputDir);
            }
            if (input && input.justPressed('heavyPunch') && ctx.attackCooldown === 0) {
                return ctx.startAttackForAction('heavyPunch', ctx._inputDir);
            }
            if (input && input.justPressed('kick') && ctx.attackCooldown === 0) {
                return ctx.startAttackForAction('kick', ctx._inputDir);
            }
            if (input && input.justPressed('grab') && ctx.attackCooldown === 0) {
                return ctx.startAttackForAction('grab', 'neutral');
            }
            if (input && input.justPressed('super')) { const atk = ctx.startSuper(); if (atk) return 'attack_startup'; }
            return null;
        },
    },

    jump_fall: {
        enter: resetTimer,
        update(ctx, input) {
            if (!input) return null;
            if (input.isDown('moveLeft')) { ctx.vx = -ctx.getWalkSpeed(); }
            else if (input.isDown('moveRight')) { ctx.vx = ctx.getWalkSpeed(); }
            else ctx.vx = 0;

            if (input.justPressed('lightPunch') && ctx.attackCooldown === 0) {
                return ctx.startAttackForAction('lightPunch', ctx._inputDir);
            }
            if (input && input.justPressed('heavyPunch') && ctx.attackCooldown === 0) {
                return ctx.startAttackForAction('heavyPunch', ctx._inputDir);
            }
            if (input && input.justPressed('kick') && ctx.attackCooldown === 0) {
                return ctx.startAttackForAction('kick', ctx._inputDir);
            }
            if (input && input.justPressed('grab') && ctx.attackCooldown === 0) {
                return ctx.startAttackForAction('grab', 'neutral');
            }
            if (input && input.justPressed('super')) { const atk = ctx.startSuper(); if (atk) return 'attack_startup'; }
            return null;
        },
    },

    block: {
        enter(ctx) { ctx.stateTimer = 0; ctx.blockHitTimer = 0; },
        update(ctx, input) {
            ctx.vx = 0;
            // Blocking actively drains the guard meter — crouch-blocking is
            // cheaper. Empty meter → guard break (stunned, fully vulnerable).
            ctx.guardMeter = Math.max(0,
                ctx.guardMeter - (ctx._blockCrouch ? CONFIG.guardDrainCrouch : CONFIG.guardDrainStand));
            if (ctx.guardMeter <= 0) { ctx.enterState('guard_break'); return null; }

            if (input && input.justPressed('jump') && ctx.onGround) return 'jump_rise';
            if (ctx._blocking && ctx.onGround) return null; // stay blocking

            if (input?.isDown('moveRight')) return 'walk';
            if (input?.isDown('moveLeft')) return 'walk';
            if (input?.justPressed('jump') && ctx.onGround) return 'jump_rise';
            return 'idle';
        },
    },

    attack_startup: {
        enter(ctx) { ctx.stateTimer = 0; ctx.hitboxSpawned = false; ctx.vx = 0; },
        update(ctx) {
            ctx.stateTimer++;
            const atk = ctx.currentAttack;
            if (!atk) return 'idle';
            if (ctx.stateTimer >= atk.startup) return 'attack_active';
        },
    },

    attack_active: {
        enter: resetTimer,
        update(ctx) {
            ctx.stateTimer++;
            const atk = ctx.currentAttack;
            if (!atk) return 'idle';
            if (!ctx.hitboxSpawned && ctx.stateTimer >= atk.hitFrame) {
                ctx._spawnHitbox(atk);
                ctx.hitboxSpawned = true;
            }
            if (ctx.stateTimer >= atk.active) return 'attack_recovery';
        },
    },

    attack_recovery: {
        enter: resetTimer,
        update(ctx) {
            ctx.stateTimer++;
            const atk = ctx.currentAttack;
            if (!atk) return 'idle';
            if (ctx.stateTimer >= atk.recovery) {
                ctx.attackCooldown = atk.startup + atk.active + atk.recovery + (atk.cooldownExtra ?? 0);
                ctx.currentAttack = null;
                return 'idle';
            }
        },
    },

    grab: {
        enter(ctx) { ctx.stateTimer = 0; },
        update(ctx) {
            ctx.stateTimer++;
            const atk = ctx.currentAttack;
            if (!atk) return 'idle';
            if (ctx.stateTimer >= atk.startup) return 'attack_active';
        },
    },

    hitstun: {
        enter: resetTimer,
        update(ctx) {
            if (ctx.stunTimer <= 0) return 'idle';
        },
    },

    ko: {
        enter(ctx) { ctx.stateTimer = 0; ctx.vx = 0; },
        update(ctx) { ctx.vx = 0; },
    },

    knockdown: {
        enter: resetTimer,
        update(ctx) {
            ctx.stateTimer++;
            if (ctx.stateTimer >= CONFIG.knockdownDurationFrames) {
                ctx.invincibleTimer = CONFIG.wakeupIFrames;
                return 'wakeup';
            }
        },
    },

    wakeup: {
        enter: resetTimer,
        update(ctx, input) {
            if (ctx.invincibleTimer > 0) {
                // Reversal window — allow a quick-rise attack to land
                if (ctx.attackCooldown === 0 && input &&
                    (input.justPressed('lightPunch') || input.justPressed('heavyPunch') || input.justPressed('kick'))) {
                    ctx.invincibleTimer = 0;
                    return ctx.startRisingAttack();
                }
            }
            ctx.stateTimer++;
            if (ctx.stateTimer >= CONFIG.wakeupFrames) {
                ctx.invincibleTimer = 0;
                return 'idle';
            }
        },
    },

    grabbed: {
        enter(ctx) { ctx.stateTimer = 0; ctx._grabMash = 0; },
        update(ctx, input) {
            ctx.stateTimer++;
            if (input) {
                const mashing = input.justPressed('lightPunch') || input.justPressed('heavyPunch') ||
                    input.justPressed('kick') || input.justPressed('grab') || input.justPressed('super');
                if (mashing) ctx._grabMash++;
            }
            if (ctx._grabMash >= 5) {
                // Mash window reached — tech escape
                ctx._grabMash = 0;
                ctx.stunTimer = 0;
                ctx.invincibleTimer = 0;
                return 'idle';
            }
            if (ctx.stateTimer >= 90) {
                // Hold expired — suffer the grab stun
                ctx._grabMash = 0;
                ctx.stunTimer = 20;
                return 'hitstun';
            }
        },
    },

    guard_break: {
        enter: resetTimer,
        update(ctx) {
            ctx.stateTimer++;
            if (ctx.stateTimer >= 30) {
                ctx.enterState('idle');
                ctx.guardMeter = CONFIG.guardMeterMax;
            }
        },
    },
};

export const FIGHTER_STATE_NAMES = Object.freeze(Object.keys(FIGHTER_STATES));

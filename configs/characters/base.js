import { MOVES } from '../config.js';

/**
 * base.js — shared character data used as defaults by every character config.
 *
 * Individual characters (player.js / enemy.js / boss.js) spread these and
 * override only what differs, so giving the enemy a different sprite, hurtbox,
 * attacks, or physics never touches the player.
 *
 * Sprite fields:
 *   frameCount/path/extension/frameDuration/loop — animation metadata
 *   hurtbox — { offsetX, offsetY, width, height } hittable core (offsetX is
 *             legacy; the core is anchored HORIZONTALLY CENTERED on the
 *             fighter, width = core width, so it hugs the visible body).
 *   color — body color for the procedural fallback stickman.
 *
 * Attack fields (frame data lives in ../config.js MOVES):
 *   name, startup, active, recovery, hitFrame, damage, knockbackX/Y,
 *   hitstun, blockStun, offsetX/Y, width/height (hitbox), animKey, cooldownExtra,
 *   hitstop, superMeterGain, knocksDown, armor, aiPriority, aiPunish, aiAirOnly.
 */

/** Base sprite pack shared by all characters by default. */
export const BASE_SPRITES = Object.freeze({
    idle: Object.freeze({
        frameCount:    8, path: 'assets/animations/idle/idle', extension: '.png',
        frameDuration: 10, loop: true,
        hurtbox: { offsetX: 0, offsetY: 180, width: 130, height: 100 },
    }),
    walk: Object.freeze({
        frameCount:    8, path: 'assets/animations/walk/walk', extension: '.png',
        frameDuration: 8, loop: true,
        hurtbox: { offsetX: 0, offsetY: 180, width: 130, height: 100 },
    }),
    jump: Object.freeze({
        frameCount:    5, path: 'assets/animations/jump/jump', extension: '.png',
        frameDuration: 10, loop: false,
        hurtbox: { offsetX: 0, offsetY: 180, width: 130, height: 100 },
    }),
    lightPunch: Object.freeze({
        frameCount:    3, path: 'assets/animations/lightPunch/lightPunch', extension: '.png',
        frameDuration: 6, loop: false,
        hurtbox: { offsetX: 0, offsetY: 180, width: 130, height: 100 },
    }),
    airPunch: Object.freeze({
        frameCount:    2, path: 'assets/animations/airPunch/airPunch', extension: '.png',
        frameDuration: 6, loop: false,
        hurtbox: { offsetX: 0, offsetY: 180, width: 130, height: 100 },
    }),
    hit: Object.freeze({
        frameCount:    4, path: 'assets/animations/hit/hit', extension: '.png',
        frameDuration: 10, loop: false,
        hurtbox: { offsetX: 0, offsetY: 180, width: 130, height: 100 },
    }),
    block: Object.freeze({
        frameCount:    3, path: 'assets/animations/block/block', extension: '.png',
        frameDuration: 10, loop: false,
        hurtbox: { offsetX: 0, offsetY: 180, width: 130, height: 100 },
    }),
    blockHit: Object.freeze({
        frameCount:    1, path: 'assets/animations/blockHit/blockHit', extension: '.png',
        frameDuration: 6, loop: false,
        hurtbox: { offsetX: 0, offsetY: 180, width: 130, height: 100 },
    }),
    ko: Object.freeze({
        frameCount:    10, path: 'assets/animations/ko/ko', extension: '.png',
        frameDuration: 10, loop: false,
        hurtbox: { offsetX: 0, offsetY: 230, width: 130, height: 50 },
    }),
});

/** Default attack set — frame data comes from the central MOVES config. */
export const BASE_ATTACKS = Object.freeze([
    MOVES.jab,
    MOVES.dashPunch,
    MOVES.straight,
    MOVES.lowPunch,
    MOVES.kick,
    MOVES.dashKick,
    MOVES.sweep,
    MOVES.airPunch,
    MOVES.grab,   // command grab — not blockable, mash 5 to tech
    MOVES.super,  // SHAKTI super — gated on a full meter in Fighter.startSuper
]);

/** Default physical dimensions + health shared by all characters. */
export const BASE_PHYSICS = Object.freeze({
    width: 250,
    height: 280,
    maxHealth: 1000, // 900–1100 HP per character
});

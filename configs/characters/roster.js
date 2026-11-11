import { MOVES } from '../config.js';
import { ENEMY_CHARACTER } from './enemy.js';

/** Return a new attack array with per-move overrides (frame data comes from MOVES). */
export function withAttacks(overrides = {}) {
    const out = [];
    for (const atk of [MOVES.jab, MOVES.dashPunch, MOVES.straight, MOVES.lowPunch, MOVES.kick, MOVES.dashKick, MOVES.sweep, MOVES.airPunch, MOVES.grab, MOVES.super]) {
        out.push({ ...atk, ...(overrides[atk.name] ?? {}) });
    }
    return out;
}

const baseChar = {
    sprites: null,
    attacks: null,
    physics: null,
    controls: Object.freeze({
        lightPunch: 'jab',
        heavyPunch: 'straight',
        kick:        'kick',
        sweepKick:   'sweep',
        airPunch:    'airPunch',
        grab:        'grab',
        super:       'super',
    }),
    audio: Object.freeze({
        jump: Object.freeze({ ref: 'jump' }),
        punch: Object.freeze({ ref: 'punch' }),
        hit: Object.freeze({ ref: 'hit' }),
        block: Object.freeze({ ref: 'block' }),
        ko: Object.freeze({ ref: 'ko' }),
        super: Object.freeze({ ref: 'super' }),
        counter: Object.freeze({ ref: 'counter' }),
        grab: Object.freeze({ ref: 'grab' }),
    }),
};

/** KADE — rushdown brawler. High damage output, slightly squishier. */
export const KADE_CHARACTER = Object.freeze({
    ...baseChar,
    id: 'kade',
    displayName: 'Kade',
    sprites: ENEMY_CHARACTER.sprites,
    attacks: withAttacks({
        straight:  { damage: 16, knockbackX: 8, hitstop: 9, superMeterGain: 14 },
        jab:       { damage: 7,  knockbackX: 4,  hitstop: 4,  superMeterGain: 8 },
        kick:      { damage: 10, knockbackX: 6,  hitstop: 6,  superMeterGain: 11 },
        sweep:     { damage: 12, hitstop: 7,  superMeterGain: 12 },
        dashPunch: { damage: 9, knockbackX: 7, hitstop: 6, superMeterGain: 9 },
        dashKick:  { damage: 12, knockbackX: 9, hitstop: 6, superMeterGain: 12 },
    }),
    physics: Object.freeze({ width: 250, height: 280, maxHealth: 950 }),
    spriteColor: '#e879f9',
    start: Object.freeze({ x: 100, facingRight: true }),
});

/** MIRA — footsies / poke specialist. Low damage, high reach and movement. */
export const MIRA_CHARACTER = Object.freeze({
    ...baseChar,
    id: 'mira',
    displayName: 'Mira',
    sprites: ENEMY_CHARACTER.sprites,
    attacks: withAttacks({
        straight: { damage: 12, knockbackX: 6,  hitstop: 8,  superMeterGain: 12 },
        kick:     { damage: 10, knockbackX: 6,  hitstop: 6,  superMeterGain: 10 },
        sweep:    { damage: 11, hitstop: 7,  superMeterGain: 11 },
        jab:      { damage: 6,  knockbackX: 3,  hitstop: 4,  superMeterGain: 7 },
        dashKick: { damage: 10, knockbackX: 7, hitstop: 6, superMeterGain: 10 },
        lowPunch: { damage: 5, knockbackX: 2, hitstop: 4, superMeterGain: 5 },
    }),
    physics: Object.freeze({ width: 250, height: 280, maxHealth: 1000 }),
    spriteColor: '#38bdf8',
    start: Object.freeze({ x: 100, facingRight: true }),
});

/** JIN — balanced all-rounder. */
export const JIN_CHARACTER = Object.freeze({
    ...baseChar,
    id: 'jin',
    displayName: 'Jin',
    sprites: ENEMY_CHARACTER.sprites,
    attacks: withAttacks({}),
    physics: Object.freeze({ width: 250, height: 280, maxHealth: 1000 }),
    spriteColor: '#facc15',
    start: Object.freeze({ x: 100, facingRight: true }),
});

/** SABLE — defensive turtle. Low damage taken, sponges hits. */
export const SABLE_CHARACTER = Object.freeze({
    ...baseChar,
    id: 'sable',
    displayName: 'Sable',
    sprites: ENEMY_CHARACTER.sprites,
    attacks: withAttacks({
        straight: { damage: 11, knockbackX: 6, hitstop: 8, superMeterGain: 11 },
        jab:      { damage: 6,  knockbackX: 3, hitstop: 4, superMeterGain: 7 },
        kick:     { damage: 9,  knockbackX: 5, hitstop: 6, superMeterGain: 9 },
    }),
    physics: Object.freeze({ width: 250, height: 280, maxHealth: 1050 }),
    spriteColor: '#4ade80',
    start: Object.freeze({ x: 100, facingRight: true }),
});

/** ROOK — grappler. High damage, loves grabs, squishier. */
export const ROOK_CHARACTER = Object.freeze({
    ...baseChar,
    id: 'rook',
    displayName: 'Rook',
    sprites: ENEMY_CHARACTER.sprites,
    attacks: withAttacks({
        straight: { damage: 15, knockbackX: 7, hitstop: 9, superMeterGain: 13 },
        jab:      { damage: 7,  knockbackX: 4,  hitstop: 4,  superMeterGain: 8 },
        kick:     { damage: 10, knockbackX: 6,  hitstop: 6,  superMeterGain: 10 },
        sweep:    { damage: 13, hitstop: 7,  superMeterGain: 13 },
        dashPunch: { damage: 9, knockbackX: 7, hitstop: 6, superMeterGain: 9 },
        dashKick:  { damage: 11, knockbackX: 8, hitstop: 6, superMeterGain: 11 },
    }),
    physics: Object.freeze({ width: 250, height: 280, maxHealth: 900 }),
    spriteColor: '#fb7185',
    start: Object.freeze({ x: 100, facingRight: true }),
});

/**
 * Boss — "Atlas", the Colossus. 200 HP, much higher damage, armor on heavy
 * moves and a unique super. Unlocked after 3 consecutive CPU wins.
 */
/** Atlas is much wider (320px) — scale his hittable cores to the 320px body
 *  while keeping the core's NEAR EDGE at the same px-from-body-edge (60) as
 *  every other fighter, so the shared attack reach values stay valid.
 *  coreNear = bodyWidth/2 - coreWidth/2  (60 for a 250px body with a 130px core)
 *  bossCoreWidth = 320 - 2 * coreNear    (200 for a 320px body) */
function bossSprites() {
    const out = {};
    for (const [key, s] of Object.entries(ENEMY_CHARACTER.sprites)) {
        const hb = s.hurtbox ?? { offsetX: 0, offsetY: 180, width: 130, height: 100 };
        const coreNear = 250 / 2 - hb.width / 2;
        out[key] = {
            ...s,
            hurtbox: { ...hb, offsetX: 0, width: Math.round(320 - 2 * coreNear) },
        };
    }
    return out;
}

export const BOSS_CHARACTER = Object.freeze({
    ...baseChar,
    id: 'atlas',
    displayName: 'Atlas',
    sprites: bossSprites(),
    attacks: withAttacks({
        super:      { name: 'super', startup: 14, active: 8, recovery: 24, damage: 80, hitstop: 16, knockbackX: 16, knockbackY: -9, superMeterGain: 0, cooldownExtra: 30 },
        straight:   { name: 'straight', armor: true, startup: 12, active: 5, recovery: 20, damage: 18, knockbackX: 10, hitstop: 10, superMeterGain: 14 },
        jab:        { damage: 9, knockbackX: 5, hitstop: 5, superMeterGain: 9 },
        kick:       { damage: 13, knockbackX: 7, hitstop: 7, superMeterGain: 13 },
        sweep:      { damage: 14, hitstop: 8, superMeterGain: 14 },
        dashKick:   { damage: 14, knockbackX: 10, hitstop: 7, superMeterGain: 14 },
        dashPunch:  { damage: 11, knockbackX: 8, hitstop: 7, superMeterGain: 11 },
    }),
    physics: Object.freeze({ width: 320, height: 340, maxHealth: 200 }),
    spriteColor: '#a78bfa',
    start: Object.freeze({ x: 400, facingRight: false }),
});

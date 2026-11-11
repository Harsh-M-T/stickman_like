import { BASE_SPRITES, BASE_ATTACKS, BASE_PHYSICS } from './base.js';

/**
 * PLAYER_CHARACTER — the human-controlled fighter.
 * Override sprites / attacks / physics here; base.js holds the defaults.
 */
export const PLAYER_CHARACTER = Object.freeze({
    id: 'player',
    displayName: 'Player',

    sprites: BASE_SPRITES,
    attacks: BASE_ATTACKS,
    physics: { ...BASE_PHYSICS },

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

    start: {
        x: 100,
        facingRight: true,
    },
});

/**
 * Central game configuration — the single source of truth for every tunable
 * value in the game (combat frame data, damage, hitstop, meter, rounds, …).
 *
 * Import from here instead of scattering magic numbers across systems.
 * Per-character *content* (stats, move sets, sprites) lives in
 * configs/characters/*.js on top of the shared defaults below.
 *
 * Hitbox geometry (contact-accurate):
 *   offsetX  — reach: px the hitbox extends past the attacker's FRONT edge
 *              (Side facing the opponent). The opponent's hurtbox core is
 *              centered on their body, so its near edge sits at
 *              bodyGap + 60 px from the front edge (130px core on a 250px body).
 *              A punch therefore connects near body contact, not at a distance.
 *   offsetY/width/height — relative to the attacker's bounding box top/left.
 */

export const MOVES = Object.freeze({
    // ——— Punch kit ———
    jab: Object.freeze({
        name:         'jab',
        startup:       3,
        active:        2,
        recovery:     8,
        hitFrame:      1,
        damage:        6,
        knockbackX:    3,
        knockbackY:   -2,
        hitstun:      12,
        blockStun:    6,
        offsetX:      62,
        offsetY:      230,
        width:         40,
        height:        20,
        animKey:      'lightPunch',
        cooldownExtra: 4,
        hitstop:       4,
        superMeterGain: 6,
        comboNext:     'jab',
    }),
    dashPunch: Object.freeze({
        name:         'dashPunch',
        startup:       4,
        active:        5,
        recovery:    12,
        hitFrame:      1,
        damage:        8,
        knockbackX:    6,
        knockbackY:   -3,
        hitstun:      14,
        blockStun:    6,
        offsetX:      90,   // dash tool — reaches deeper
        offsetY:      225,
        width:         45,
        height:        20,
        animKey:      'lightPunch',
        cooldownExtra: 5,
        hitstop:       6,
        superMeterGain: 8,
        comboNext:     'jab',
    }),
    straight: Object.freeze({
        name:         'straight',
        startup:       8,
        active:        4,
        recovery:    16,
        hitFrame:      1,
        damage:        14,
        knockbackX:    7,
        knockbackY:   -4,
        hitstun:      18,
        blockStun:    8,
        offsetX:      72,
        offsetY:      215,
        width:         45,
        height:        22,
        animKey:      'lightPunch',
        cooldownExtra: 7,
        hitstop:       8,
        superMeterGain: 12,
        aiPriority:    0.2,
        aiPunish:      true,
        comboNext:     'straight',
    }),
    lowPunch: Object.freeze({
        name:         'lowPunch',
        startup:       4,
        active:        3,
        recovery:    10,
        hitFrame:      1,
        damage:        5,
        knockbackX:    2,
        knockbackY:   -1,
        hitstun:      10,
        blockStun:    5,
        offsetX:      62,
        offsetY:      248, // low — aimed at the legs
        width:         35,
        height:        14,
        animKey:      'lightPunch',
        cooldownExtra: 4,
        hitstop:       4,
        superMeterGain: 5,
        comboNext:     'lowPunch',
    }),

    // ——— Kick kit ———
    kick: Object.freeze({
        name:         'kick',
        startup:       6,
        active:        3,
        recovery:    14,
        hitFrame:      1,
        damage:        9,
        knockbackX:    5,
        knockbackY:   -3,
        hitstun:      14,
        blockStun:    6,
        offsetX:      68,
        offsetY:      250,
        width:         40,
        height:        18,
        animKey:      'lightPunch',
        cooldownExtra: 6,
        hitstop:       6,
        superMeterGain: 8,
        comboNext:     'kick',
    }),
    dashKick: Object.freeze({
        name:         'dashKick',
        startup:       5,
        active:        5,
        recovery:    14,
        hitFrame:      1,
        damage:        11,
        knockbackX:    8,
        knockbackY:   -4,
        hitstun:      16,
        blockStun:    6,
        offsetX:      90,   // dash tool — reaches deeper
        offsetY:      250,
        width:         40,
        height:        18,
        animKey:      'lightPunch',
        cooldownExtra: 6,
        hitstop:       6,
        superMeterGain: 10,
        comboNext:     'kick',
    }),
    sweep: Object.freeze({
        name:         'sweep',
        startup:       9,
        active:        4,
        recovery:    16,
        hitFrame:      1,
        damage:        10,
        knockbackX:    6,
        knockbackY:   -1,
        hitstun:       0, // knocks down instead of chasing with hitstun
        blockStun:    8,
        offsetX:      66,
        offsetY:      262, // low — aimed at the legs (must stay ≤ hurtbox bottom 280)
        width:         45,
        height:        16,
        animKey:      'lightPunch',
        cooldownExtra: 7,
        hitstop:       7,
        superMeterGain: 10,
        knocksDown:    true,
        comboNext:     null,
    }),

    // ——— Air kit ———
    airPunch: Object.freeze({
        name:         'airPunch',
        startup:       4,
        active:        2,
        recovery:    12,
        hitFrame:      1,
        damage:        6,
        knockbackX:    4,
        knockbackY:   -2,
        hitstun:      12,
        blockStun:    0,
        offsetX:      62,
        offsetY:      260,
        width:         30,
        height:        20,
        animKey:      'airPunch',
        cooldownExtra: 5,
        hitstop:       5,
        superMeterGain: 6,
        aiAirOnly:     true,
    }),

    // ——— Grab (command grab) ———
    grab: Object.freeze({
        name:         'grab',
        startup:       12,
        active:        6,
        recovery:     24,
        hitFrame:      1,
        damage:        12,
        knockbackX:    4,
        knockbackY:   -3,
        hitstun:       20,
        blockStun:     0, // command grabs beat blocking
        offsetX:      64, // hugs the opponent — connects only at near-touching gap
        offsetY:      250,
        width:         45,
        height:        18,
        animKey:      'lightPunch',
        cooldownExtra: 20,
        hitstop:       6,
        superMeterGain: 6,
        comboNext:     null,
    }),

    // ——— Super ———
    super: Object.freeze({
        name:         'super',
        startup:       12,
        active:        6,
        recovery:     20,
        hitFrame:      1,
        damage:        70,
        knockbackX:    14,
        knockbackY:   -8,
        hitstun:      44,
        blockStun:    24,
        offsetX:     110, // super reaches far to punish spacing mistakes
        offsetY:      230,
        width:         60,
        height:        30,
        animKey:      'hit',
        cooldownExtra: 30,
        hitstop:       14,
        superMeterGain: 0, // consumed on activation
    }),

    // ——— Rising attack (performed during wakeup invincibility frames) ———
    rising: Object.freeze({
        name:         'rising',
        startup:       4,
        active:        3,
        recovery:    10,
        hitFrame:      1,
        damage:       10,
        knockbackX:    6,
        knockbackY:   -2,
        hitstun:      20,
        blockStun:    6,
        offsetX:      62,
        offsetY:      230,
        width:         40,
        height:        20,
        animKey:      'lightPunch',
        cooldownExtra: 4,
        hitstop:       6,
        superMeterGain: 8,
        comboNext:     null,
    }),
});

export const CONFIG = Object.freeze({
    // Debug — enable with `?debug` URL param (killswitch + hitbox overlay)
    debug: typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'),

    // Canvas
    canvasWidth:  800,
    canvasHeight: 450,

    // World
    groundY:      310,
    gravity:      0.7,

    // Movement (px / frame @ 60 fps)
    walkSpeed:     3.5,
    jumpVelocity: -13,

    // Combat frame data
    hitStunFrames:          20,
    blockStunFrames:        8,
    blockHitFrames:         6,
    blockDamageReduction:  0.15, // blocked attacks deal 15% of original damage (chip)
    blockKnockbackReduction: 0.2,
    hitstop: Object.freeze({
        light:     4,
        heavy:     8,
        blockHit:  2,
        super:     14,
        counter:   10,
    }),
    counterHitMultiplier: 1.5,

    // Guard / super meter
    guardMeterMax:       100,
    guardDrainStand:    0.4, // per frame while standing block (~4 s of holding)
    guardDrainCrouch:  0.25, // per frame while crouch-blocking (~6.5 s)
    guardHitDrain:        8, // extra guard loss per blocked hit
    guardMeterRegen:      4, // per frame while NOT blocking (idle/walk/etc.)
    superMeterMax:       100,
    superMeterPerHit:    8,  // base SHAKTI gained per landed hit (scaled by damage dealt)

    // Knockdown / wakeup
    knockdownDurationFrames: 42,
    wakeupFrames:             28,
    wakeupIFrames:            18, // invincibility during wakeup (reversal window)

    // Combo
    comboWindowFrames:  90, // combo timer after a landed hit
    comboMaxHits:        8,  // hard cap on combo length
    comboDamageStep:     0.1, // damage multiplier lost per hit in a combo (100%, 90%, 80%…)
    comboDamageFloor:    0.5, // never scale below this

    // Visual
    shakeDecay:      0.85, // multiplier applied to shake magnitude each frame
    shakeMagnitude:  6,    // px shake on heavy hit
    floatTextSpeed:  1.2, // px/frame upward drift for floating damage numbers
    floatTextLife:   45,  // frames a floating text lives
    ghostBarSpeed:   2,   // px/frame the ghost health bar drains

    // Rounds
    roundsToWin:  2,        // first to this many round wins takes the match
    roundIntroMs: 1500,     // ms before "FIGHT!" fades and combat begins
    roundTimeLimitMs: 60000, // 60-second round timer
    koDelayMs:    1500,     // ms a KO'd fighter lies before the round settles

    // Audio
    sfx: Object.freeze({
        hit:        'hit',
        block:      'block',
        ko:         'ko',
        super:      'super',
        counter:    'counter',
        whiff:      'whiff',
        grab:       'grab',
    }),
});

/**
 * Default combo chains: move name → array of follow-up moves (automatic).
 * The first element is the move itself; chains index into MOVES by name.
 * `null` ends the chain (e.g. sweeps knock down).
 */
export const COMBO_CHAINS = Object.freeze({
    jab:          ['jab', 'jab', 'jab', 'straight', 'kick', 'dashPunch'],
    dashPunch:    ['dashPunch', 'jab', 'straight'],
    lowPunch:     ['lowPunch', 'lowPunch', 'kick', 'straight'],
    straight:     ['straight', 'straight', 'kick', 'sweep'],
    kick:         ['kick', 'kick', 'jab', 'dashKick', 'straight'],
    dashKick:     ['dashKick', 'kick', 'jab', 'straight'],
    sweep:        [],
    airPunch:     [],
    super:        [],
});

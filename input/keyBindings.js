/**
 * keyBindings — single source of truth mapping physical keys to semantic actions.
 *
 * Action names are what every system uses (Fighter, mobile controls, debug).
 * Change a key here and it applies everywhere; add a key and it's usable
 * everywhere.
 *
 * Controls (desktop):
 *   Move   — A / D / ← / →
 *   Jump   — W / ↑
 *   Crouch — S (also forms ↓ + attack low attacks / crouch-block)
 *   Block  — hold back (away from opponent) [hold ←/→ to block]
 *   Punch  — J (light jab) — → + J (forward) = dash punch
 *   Kick   — K (light kick) — → + K (forward) = dash kick — ↓ + K = sweep
 *   Grab   — I
 *   Super   — L or Space (only when SHAKTI meter is full)
 */
export const KEY_TO_ACTION = Object.freeze({
    // Movement
    ArrowLeft: 'moveLeft',
    KeyA:      'moveLeft',
    ArrowRight: 'moveRight',
    KeyD:      'moveRight',
    ArrowUp:   'jump',
    KeyW:      'jump',
    KeyS:      'crouch',

    // Attacks
    KeyJ:      'lightPunch',
    KeyU:      'heavyPunch',
    KeyK:      'kick',
    KeyI:      'grab',

    // Super
    KeyL:      'super',
    Space:     'super',
});

/** All action names, derived so it can't drift from the map above. */
export const ACTIONS = Object.freeze(
    [...new Set(Object.values(KEY_TO_ACTION))]
);

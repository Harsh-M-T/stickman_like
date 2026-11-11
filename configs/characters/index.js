import { PLAYER_CHARACTER } from './player.js';
import { ENEMY_CHARACTER } from './enemy.js';
import { KADE_CHARACTER, MIRA_CHARACTER, JIN_CHARACTER, SABLE_CHARACTER, ROOK_CHARACTER, BOSS_CHARACTER } from './roster.js';

/**
 * Character registry — the single place that lists every character in the game.
 * Adding a character = add it here (from its config file) and it shows up on the
 * character select screen automatically.
 */
export const CHARACTERS = Object.freeze([
    PLAYER_CHARACTER,
    KADE_CHARACTER,
    MIRA_CHARACTER,
    JIN_CHARACTER,
    SABLE_CHARACTER,
    ROOK_CHARACTER,
    ENEMY_CHARACTER,
    BOSS_CHARACTER,
]);

/** id → character config lookup. */
export const CHARACTER_MAP = new Map(CHARACTERS.map(c => [c.id, c]));

/** Resolve a character config by id (returns null when unknown). */
export function getCharacter(id) {
    return CHARACTER_MAP.get(id) ?? null;
}

/** Characters the player can pick to control (AI opponents come from the rest). */
export const PLAYER_ROSTER = Object.freeze([
    KADE_CHARACTER,
    MIRA_CHARACTER,
    JIN_CHARACTER,
    SABLE_CHARACTER,
    ROOK_CHARACTER,
]);

/** Random-select helper — returns a random roster id. */
export function randomOpponentId() {
    const ids = PLAYER_ROSTER.map(c => c.id);
    return ids[Math.floor(Math.random() * ids.length)];
}

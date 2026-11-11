/**
 * configs/arena.js — arena/backdrop/floor themes.
 *
 * Renderer.drawBackground reads this config instead of hardcoded colors, so
 * swapping the look of a fight stage is a config-only change. `enabled` flags
 * turn whole layers off. Optional `background.image` is an asset URL drawn
 * behind everything (pixel art backdrops); omit it for a pure procedural
 * background.
 */

function theme(id, sky, ground, floor, grid, crowdColor) {
    return Object.freeze({
        id,
        background: Object.freeze({ image: null }),
        sky: Object.freeze({ colors: sky }),
        ground: Object.freeze({ colors: ground }),
        floorLine: Object.freeze({ enabled: true, color: '#e879f9', glow: '#d946ef', glowBlur: 18, width: 2 }),
        grid: Object.freeze({ enabled: grid.enabled, color: grid.color, alpha: grid.alpha, rows: grid.rows ?? 5, cols: grid.cols ?? 7, width: grid.width ?? 1 }),
        crowd: Object.freeze({ enabled: true, color: crowdColor ?? '#3b0764', alpha: 0.16, spacing: 18, radius: 9 }),
        footer: Object.freeze({ enabled: true, color: '#140b1e', leftWidth: 120, rightWidth: 145, offsetY: 1 }),
    });
}

export const ARENAS = Object.freeze([
    Object.freeze({
        id: 'parliament',
        name: 'Parliament',
        theme: theme('parliament',
            [{ pos: 0, color: '#101a33' }, { pos: 0.6, color: '#1e2a52' }, { pos: 1, color: '#2c3e70' }],
            [{ pos: 0, color: '#141b30' }, { pos: 1, color: '#0a0f1e' }],
            { enabled: true, color: '#38bdf8', glow: '#0ea5e9', glowBlur: 18, width: 2 },
            { enabled: true, color: '#7dd3fc', alpha: 0.08, rows: 5, cols: 7, width: 1 },
            '#312e81',
        ),
    }),
    Object.freeze({
        id: 'protest',
        name: 'Protest Grounds',
        theme: theme('protest',
            [{ pos: 0, color: '#2a1208' }, { pos: 0.6, color: '#5c2a12' }, { pos: 1, color: '#7c3a1a' }],
            [{ pos: 0, color: '#2a150b' }, { pos: 1, color: '#180b05' }],
            { enabled: true, color: '#fb923c', glow: '#ea580c', glowBlur: 18, width: 2 },
            { enabled: true, color: '#fdba74', alpha: 0.08, rows: 5, cols: 7, width: 1 },
            '#7c2d12',
        ),
    }),
    Object.freeze({
        id: 'street',
        name: 'Neon Street',
        theme: theme('street',
            [{ pos: 0, color: '#0a0a14' }, { pos: 0.6, color: '#171231' }, { pos: 1, color: '#241a3d' }],
            [{ pos: 0, color: '#120d1f' }, { pos: 1, color: '#08060f' }],
            { enabled: true, color: '#c084fc', glow: '#a855f7', glowBlur: 18, width: 2 },
            { enabled: true, color: '#d8b4fe', alpha: 0.08, rows: 5, cols: 7, width: 1 },
            '#4c1d95',
        ),
    }),
]);

/** Resolve a stage id → arena theme (returns the default when unknown). */
export function getArenaTheme(id) {
    const found = ARENAS.find(a => a.id === id);
    return found?.theme ?? ARENAS[ARENAS.length - 1].theme;
}

/** Default arena theme (Neon Street) — import target for renderer/assets. */
export const ARENA_THEME = getArenaTheme('street');

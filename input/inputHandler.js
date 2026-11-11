import { KEY_TO_ACTION } from './keyBindings.js';

/**
 * InputHandler — tracks semantic actions (not key codes) for the current and
 * previous frame. Mobile/touch code injects actions via setVirtualDown/Up.
 *
 * Frame-based action buffer: every press within BUFFER_FRAMES of a frame is
 * treated as "just pressed" (combos / reversals). Buffer ~6 frames ≈ 100 ms,
 * which covers combo chains and reversal timing on 60 FPS.
 */
export const BUFFER_FRAMES = 6;

export default class InputHandler {
    constructor() {
        /** @type {Record<string, boolean>} */
        this._down = {};
        /** @type {Record<string, boolean>} */
        this._prevDown = {};
        /** @type {Record<string, number>} — last frame each action was pressed */
        this._pressFrame = {};

        /** Monotonic game-frame counter (incremented by the GameLoop via update) */
        this.frame = 0;

        window.addEventListener('keydown', e => {
            const action = KEY_TO_ACTION[e.code];
            if (!action) return;
            if (this._down[action]) return; // ignore OS key auto-repeat
            this._down[action] = true;
            this._pressFrame[action] = this.frame;
        });

        window.addEventListener('keyup', e => {
            const action = KEY_TO_ACTION[e.code];
            if (action) this._down[action] = false;
        });
    }

    //  Query

    /** True while the action is held. */
    isDown(action) {
        return !!this._down[action];
    }

    /** True only on frames where the action was pressed within BUFFER_FRAMES. */
    justPressed(action) {
        const pressedAt = this._pressFrame[action];
        if (!this._down[action]) return false;
        const age = this.frame - (pressedAt ?? -999);
        return age >= 0 && age < BUFFER_FRAMES;
    }

    //  Virtual inputs (touch / mobile)

    setVirtualDown(action) { this._down[action] = true; this._pressFrame[action] = this.frame; }
    setVirtualUp(action) { this._down[action] = false; }

    //  Frame update

    /** Must be called at the END of each game frame. */
    update() {
        this._prevDown = { ...this._down };
        this.frame++;
    }

    /** Reset the whole input state (new round / new fight). */
    reset() {
        this._down = {};
        this._prevDown = {};
        this._pressFrame = {};
        this.frame = 0;
    }
}

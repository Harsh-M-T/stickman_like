/**
 * GameLoop — fixed-timestep accumulator loop.
 *
 * Logic (update) advances at a fixed 60 Hz step so gameplay is deterministic
 * and frame-rate independent (kills the 144 Hz = 2.4× speedup bug). Rendering
 * (render) runs on every requestAnimationFrame; extra time is clamped to avoid
 * a catch-up burst after tab switches or pauses.
 *
 * `update` is called at least zero times per rAF, exactly once per 16.67 ms
 * of elapsed time. `render` is called once per rAF. A `timeScale` < 1 slows
 * both logic and rendering (used for the KO slow-motion sequence).
 */
export default class GameLoop {
    /**
     * @param {{ update: () => void, render: () => void, stepMs?: number, ctx?: CanvasRenderingContext2D, timeScale?: number }} opts
     */
    constructor({ update, render, stepMs = 1000 / 60, ctx = null, timeScale = 1 } = {}) {
        this._update = update;
        this._render = render;
        this._ctx = ctx;
        this._stepMs = stepMs;
        this._timeScale = timeScale;

        this._accumulator = 0;
        this._lastTime = null;
        this._rafId = null;
        this._running = false;
        this._boundTick = this._tick.bind(this);
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._lastTime = null;
        this._accumulator = 0;
        this._rafId = requestAnimationFrame(this._boundTick);
    }

    stop() {
        if (!this._running) return;
        this._running = false;
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    isRunning() { return this._running; }

    /** Clear accumulated time so no catch-up burst fires (e.g. on resume). */
    resetTiming() {
        this._lastTime = null;
        this._accumulator = 0;
    }

    set timeScale(v) { this._timeScale = v; }

    get timeScale() { return this._timeScale; }

    /** Slow-motion helper (KO sequence). */
    setTimeScale(v) { this._timeScale = v; }

    _tick(timestamp) {
        if (!this._running) return;

        try {
            if (this._lastTime !== null) {
                let frameMs = timestamp - this._lastTime;
                if (frameMs > 250) frameMs = 250; // clamp big gaps (background tab / resume)
                this._accumulator += frameMs;

                const stepMs = this._stepMs * this._timeScale;
                while (this._accumulator >= stepMs) {
                    this._update();
                    this._accumulator -= stepMs;
                }
            }
            this._lastTime = timestamp;

            if (this._timeScale < 1 && this._ctx) {
                this._ctx.save();
                this._ctx.scale(this._timeScale, this._timeScale);
            }
            this._render();
            if (this._timeScale < 1 && this._ctx) {
                this._ctx.restore();
            }
        } catch (err) {
            // An uncaught error here used to silently kill the rAF chain —
            // freezing the fight with idle fighters and no visible cause.
            console.error('[GameLoop] Tick error (update/render skipped this frame):', err);
        }
        this._rafId = requestAnimationFrame(this._boundTick);
    }
}

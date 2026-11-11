/**
 * MobileControls — binds touch/mouse controls to InputHandler.
 *
 * Layout (landscape):
 *   - Virtual joystick (left): moves the fighter; stick-up jumps.
 *   - Right cluster: PUNCH, KICK, GRAB, SUPER buttons.
 */
export default class MobileControls {
    constructor({ input }) {
        this._input = input;

        if (!document.getElementById('mobileControls')) return;

        this._bindJoystick();
        this._bindButton('btnPunch', 'lightPunch');
        this._bindButton('btnKick', 'kick');
        this._bindButton('btnGrab', 'grab');
        this._bindButton('btnSuper', 'super');
    }

    //  Virtual joystick

    _bindJoystick() {
        const base = document.getElementById('joystickBase');
        const knob = document.getElementById('joystickKnob');
        if (!base || !knob) return;

        const state = { active: false, id: null, x: 0, y: 0 };

        const releaseAll = () => {
            this._input.setVirtualUp('moveLeft');
            this._input.setVirtualUp('moveRight');
            this._input.setVirtualUp('jump');
        };

        const setFromTouch = (clientX, clientY) => {
            const rect = base.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            let dx = clientX - cx;
            let dy = clientY - cy;
            const dist = Math.hypot(dx, dy);
            const max = rect.width / 2 - 14;
            if (dist > max) { const k = max / dist; dx *= k; dy *= k; }
            state.x = dx;
            state.y = dy;

            const dead = 12;
            const ax = Math.abs(dx);
            const ay = Math.abs(dy);
            releaseAll();
            if (ax > dead && ax > ay) {
                this._input.setVirtualDown(dx > 0 ? 'moveRight' : 'moveLeft');
            } else if (ay > dead) {
                this._input.setVirtualDown('jump');
            }

            knob.style.left = `${50 + (dx / max) * 40}%`;
            knob.style.top = `${50 + (dy / max) * 40}%`;
        };

        const down = (e) => {
            state.active = true;
            state.id = e.pointerId;
            setFromTouch(e.clientX, e.clientY);
        };
        const move = (e) => { if (state.active && e.pointerId === state.id) setFromTouch(e.clientX, e.clientY); };
        const up = (e) => {
            if (state.active && e.pointerId === state.id) {
                state.active = false;
                releaseAll();
                knob.style.left = '50%';
                knob.style.top = '50%';
            }
        };

        base.addEventListener('pointerdown', e => { e.preventDefault(); down(e); });
        base.addEventListener('pointermove', e => { e.preventDefault(); move(e); });
        base.addEventListener('pointerup', e => { e.preventDefault(); up(e); });
        base.addEventListener('pointercancel', e => { e.preventDefault(); up(e); });
        base.addEventListener('pointerleave', e => { if (state.active) up(e); });
    }

    //  Action buttons

    /** Binds touch + mouse events on a button element to an action. */
    _bindButton(elemId, action) {
        const el = document.getElementById(elemId);
        if (!el) return;

        const down = () => this._input.setVirtualDown(action);
        const up = () => this._input.setVirtualUp(action);

        el.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
        el.addEventListener('touchend', e => { e.preventDefault(); up(); }, { passive: false });
        el.addEventListener('touchcancel', e => { e.preventDefault(); up(); }, { passive: false });
        el.addEventListener('mousedown', e => { e.preventDefault(); down(); });
        el.addEventListener('mouseup', e => { e.preventDefault(); up(); });
        el.addEventListener('mouseleave', e => { e.preventDefault(); up(); });
    }
}

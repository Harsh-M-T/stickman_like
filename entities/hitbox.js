import { aabbOverlap } from '../utils/math.js';

/**
 * Hitbox — an axis-aligned bounding box spawned by a Fighter during an attack.
 * Lives for a fixed number of frames and can only hit each target once.
 *
 * Horizontal anchoring is relative to the fighter's FRONT edge (the side facing
 * the opponent), so the same `offsetX` (reach, px past the front edge) works at
 * any body width and for either facing. The box extends backward (toward the
 * attacker) by `width`, ending exactly at `offsetX` px past the front edge.
 */
export default class Hitbox {
    /**
     * @param {{
     *   owner: object,
     *   offsetX: number,
     *   offsetY: number,
     *   width: number,
     *   height: number,
     *   damage: number,
     *   knockbackX: number,
     *   knockbackY: number,
     *   durationFrames: number,
     * }} config
     */
    constructor({ owner, offsetX, offsetY, width, height, damage, knockbackX, knockbackY, durationFrames }) {
        this.owner = owner;
        /** Reach — px the hitbox extends past the attack's front edge. */
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.width = width;
        this.height = height;
        this.damage = damage;
        this.knockbackX = knockbackX;
        this.knockbackY = knockbackY;
        this.duration = durationFrames;
        this.age = 0;

        /** @type {Set<object>} — prevents hitting the same target twice */
        this._hitTargets = new Set();
    }

    //  Lifecycle 

    update() { this.age++; }
    isExpired() { return this.age >= this.duration; }
    markHit(target) { this._hitTargets.add(target); }

    //  Geometry 

    getBounds() {
        const { owner, offsetX, width } = this;
        const front = owner.facingRight ? owner.x + owner.width : owner.x;
        const x = owner.facingRight
            ? front + offsetX - width
            : front - offsetX;
        const y = owner.y + this.offsetY;
        return { x, y, width: this.width, height: this.height };
    }

    checkCollision(target) {
        if (target === this.owner) return false;
        if (this._hitTargets.has(target)) return false;
        return aabbOverlap(this.getBounds(), target.getHurtboxBounds());
    }
}

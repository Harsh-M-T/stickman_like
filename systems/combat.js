/**
 * CombatSystem — resolves active hitboxes against fighters and emits events so
 * rendering / audio side-effects stay out of gameplay logic.
 *
 * Events:
 *   combat:hit  { attacker, target, damage, blocked, counter, ko, x, y, big, hitstopFrames, spark }
 *     — fired once per landed hit that dealt damage (blocked hits still deal
 *       reduced damage, so they fire too). `ko` is true only when the target
 *       actually fell (unblocked, lethal). `counter` is true when the hit landed
 *       during the opponent's attack startup (1.5× damage + extra hitstop).
 *     — `hitstopFrames` is the freeze applied to both fighters (4–8 frames,
 *       heavier for heavy hits / supers / counter hits).
 */
import { MOVES } from '../configs/config.js';

export default class CombatSystem {
    /**
     * @param {{ bus?: import('../core/eventBus.js').default }} cfg
     */
    constructor({ bus } = {}) {
        this._bus = bus ?? null;
        this._fighters = [];
        this._hitboxes = [];
    }

    /** Set the fighters that can be hit (usually [player, enemy]). */
    setFighters(fighters) {
        this._fighters = fighters;
    }

    /** Push a fighter's pending hitbox (if any) into the active pool. */
    collect(fighter) {
        if (fighter.pendingHitbox) {
            this._hitboxes.push(fighter.pendingHitbox);
            fighter.pendingHitbox = null;
        }
    }

    /** All hitboxes currently resolving (for debug overlay). */
    getActiveHitboxes() {
        return [...this._hitboxes];
    }

    /** Advance hitboxes and resolve collisions for one frame. */
    update() {
        for (let i = this._hitboxes.length - 1; i >= 0; i--) {
            const hb = this._hitboxes[i];
            hb.update();

            for (const target of this._fighters) {
                if (target === hb.owner) continue;
                if (hb._hitTargets?.has?.(target)) continue;
                if (!hb.checkCollision(target)) continue;

                const dir = hb.owner.facingRight ? 1 : -1;
                const wasAttacking = ['attack_startup', 'attack_active', 'attack_recovery', 'grab', 'super'].includes(target.state);
                const atkName = hb.owner.currentAttack?.name;
                const isSuper = atkName === 'super';
                const isGrab = atkName === 'grab';
                const blocked = !isSuper && !isGrab && target.state === 'block';

                const counter = !blocked && !isGrab && wasAttacking && target.invincibleTimer <= 0;
                const baseDamage = hb.damage;
                const damage = counter ? baseDamage * 1.5 : baseDamage;

                const applied = target.takeHit(damage, hb.knockbackX * dir, hb.knockbackY * dir);
                hb.markHit(target);

                const dealt = applied.damage;
                if (dealt <= 0) continue;

                const hitstopFrames = counter
                    ? (hb.owner.currentAttack?.hitstop ?? MOVES.super.hitstop) + 2
                    : (hb.owner.currentAttack?.hitstop ?? MOVES.jab.hitstop);

                // Command grabs put the victim into the 'grabbed' state
                // (mash 5 to tech). Clear the hit-stun takeHit applied — the
                // grabbed state's own 90-frame hold timer governs from here.
                if (!blocked && !counter && isGrab && target.state !== 'ko') {
                    target.enterState('grabbed');
                    target.stunTimer = 0;
                }

                // Combo bookkeeping on the attacker when the hit landed clean
                if (!blocked) {
                    hb.owner.registerHit(hb.owner, dealt);
                }

                const hurtbox = target.getHurtboxBounds();
                this._bus?.emit('combat:hit', {
                    attacker: hb.owner,
                    target,
                    damage: dealt,
                    blocked,
                    counter,
                    ko: target.state === 'ko',
                    x: hurtbox.x + hurtbox.width / 2,
                    y: hurtbox.y,
                    big: isSuper,
                    hitstopFrames,
                    spark: blocked ? 'block' : counter ? 'counter' : 'hit',
                    atkName,
                });
            }

            if (hb.isExpired()) this._hitboxes.splice(i, 1);
        }
    }

    /** Drop all active hitboxes (new round). */
    clear() {
        this._hitboxes.length = 0;
    }
}

// easter-eggs.js - Hidden commands and Easter eggs (kamehameha charging progression, ...)
// Exposes window.SPP.easterEggs
(function () {
    'use strict';

    // Each stage advances when the user types the next chunk of "kamehameha".
    // Stages are cumulative: stage N is emitted only when the typed buffer
    // reaches that prefix *after* having already emitted stage N-1 (so the
    // visuals grow progressively).
    const STAGE_PREFIXES = ['kame', 'kameha', 'kamehame', 'kamehameha'];
    const BUFFER_SIZE = 24;
    const FIRE_COOLDOWN_MS = 3500;
    // If the user stops typing for too long between stages, reset the progress.
    const STAGE_RESET_MS = 4000;

    let buffer = '';
    let lastStageReached = 0; // 0..4
    let lastStageAt = 0;
    let lastFireAt = 0;
    let socketRef = null;
    let sessionIdGetter = null;
    let socketGetter = null;

    // Active local audio instance for the charge sound so we can stop it on fire.
    let chargeAudio = null;

    function onKeyDown(event) {
        const key = event.key;
        if (!key || key.length !== 1 || !/[a-zA-Z]/.test(key)) return;

        const now = Date.now();
        // If there's a big pause, reset the progress
        if (lastStageReached > 0 && now - lastStageAt > STAGE_RESET_MS) {
            lastStageReached = 0;
        }

        buffer = (buffer + key.toLowerCase()).slice(-BUFFER_SIZE);

        // Find the highest matching stage for the current buffer
        let matched = 0;
        for (let i = STAGE_PREFIXES.length - 1; i >= 0; i--) {
            if (buffer.endsWith(STAGE_PREFIXES[i])) {
                matched = i + 1;
                break;
            }
        }

        if (!matched || matched <= lastStageReached) return;

        // Stage 4 (fire) additionally obeys a cooldown
        if (matched === 4) {
            if (now - lastFireAt < FIRE_COOLDOWN_MS) return;
            lastFireAt = now;
            // Reset so another fresh "kamehameha" is needed for a new one
            buffer = '';
            lastStageReached = 0;
        } else {
            lastStageReached = matched;
        }
        lastStageAt = now;

        requestKamehamehaStage(matched);
    }

    /**
     * Emits a kamehameha stage to the server so everyone sees the progression.
     * Falls back to a local-only trigger if no socket is available.
     */
    function requestKamehamehaStage(stage) {
        const socket = socketGetter ? socketGetter() : socketRef;
        if (socket && socket.connected && sessionIdGetter) {
            const sessionId = sessionIdGetter();
            if (sessionId) {
                socket.emit('kamehameha', { sessionId, stage });
                return;
            }
        }
        playKamehamehaStage({ stage });
    }

    /**
     * Plays the visual + audio for a given kamehameha stage (1..4).
     * Stages 1-3 grow the charge orb and play the charging sound.
     * Stage 4 fires the full-screen wave and plays the fire sound.
     */
    function playKamehamehaStage({ stage, fromName, fromUserId } = {}) {
        if (!stage) return;

        if (stage < 4) {
            showChargeOrb(stage);
            startChargingSound();
        } else {
            // Fire!
            stopChargingSound();
            showCaptionIfAny(fromName);
            fireWave(fromUserId);
        }
    }

    // --- Charge orb (stages 1-3) ---

    function showChargeOrb(stage) {
        // Remove any previous orb so it doesn't stack
        document.querySelectorAll('.kamehameha-charge').forEach((el) => el.remove());

        const orb = document.createElement('div');
        orb.className = `kamehameha-charge charge-stage-${stage}`;
        document.body.appendChild(orb);

        // Orb keeps pulsing until the next stage / fire. If the user never fires,
        // auto-remove after a short while.
        setTimeout(() => orb.remove(), 1500);
    }

    function startChargingSound() {
        try {
            if (chargeAudio && !chargeAudio.paused) return;
            chargeAudio = new Audio('/sounds/kamehameha-charging.mp3');
            chargeAudio.volume = 0.6;
            chargeAudio.play().catch(() => { /* ignore autoplay errors */ });
        } catch (e) {
            console.warn('Charge sound failed:', e);
        }
    }

    function stopChargingSound() {
        if (!chargeAudio) return;
        try {
            chargeAudio.pause();
            chargeAudio.currentTime = 0;
        } catch { /* ignore */ }
        chargeAudio = null;
    }

    // --- Fire (stage 4) ---

    function fireWave(fromUserId) {
        // Flash/orb burst at the firing point
        const burst = document.createElement('div');
        burst.className = 'kamehameha-charge charge-stage-4';
        document.body.appendChild(burst);
        setTimeout(() => burst.remove(), 700);

        // Play the fire sound
        try {
            const audio = new Audio('/sounds/kamehameha-fire.mp3');
            audio.volume = 0.85;
            audio.play().catch(() => { /* ignore */ });
        } catch (e) {
            console.warn('Fire sound failed:', e);
        }

        // The actual horizontal wave + screen shake.
        // IMPORTANT: the shake goes on a non-ancestor element (#game-screen),
        // NOT on document.body. A transformed ancestor would create a new
        // containing block for fixed elements and push the wave off-screen.
        setTimeout(() => {
            const wave = document.createElement('div');
            wave.className = 'kamehameha-wave';
            document.body.appendChild(wave);

            const shakeTarget = document.getElementById('game-screen') || document.querySelector('main');
            if (shakeTarget) {
                shakeTarget.classList.add('kamehameha-shake');
                setTimeout(() => shakeTarget.classList.remove('kamehameha-shake'), 900);
            }

            // Knock everyone away (except the caster) with a staggered sweep
            applyKnockbackToParticipants(fromUserId);

            setTimeout(() => wave.remove(), 1900);
        }, 250);
    }

    /**
     * Pushes away every participant avatar (except the caster).
     * Timing is a simple left-to-right sweep based on horizontal position.
     * Also applies a visible "stunned" aura on every hit avatar for everyone
     * to see, and flags the local user via a body class so the main app can
     * disable their punch interactions.
     */
    function applyKnockbackToParticipants(casterId) {
        const WAVE_DURATION_MS = 1600; // keep in sync with the CSS travel animation
        const STUN_DURATION_MS = 15000; // must match the server-side stun window
        const viewportWidth = window.innerWidth;

        const participantEls = document.querySelectorAll('[data-user-id]');
        const localSocketId = getSocketRef() ? getSocketRef().id : null;

        participantEls.forEach((el) => {
            const userId = el.getAttribute('data-user-id');
            if (casterId && userId === casterId) return;

            const rect = el.getBoundingClientRect();
            const elCenterX = rect.left + rect.width / 2;

            // Time for the wave's leading edge to reach this X (linear approximation).
            const progress = Math.min(1, Math.max(0, (elCenterX + viewportWidth * 0.4) / (viewportWidth * 1.9)));
            const hitDelay = progress * WAVE_DURATION_MS;

            setTimeout(() => {
                el.classList.add('kamehameha-hit');
                setTimeout(() => el.classList.remove('kamehameha-hit'), 1800);

                // Add the visible stunned aura (stars + wobble) AFTER the knockback
                // finishes so the two animations don't clash on the same element.
                const KNOCKBACK_MS = 1800;
                setTimeout(() => {
                    el.classList.add('kamehameha-stunned-visual');
                    addStunStars(el);
                }, KNOCKBACK_MS);

                setTimeout(() => {
                    el.classList.remove('kamehameha-stunned-visual');
                    removeStunStars(el);
                }, STUN_DURATION_MS);

                // If this avatar is the local user, also stun their input
                if (localSocketId && userId === localSocketId) {
                    document.body.classList.add('kamehameha-stunned');
                    setTimeout(() => document.body.classList.remove('kamehameha-stunned'), STUN_DURATION_MS);
                }
            }, hitDelay);
        });
    }

    function addStunStars(participantEl) {
        // Create 3 rotating "stunned" stars orbiting the avatar card.
        // They share the same rotating parent so they orbit together,
        // each with its own angular offset.
        const card = participantEl.querySelector('.dbz-participant-card');
        if (!card) return;

        // Avoid duplicate layers if something retriggers
        removeStunStars(participantEl);

        const orbit = document.createElement('div');
        orbit.className = 'kamehameha-stun-orbit';

        for (let i = 0; i < 3; i++) {
            const star = document.createElement('div');
            star.className = 'kamehameha-stun-star';
            star.style.transform = `rotate(${i * 120}deg) translateX(30px)`;
            star.textContent = '★';
            orbit.appendChild(star);
        }

        card.appendChild(orbit);
    }

    function removeStunStars(participantEl) {
        participantEl.querySelectorAll('.kamehameha-stun-orbit').forEach((el) => el.remove());
    }

    function getSocketRef() {
        return socketGetter ? socketGetter() : socketRef;
    }

    function showCaptionIfAny(fromName) {
        if (!fromName) return;
        const label = document.createElement('div');
        label.className = 'kamehameha-label';
        label.textContent = `${fromName} KAMEHAMEHA!`;
        document.body.appendChild(label);
        setTimeout(() => label.remove(), 2200);
    }

    /**
     * Backward-compatible wrapper: plays the full-blast (stage 4) effect.
     */
    function triggerKamehameha(opts = {}) {
        playKamehamehaStage({ stage: 4, fromName: opts.fromName });
    }

    /**
     * Initializes the module. Needs the socket and sessionId getters so
     * typing `kamehameha` broadcasts the effect to the whole session.
     */
    function init(deps = {}) {
        socketRef = deps.socket || null;
        socketGetter = deps.getSocket || null;
        sessionIdGetter = deps.getSessionId || null;
        document.addEventListener('keydown', onKeyDown);
    }

    window.SPP = window.SPP || {};
    window.SPP.easterEggs = {
        init,
        playKamehamehaStage,
        triggerKamehameha
    };
})();

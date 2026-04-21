// animations.js - Visual animations (reset, user join/leave)
// Exposes window.SPP.animations
(function () {
    'use strict';

    const LEAVE_ANIMATION_DURATION = 1000;
    const JOIN_ANIMATION_DURATION = 1000;
    const RESET_ANIMATION_DURATION = 800;

    const LEAVE_SOUND_URL = '/sounds/dbz-teleport-logoff.mp3';
    const JOIN_SOUND_URL = '/sounds/landing-join.mp3';

    function playSound(url, volume = 0.5) {
        try {
            const audio = new Audio(url);
            audio.volume = volume;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch((error) => {
                    console.warn(`Sound playback failed for ${url}:`, error);
                });
            }
        } catch (error) {
            console.warn(`Error creating audio for ${url}:`, error);
        }
    }

    /**
     * Dematerialization effect (Instant Transmission style).
     * Clones the participant element and animates the clone so the effect
     * is not interrupted by any re-render of the participants list.
     */
    function playUserLeaveAnimation(userId, onComplete, options = {}) {
        const { soundEnabled = false } = options;
        const participantEl = document.querySelector(`[data-user-id="${userId}"]`);

        if (!participantEl) {
            if (onComplete) onComplete();
            return;
        }

        const rect = participantEl.getBoundingClientRect();

        const ghost = participantEl.cloneNode(true);
        ghost.removeAttribute('data-user-id');
        ghost.style.pointerEvents = 'none';
        ghost.style.position = 'fixed';
        ghost.style.left = `${rect.left + rect.width / 2}px`;
        ghost.style.top = `${rect.top + rect.height / 2}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.zIndex = '500';
        ghost.className = 'user-leave-stripes user-leaving';
        ghost.style.transform = 'translate(-50%, -50%)';

        const flash = document.createElement('div');
        flash.className = 'user-leave-flash';
        ghost.appendChild(flash);

        document.body.appendChild(ghost);

        if (soundEnabled) playSound(LEAVE_SOUND_URL, 0.5);

        // Let caller proceed immediately (the animation runs on the ghost)
        if (onComplete) onComplete();

        setTimeout(() => {
            if (ghost.parentNode) ghost.remove();
        }, LEAVE_ANIMATION_DURATION);
    }

    /**
     * Fly-in from above with bounce and impact ring.
     */
    function playUserJoinAnimation(participantEl, options = {}) {
        if (!participantEl) return;
        const { soundEnabled = false } = options;

        const trail = document.createElement('div');
        trail.className = 'user-join-trail';
        participantEl.appendChild(trail);

        const impact = document.createElement('div');
        impact.className = 'user-join-impact';
        participantEl.appendChild(impact);

        // Force reflow so the animation class triggers reliably
        void participantEl.offsetWidth;

        participantEl.classList.add('user-joining');

        if (soundEnabled) playSound(JOIN_SOUND_URL, 0.5);

        setTimeout(() => {
            if (!participantEl.isConnected) return;
            participantEl.classList.remove('user-joining');
            if (trail.parentNode) trail.remove();
            if (impact.parentNode) impact.remove();
        }, JOIN_ANIMATION_DURATION);
    }

    /**
     * Subtle flash + expanding ring when the round is reset.
     * Plays a sound if the audio toggle is enabled.
     */
    function playResetAnimation(options = {}) {
        const { soundEnabled = false, soundUrl = '/sounds/reset-button-sound.mp3', volume = 0.5 } = options;

        const overlay = document.createElement('div');
        overlay.className = 'reset-wave-overlay';

        const frag = document.createDocumentFragment();

        const flash = document.createElement('div');
        flash.className = 'reset-flash';
        frag.appendChild(flash);

        const ring = document.createElement('div');
        ring.className = 'reset-wave-ring';
        frag.appendChild(ring);

        overlay.appendChild(frag);
        document.body.appendChild(overlay);

        if (soundEnabled) {
            playSound(soundUrl, volume);
        }

        setTimeout(() => overlay.remove(), RESET_ANIMATION_DURATION);
    }

    window.SPP = window.SPP || {};
    window.SPP.animations = {
        playUserLeaveAnimation,
        playUserJoinAnimation,
        playResetAnimation,
        showStreakBanner,
        setSsj2Sparks
    };

    // --- SSJ2 electric sparks (active while consensus streak >= 4) ---
    let ssj2Interval = null;

    /**
     * Generates a short zigzag "lightning" element attached to the document.
     * Two or three connected segments simulate the crooked shape.
     */
    function spawnSsj2Spark() {
        const tableEl = document.querySelector('.dbz-table');
        if (!tableEl) return;
        const rect = tableEl.getBoundingClientRect();

        // Spawn around the oval table: random angle, near the border (slightly inside/outside).
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const angle = Math.random() * Math.PI * 2;
        const radiusX = rect.width / 2;
        const radiusY = rect.height / 2;
        const offset = 10 + Math.random() * 30; // spread from the border
        const x = centerX + Math.cos(angle) * (radiusX + (Math.random() < 0.5 ? offset : -offset));
        const y = centerY + Math.sin(angle) * (radiusY + (Math.random() < 0.5 ? offset : -offset));

        // Build 2-3 connected segments for a crooked look
        const segmentCount = 2 + Math.floor(Math.random() * 2);
        let cx = x;
        let cy = y;

        for (let i = 0; i < segmentCount; i++) {
            const length = 12 + Math.random() * 20;
            const segAngle = (Math.random() * 90 - 45) * (Math.PI / 180); // -45° to +45° from vertical
            const spark = document.createElement('div');
            spark.className = 'ssj2-spark';
            spark.style.left = `${cx}px`;
            spark.style.top = `${cy}px`;
            spark.style.height = `${length}px`;
            spark.style.transform = `rotate(${segAngle}rad)`;
            spark.style.animationDelay = `${i * 0.04}s`;
            document.body.appendChild(spark);

            // Advance the tip to the end of this segment for the next one
            cx += Math.sin(segAngle) * length;
            cy += Math.cos(segAngle) * length;

            setTimeout(() => spark.remove(), 500 + i * 40);
        }
    }

    function scheduleSsj2Spark() {
        if (!ssj2Interval) return;
        // Variable interval: 0.6 - 1.8s between bursts
        const delay = 600 + Math.random() * 1200;
        ssj2Interval = setTimeout(() => {
            spawnSsj2Spark();
            scheduleSsj2Spark();
        }, delay);
    }

    /**
     * Toggles the ambient SSJ2 sparks effect on or off.
     * @param {boolean} enabled
     */
    function setSsj2Sparks(enabled) {
        if (enabled && !ssj2Interval) {
            // Non-zero truthy sentinel so scheduleSsj2Spark doesn't bail out
            ssj2Interval = true;
            scheduleSsj2Spark();
        } else if (!enabled && ssj2Interval) {
            clearTimeout(ssj2Interval);
            ssj2Interval = null;
            // Remove any remaining sparks instantly
            document.querySelectorAll('.ssj2-spark').forEach((el) => el.remove());
        }
    }

    /**
     * Full-screen banner shown at consecutive consensus streak >= 2.
     * Non-blocking (pointer-events: none), auto-removes after ~2s.
     *
     * @param {number} streak - current consensus streak
     * @param {Object} [options]
     * @param {boolean} [options.soundEnabled] - play a celebration sound
     */
    function showStreakBanner(streak, options = {}) {
        if (!streak || streak < 2) return;

        const { soundEnabled = false } = options;
        const tier = streak >= 4 ? 'tier-hot' : streak >= 3 ? 'tier-warm' : '';

        const banner = document.createElement('div');
        banner.className = `streak-banner ${tier}`.trim();

        const burst = document.createElement('div');
        burst.className = 'streak-banner-burst';

        const combo = document.createElement('div');
        combo.className = 'streak-banner-combo';
        combo.textContent = 'CONSENSUS COMBO';

        const number = document.createElement('div');
        number.className = 'streak-banner-number';
        number.textContent = `x${streak}`;

        const label = document.createElement('div');
        label.className = 'streak-banner-label';
        label.textContent = streak >= 7 ? 'ULTRA INSTINCT'
            : streak >= 6 ? 'SSJ BLUE'
            : streak >= 5 ? 'SSJ GOD'
            : streak === 4 ? 'SSJ4 BURST'
            : streak === 3 ? 'SSJ3 UNLEASHED'
            : 'SSJ2 AWAKENED';

        banner.appendChild(burst);
        banner.appendChild(combo);
        banner.appendChild(number);
        banner.appendChild(label);
        document.body.appendChild(banner);

        // From streak 2 onwards play a SSJ-themed aura sound with a long gradual fade.
        // Progression: SSJ2 -> SSJ3 -> SSJ Blue -> Ultra Instinct.
        if (soundEnabled) {
            let soundUrl;
            if (streak >= 7) soundUrl = '/sounds/UltrainstinctGoku.mp3';
            else if (streak >= 5) soundUrl = '/sounds/ssjb sound effect.mp3';
            else if (streak >= 3) soundUrl = '/sounds/ssj3 sound effect.mp3';
            else soundUrl = '/sounds/super-saiyan-2-aura.mp3';

            const audio = new Audio(soundUrl);
            audio.volume = 0.8;
            audio.play().catch((e) => console.warn('Streak sound playback failed:', e));

            const FADE_START_MS = 15000;
            const FADE_DURATION_MS = 4000;
            const FADE_STEPS = 40;

            setTimeout(() => {
                if (audio.paused) return;
                const initialVolume = audio.volume;
                const stepMs = FADE_DURATION_MS / FADE_STEPS;
                let step = 0;
                const interval = setInterval(() => {
                    step++;
                    audio.volume = Math.max(0, initialVolume * (1 - step / FADE_STEPS));
                    if (step >= FADE_STEPS) {
                        clearInterval(interval);
                        audio.pause();
                    }
                }, stepMs);
            }, FADE_START_MS);
        }

        setTimeout(() => banner.remove(), 2100);
    }
})();

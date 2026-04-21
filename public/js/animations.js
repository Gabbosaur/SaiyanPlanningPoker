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
        playResetAnimation
    };
})();

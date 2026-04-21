// avatar-effects.js - Collision punches, Super Saiyan mode, celebration overlay
// Exposes window.SPP.avatarEffects.create(deps) which returns the set of effect functions.
// Dependencies are injected once at init time (DOM refs, state mutators, settings).
(function () {
    'use strict';

    const { sanitizeInput, setSafeContent, fadeOutAudio } = window.SPP.utils;

    const PUNCH_SOUNDS = [
        '/sounds/punch.mp3',
        '/sounds/medium-punch.mp3',
        '/sounds/punch-heavy.mp3',
        '/sounds/punch-heavy-2.mp3',
        '/sounds/punch-heavy-3.mp3',
        '/sounds/thrust-low.mp3',
        '/sounds/thrust-low-2.mp3',
        '/sounds/thrust1.mp3',
        '/sounds/thrust2.mp3',
        '/sounds/thrust3.mp3'
    ];

    /**
     * Creates an AvatarEffects controller bound to specific DOM containers and state.
     *
     * @param {Object} deps
     * @param {HTMLElement} deps.participantsContainer - element containing participant avatars
     * @param {HTMLElement} deps.collisionOverlay - overlay shown during broadcast collisions
     * @param {HTMLElement} deps.collisionContainer - container for collision overlay content
     * @param {HTMLElement} deps.celebrationOverlay - overlay for consensus celebration
     * @param {HTMLAudioElement} deps.celebrationSound - audio for celebration
     * @param {() => boolean} deps.isAnimating - getter for current animation lock
     * @param {(value: boolean) => void} deps.setAnimating - setter for animation lock
     * @param {() => boolean} deps.isSoundEnabled - getter for sound toggle
     * @param {(value: boolean) => void} [deps.setSoundEnabled] - optional setter when audio fails
     */
    function create(deps) {
        const {
            participantsContainer,
            collisionOverlay,
            collisionContainer,
            celebrationOverlay,
            celebrationSound,
            isAnimating,
            setAnimating,
            isSoundEnabled,
            setSoundEnabled
        } = deps;

        function playRandomPunchSound() {
            if (!isSoundEnabled()) return;
            try {
                const randomSound = PUNCH_SOUNDS[Math.floor(Math.random() * PUNCH_SOUNDS.length)];
                const audio = new Audio(randomSound);
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch((error) => {
                        console.warn('Error playing punch sound:', error);
                    });
                }
            } catch (error) {
                console.warn('Error creating punch sound:', error);
            }
        }

        function createImpactParticles(x, y) {
            const particleCount = 15;

            const particleContainer = document.createElement('div');
            particleContainer.style.position = 'absolute';
            particleContainer.style.left = '0';
            particleContainer.style.top = '0';
            particleContainer.style.width = '100%';
            particleContainer.style.height = '100%';
            particleContainer.style.pointerEvents = 'none';
            particleContainer.style.zIndex = '102';
            participantsContainer.appendChild(particleContainer);

            const colors = ['#ffffff', '#ffeb3b', '#ff9800', '#ff5722'];

            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'impact-particle';

                const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
                const distance = 40 + Math.random() * 80;
                const tx = Math.cos(angle) * distance;
                const ty = Math.sin(angle) * distance;

                particle.style.setProperty('--tx', `${tx}px`);
                particle.style.setProperty('--ty', `${ty}px`);

                const size = 4 + Math.random() * 4;
                particle.style.width = `${size}px`;
                particle.style.height = `${size}px`;

                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                particle.style.background = `radial-gradient(circle, ${randomColor} 0%, rgba(255,149,0,0.5) 100%)`;

                particle.style.left = `${x - size / 2}px`;
                particle.style.top = `${y - size / 2}px`;
                particle.style.animationDelay = `${Math.random() * 0.1}s`;
                particleContainer.appendChild(particle);

                setTimeout(() => particle.remove(), 800 + Math.random() * 100);
            }

            setTimeout(() => particleContainer.remove(), 1000);
        }

        function createMotionTrail(startX, startY, targetX, targetY) {
            const trailCount = 5;

            const trailContainer = document.createElement('div');
            trailContainer.style.position = 'absolute';
            trailContainer.style.left = '0';
            trailContainer.style.top = '0';
            trailContainer.style.width = '100%';
            trailContainer.style.height = '100%';
            trailContainer.style.pointerEvents = 'none';
            trailContainer.style.zIndex = '99';
            participantsContainer.appendChild(trailContainer);

            for (let i = 0; i < trailCount; i++) {
                const trail = document.createElement('div');
                trail.className = 'motion-trail';

                const progress = (i + 1) / (trailCount + 1);
                const x = startX + (targetX - startX) * progress;
                const y = startY + (targetY - startY) * progress;

                trail.style.setProperty('--tx', `${targetX - startX}px`);
                trail.style.setProperty('--ty', `${targetY - startY}px`);
                trail.style.left = `${x - 40}px`;
                trail.style.top = `${y - 40}px`;
                trail.style.animationDelay = `${i * 0.08}s`;
                trailContainer.appendChild(trail);

                setTimeout(() => trail.remove(), 500 + i * 80);
            }

            setTimeout(() => trailContainer.remove(), 900);
        }

        /**
         * Shared setup used by both local and broadcast punches.
         * Returns participant rects + start/target coords, or null if cannot animate.
         */
        function prepareCollision(attackerId, targetId) {
            const attackerEl = document.querySelector(`[data-user-id="${attackerId}"]`);
            const targetEl = document.querySelector(`[data-user-id="${targetId}"]`);
            if (!attackerEl || !targetEl) return null;

            const containerRect = participantsContainer.getBoundingClientRect();
            const attackerRect = attackerEl.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();

            const startX = attackerRect.left - containerRect.left + attackerRect.width / 2;
            const startY = attackerRect.top - containerRect.top + attackerRect.height / 2;
            const targetX = targetRect.left - containerRect.left + targetRect.width / 2;
            const targetY = targetRect.top - containerRect.top + targetRect.height / 2;

            attackerEl.style.setProperty('--start-x', '0px');
            attackerEl.style.setProperty('--start-y', '0px');
            attackerEl.style.setProperty('--target-x', `${targetX - startX}px`);
            attackerEl.style.setProperty('--target-y', `${targetY - startY}px`);

            createMotionTrail(startX, startY, targetX, targetY);
            attackerEl.classList.add('animate-smooth-punch');

            setTimeout(() => playRandomPunchSound(), 600);

            const screenFlash = document.createElement('div');
            screenFlash.className = 'quick-flash';
            document.body.appendChild(screenFlash);
            setTimeout(() => screenFlash.remove(), 400);

            return { attackerEl, targetEl, targetX, targetY };
        }

        function animateImpact(targetEl, targetX, targetY, text) {
            setTimeout(() => {
                const effect = document.createElement('div');
                effect.className = 'impact-burst';
                effect.style.left = `${targetX - 50}px`;
                effect.style.top = `${targetY - 50}px`;
                participantsContainer.appendChild(effect);

                targetEl.classList.add('animate-impact-shake');
                createImpactParticles(targetX, targetY);

                const punchText = document.createElement('div');
                punchText.className = 'punch-text';
                punchText.textContent = text;
                punchText.style.left = `${targetX}px`;
                punchText.style.top = `${targetY - 50}px`;
                participantsContainer.appendChild(punchText);

                setTimeout(() => {
                    effect.remove();
                    targetEl.classList.remove('animate-impact-shake');
                    punchText.remove();
                }, 800);
            }, 600);
        }

        function animateSmoothPunch(attackerId, targetId) {
            if (isAnimating()) return;
            setAnimating(true);

            const collision = prepareCollision(attackerId, targetId);
            if (!collision) {
                setAnimating(false);
                return;
            }

            animateImpact(collision.targetEl, collision.targetX, collision.targetY, 'POW!');

            setTimeout(() => {
                collision.attackerEl.classList.remove('animate-smooth-punch');
                setAnimating(false);
            }, 1200);
        }

        function animateSmoothPunchBroadcast(attackerId, targetId, attackerName, targetName) {
            if (isAnimating()) return;
            setAnimating(true);

            const collision = prepareCollision(attackerId, targetId);
            if (!collision) {
                setAnimating(false);
                return;
            }

            collisionOverlay.classList.remove('hidden');

            const collisionText = document.createElement('div');
            collisionText.className = 'punch-text';
            setSafeContent(collisionText, `${sanitizeInput(attackerName)} hits ${sanitizeInput(targetName)}!`);
            collisionText.style.left = '50%';
            collisionText.style.top = '30%';
            collisionText.style.transform = 'translateX(-50%)';
            collisionText.style.fontSize = '1.8rem';
            collisionText.style.animationDelay = '0.2s';
            collisionContainer.appendChild(collisionText);

            animateImpact(collision.targetEl, collision.targetX, collision.targetY, 'POW!');

            setTimeout(() => {
                collision.attackerEl.classList.remove('animate-smooth-punch');
                collisionText.remove();
                collisionOverlay.classList.add('hidden');
                setAnimating(false);
            }, 1200);
        }

        function triggerSuperSaiyan(userId) {
            const participantEl = document.querySelector(`[data-user-id="${userId}"]`);
            if (!participantEl) return;

            const avatar = participantEl.querySelector('.dbz-participant-card');
            if (!avatar) return;

            avatar.classList.add('super-saiyan-mode');

            if (document.body.classList.contains('halloween-theme')) {
                avatar.classList.add('halloween-glow');
                if (window.SPP.themes && window.SPP.themes.triggerHalloweenSparks) {
                    window.SPP.themes.triggerHalloweenSparks();
                }
            }

            if (isSoundEnabled() && celebrationSound) {
                celebrationSound.currentTime = 0;
                celebrationSound.volume = 1;
                celebrationSound.play().catch((e) => console.warn('Sound error:', e));
                setTimeout(() => fadeOutAudio(celebrationSound, 1000), 2000);
            }

            setTimeout(() => {
                avatar.classList.remove('super-saiyan-mode', 'halloween-glow');
            }, 5000);
        }

        function triggerCelebration() {
            celebrationOverlay.classList.remove('hidden');

            const superSaiyanImg = document.getElementById('super-saiyan-img');
            const superSaiyanFallback = document.getElementById('super-saiyan-fallback');

            superSaiyanImg.onload = () => {
                superSaiyanImg.classList.remove('hidden');
                superSaiyanFallback.classList.add('hidden');
            };

            superSaiyanImg.onerror = () => {
                superSaiyanImg.classList.add('hidden');
                superSaiyanFallback.classList.remove('hidden');
                console.warn('Super Saiyan image failed to load, using fallback');
            };

            const consensusGifs = [
                '/images/consensus/consensus-celebrate-hd-1.gif',
                '/images/consensus/consensus-celebrate-hd-2.gif',
                '/images/consensus/consensus-celebrate-hd-3.gif'
            ];
            const randomGif = consensusGifs[Math.floor(Math.random() * consensusGifs.length)];
            superSaiyanImg.src = randomGif + '?' + Date.now();

            if (isSoundEnabled() && celebrationSound) {
                celebrationSound.currentTime = 0;
                celebrationSound.volume = 1;

                const playPromise = celebrationSound.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        fadeOutAudio(celebrationSound, 1000);
                    }).catch((error) => {
                        console.warn('Error playing celebration sound:', error);
                        if (setSoundEnabled) setSoundEnabled(false);
                    });
                }
            }

            setTimeout(() => {
                celebrationOverlay.style.transition = 'opacity 1s ease-out';
                celebrationOverlay.style.opacity = '0';
                setTimeout(() => {
                    celebrationOverlay.classList.add('hidden');
                    celebrationOverlay.style.opacity = '';
                    celebrationOverlay.style.transition = '';
                }, 1000);
            }, 4000);
        }

        return {
            animateSmoothPunch,
            animateSmoothPunchBroadcast,
            triggerSuperSaiyan,
            triggerCelebration
        };
    }

    window.SPP = window.SPP || {};
    window.SPP.avatarEffects = { create };
})();

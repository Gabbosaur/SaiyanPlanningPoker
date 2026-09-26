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

    // --- Konami code -----------------------------------------------------
    // Up Up Down Down Left Right Left Right B A
    const KONAMI_SEQUENCE = [
        'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'
    ];
    // How long the background gif stays at full opacity.
    const KONAMI_BACKDROP_MS = 5000;
    // Duration of the fade-out. Must stay >= the CSS transition on
    // .konami-backdrop so the element isn't removed mid-fade (which would look
    // like a hard cut back to the original background).
    const KONAMI_FADE_MS = 1900;
    const KONAMI_COOLDOWN_MS = 8000;
    // Reset progress if the user pauses mid-sequence.
    const KONAMI_RESET_MS = 2500;

    const KONAMI_GIF_URL = '/images/ssj2-daima.gif';
    const KONAMI_SOUND_URL = '/sounds/super-saiyan-2-aura.mp3';
    const KONAMI_SOUND_VOLUME = 0.85;
    // Play at full volume for this long, then fade out over KONAMI_SOUND_FADE_MS.
    // Together these land just before the backdrop finishes fading (5000+1900ms),
    // so the sound doesn't outlast the visuals.
    const KONAMI_SOUND_PLAY_MS = 4200;
    const KONAMI_SOUND_FADE_MS = 1600;
    let konamiAudio = null;
    // The gif is large (~8MB), so we warm the cache in the background at startup.
    // Without this the first activation stutters: the browser paints the gif as
    // it streams in and restarts the loop once fully loaded.
    let konamiGifPreload = null;

    // Rolling buffer of the last keys pressed (length capped to the sequence).
    const konamiBuffer = [];
    let konamiLastKeyAt = 0;
    let konamiLastFiredAt = 0;

    let buffer = '';
    let lastStageReached = 0; // 0..4
    let lastStageAt = 0;
    let lastFireAt = 0;
    let socketRef = null;
    let sessionIdGetter = null;
    let socketGetter = null;

    // Active local audio instance for the charge sound so we can stop it on fire.
    let chargeAudio = null;

    /**
     * Tracks the Konami code. Runs before the kamehameha buffer because it
     * needs arrow keys too (which the letter-only filter below discards).
     */
    function onKonamiKeyDown(event) {
        const key = event.key;
        if (!key) return;

        // Ignore while typing in an input/textarea.
        const tag = event.target && event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        const now = Date.now();
        if (konamiBuffer.length > 0 && now - konamiLastKeyAt > KONAMI_RESET_MS) {
            konamiBuffer.length = 0;
        }

        // Keep a rolling buffer of the last N keys and just check whether it
        // ends with the sequence. This handles all the fiddly restart cases
        // (repeated prefixes, junk keys mid-way) that an index-based matcher
        // gets wrong — e.g. an extra ArrowUp before the real sequence.
        konamiBuffer.push(normalizeKonamiKey(key));
        if (konamiBuffer.length > KONAMI_SEQUENCE.length) konamiBuffer.shift();
        konamiLastKeyAt = now;

        if (konamiBuffer.length === KONAMI_SEQUENCE.length
            && KONAMI_SEQUENCE.every((k, i) => konamiBuffer[i] === k)) {
            konamiBuffer.length = 0;
            if (now - konamiLastFiredAt >= KONAMI_COOLDOWN_MS) {
                konamiLastFiredAt = now;
                triggerKonami();
            }
        }
    }

    /** Letters are compared case-insensitively; arrow keys as-is. */
    function normalizeKonamiKey(key) {
        return key.length === 1 ? key.toLowerCase() : key;
    }

    /**
     * Konami reward: transform your own avatar into Super Saiyan (same effect
     * as click-spamming your avatar) and show the SSJ2 gif as a full-screen
     * backdrop for a few seconds.
     */
    function triggerKonami() {
        const socket = getSocketRef();
        const sessionId = sessionIdGetter ? sessionIdGetter() : null;

        // Ask the server to broadcast, so the WHOLE effect (backdrop, shockwave,
        // lightning, transformation) plays on every connected client. Fall back
        // to a local-only play if we're not in a session yet.
        if (socket && socket.connected && sessionId) {
            socket.emit('konami', { sessionId });
        } else {
            playKonami({ userId: socket && socket.id });
        }
    }

    /**
     * Plays the full Konami spectacle. Called on every client via the
     * `konami-activated` broadcast so everyone sees the same thing.
     */
    function playKonami({ userId, fromName } = {}) {
        showKonamiBackdrop();
        explodeShockwave();
        stormLightning();
        if (fromName) showKonamiLabel(fromName);
        playKonamiSound();

        // Transform the activator's avatar (same visual as the 20-click egg).
        if (userId && window.SPP.avatarEffectsInstance) {
            window.SPP.avatarEffectsInstance.triggerSuperSaiyan(userId);
        }
    }

    /** Expanding golden shockwave rings + white flash. */
    function explodeShockwave() {
        const flash = document.createElement('div');
        flash.className = 'konami-flash-screen';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 700);

        // Three staggered rings for a layered blast.
        for (let i = 0; i < 3; i++) {
            const ring = document.createElement('div');
            ring.className = 'konami-shockwave';
            ring.style.animationDelay = `${i * 0.13}s`;
            document.body.appendChild(ring);
            setTimeout(() => ring.remove(), 1400 + i * 140);
        }

        // Debris/ki motes blasting outward from the centre.
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        for (let i = 0; i < 26; i++) {
            const mote = document.createElement('div');
            mote.className = 'konami-mote';
            const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.3;
            const distance = 180 + Math.random() * Math.max(window.innerWidth, window.innerHeight) * 0.45;
            const size = 4 + Math.random() * 9;
            mote.style.left = `${cx}px`;
            mote.style.top = `${cy}px`;
            mote.style.width = `${size}px`;
            mote.style.height = `${size}px`;
            mote.style.setProperty('--mx', `${Math.cos(angle) * distance}px`);
            mote.style.setProperty('--my', `${Math.sin(angle) * distance}px`);
            mote.style.animationDelay = `${Math.random() * 0.18}s`;
            document.body.appendChild(mote);
            mote.addEventListener('animationend', () => mote.remove());
        }

        // Screen shake on #game-screen (NOT body: a transformed ancestor would
        // become the containing block for our fixed-position effects).
        const shakeTarget = document.getElementById('game-screen')
            || document.querySelector('main');
        if (shakeTarget) {
            shakeTarget.classList.add('konami-shake');
            setTimeout(() => shakeTarget.classList.remove('konami-shake'), 1100);
        }
    }

    /**
     * SSJ2-style lightning storm across the whole screen, reusing the existing
     * .ssj2-spark visual. Bolts are drawn as chained segments so they zig-zag.
     */
    function stormLightning() {
        const BURSTS = 14;
        for (let b = 0; b < BURSTS; b++) {
            setTimeout(() => spawnBolt(), b * 190 + Math.random() * 90);
        }
        // A couple of dense clusters near the table for extra punch.
        setTimeout(() => { spawnBolt(); spawnBolt(); }, 120);
        setTimeout(() => { spawnBolt(); spawnBolt(); }, 900);
    }

    /** One zig-zagging lightning bolt at a random screen position. */
    function spawnBolt() {
        const startX = window.innerWidth * (0.08 + Math.random() * 0.84);
        const startY = window.innerHeight * (0.08 + Math.random() * 0.8);
        const segments = 3 + Math.floor(Math.random() * 4);

        let cx = startX;
        let cy = startY;
        for (let i = 0; i < segments; i++) {
            const length = 26 + Math.random() * 46;
            const segAngle = (Math.random() * 100 - 50) * (Math.PI / 180);

            const spark = document.createElement('div');
            spark.className = 'ssj2-spark konami-bolt';
            spark.style.left = `${cx}px`;
            spark.style.top = `${cy}px`;
            spark.style.height = `${length}px`;
            // Rotation goes through a custom property: the flash animation
            // re-applies it on every keyframe, so it survives the scaleY pulse.
            spark.style.setProperty('--bolt-rot', `${segAngle}rad`);
            spark.style.animationDelay = `${i * 0.03}s`;
            document.body.appendChild(spark);

            cx += Math.sin(segAngle) * length;
            cy += Math.cos(segAngle) * length;

            setTimeout(() => spark.remove(), 620 + i * 40);
        }
    }

    function showKonamiLabel(fromName) {
        const label = document.createElement('div');
        label.className = 'konami-label';
        label.textContent = `${fromName} — SUPER SAIYAN 2!`;
        document.body.appendChild(label);
        setTimeout(() => label.remove(), 3000);
    }

    /**
     * Plays the SSJ2 aura sound, faded out so it ends with the visuals instead
     * of trailing on well past them.
     */
    function playKonamiSound() {
        try {
            // Stop a previous instance so two activations don't overlap.
            if (konamiAudio) {
                try { konamiAudio.pause(); } catch { /* ignore */ }
                konamiAudio = null;
            }

            const audio = new Audio(KONAMI_SOUND_URL);
            audio.volume = KONAMI_SOUND_VOLUME;
            konamiAudio = audio;
            audio.play().catch(() => { /* ignore autoplay errors */ });

            // Start fading before the visuals end, so audio and visuals finish
            // together rather than the sound lingering.
            setTimeout(() => {
                if (konamiAudio !== audio) return;
                const steps = 24;
                const stepMs = KONAMI_SOUND_FADE_MS / steps;
                const startVolume = audio.volume;
                let step = 0;
                const timer = setInterval(() => {
                    step++;
                    if (konamiAudio !== audio) {
                        clearInterval(timer);
                        return;
                    }
                    audio.volume = Math.max(0, startVolume * (1 - step / steps));
                    if (step >= steps) {
                        clearInterval(timer);
                        try { audio.pause(); } catch { /* ignore */ }
                        if (konamiAudio === audio) konamiAudio = null;
                    }
                }, stepMs);
            }, KONAMI_SOUND_PLAY_MS);
        } catch (e) {
            console.warn('Konami sound failed:', e);
        }
    }

    function showKonamiBackdrop() {
        // Never stack two backdrops.
        document.querySelectorAll('.konami-backdrop').forEach((el) => el.remove());

        const backdrop = document.createElement('div');
        backdrop.className = 'konami-backdrop';

        const img = document.createElement('img');
        img.alt = '';
        img.className = 'konami-backdrop-img';
        // Start hidden and reveal only once the gif is fully decoded. The file is
        // ~8MB: if shown while still downloading, the browser paints it
        // progressively and restarts the animation loop when it completes, which
        // looks like a stutter/reset on the very first play.
        img.style.opacity = '0';
        // Reuse the preloaded (cached) instance when available so the first
        // activation is as smooth as subsequent ones.
        img.src = (konamiGifPreload && konamiGifPreload.src) || KONAMI_GIF_URL;

        const reveal = () => { img.style.opacity = ''; };
        if (img.decode) {
            img.decode().then(reveal).catch(reveal);
        } else if (img.complete) {
            reveal();
        } else {
            img.addEventListener('load', reveal, { once: true });
            img.addEventListener('error', reveal, { once: true });
        }

        backdrop.appendChild(img);

        document.body.appendChild(backdrop);
        // Makes the page background transparent so the backdrop (which sits at
        // a negative z-index, behind the UI) is actually visible.
        document.body.classList.add('konami-active');

        // Fade out, then clean up. The element is removed (and the stacking
        // class dropped) only AFTER the fade has fully completed, so the
        // original background is revealed gradually with no hard cut.
        setTimeout(() => {
            backdrop.classList.add('fading');
            setTimeout(() => {
                backdrop.remove();
                document.body.classList.remove('konami-active');
            }, KONAMI_FADE_MS);
        }, KONAMI_BACKDROP_MS);
    }

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

        // Energy being drawn INTO the orb, denser at higher stages.
        spawnChargeInflow(stage);
        // Electric arcs crackling around the orb from stage 2.
        if (stage >= 2) spawnChargeArcs(stage);
        // Ground/screen rumble that intensifies with the charge.
        const shakeTarget = document.getElementById('game-screen')
            || document.querySelector('main');
        if (shakeTarget) {
            const cls = `kamehameha-rumble-${Math.min(3, stage)}`;
            shakeTarget.classList.add(cls);
            setTimeout(() => shakeTarget.classList.remove(cls), 1200);
        }

        // Orb keeps pulsing until the next stage / fire. If the user never fires,
        // auto-remove after a short while.
        setTimeout(() => orb.remove(), 1500);
    }

    /** Ki motes converging on the charge point (suction effect). */
    function spawnChargeInflow(stage) {
        const cx = window.innerWidth * 0.08;
        const cy = window.innerHeight * 0.5;
        const count = 8 + stage * 6;

        for (let i = 0; i < count; i++) {
            const mote = document.createElement('div');
            mote.className = 'kameha-inflow';
            const angle = Math.random() * Math.PI * 2;
            const distance = 120 + Math.random() * 260;
            const size = 3 + Math.random() * 5;
            mote.style.left = `${cx}px`;
            mote.style.top = `${cy}px`;
            mote.style.width = `${size}px`;
            mote.style.height = `${size}px`;
            // Start out at the rim and travel inward to the centre.
            mote.style.setProperty('--fx', `${Math.cos(angle) * distance}px`);
            mote.style.setProperty('--fy', `${Math.sin(angle) * distance}px`);
            mote.style.animationDelay = `${Math.random() * 0.45}s`;
            document.body.appendChild(mote);
            mote.addEventListener('animationend', () => mote.remove());
        }
    }

    /** Electric arcs crackling around the charging orb. */
    function spawnChargeArcs(stage) {
        const cx = window.innerWidth * 0.08;
        const cy = window.innerHeight * 0.5;
        const radius = stage >= 3 ? 150 : 110;
        const arcs = stage >= 3 ? 7 : 4;

        for (let i = 0; i < arcs; i++) {
            setTimeout(() => {
                const angle = Math.random() * Math.PI * 2;
                let x = cx + Math.cos(angle) * radius * (0.6 + Math.random() * 0.5);
                let y = cy + Math.sin(angle) * radius * (0.6 + Math.random() * 0.5);
                const segments = 2 + Math.floor(Math.random() * 3);
                for (let s = 0; s < segments; s++) {
                    const length = 18 + Math.random() * 30;
                    const segAngle = (Math.random() * 110 - 55) * (Math.PI / 180);
                    const spark = document.createElement('div');
                    spark.className = 'ssj2-spark kameha-arc';
                    spark.style.left = `${x}px`;
                    spark.style.top = `${y}px`;
                    spark.style.height = `${length}px`;
                    spark.style.setProperty('--bolt-rot', `${segAngle}rad`);
                    spark.style.animationDelay = `${s * 0.03}s`;
                    document.body.appendChild(spark);
                    x += Math.sin(segAngle) * length;
                    y += Math.cos(segAngle) * length;
                    setTimeout(() => spark.remove(), 600 + s * 40);
                }
            }, i * 90 + Math.random() * 80);
        }
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

        // Muzzle blast: shockwave rings + debris launched from the firing point.
        fireMuzzleBlast();

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

            // Blinding white flash as the beam erupts.
            const flash = document.createElement('div');
            flash.className = 'kameha-fire-flash';
            document.body.appendChild(flash);
            setTimeout(() => flash.remove(), 800);

            // Lightning crackling along the beam's path as it travels.
            crackleAlongBeam();

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

    /** Recoil blast at the firing point: shockwave rings + flying debris. */
    function fireMuzzleBlast() {
        const cx = window.innerWidth * 0.08;
        const cy = window.innerHeight * 0.5;

        // Concentric rings punching outward from the muzzle.
        for (let i = 0; i < 3; i++) {
            const ring = document.createElement('div');
            ring.className = 'kameha-shockwave';
            ring.style.left = `${cx}px`;
            ring.style.top = `${cy}px`;
            ring.style.animationDelay = `${i * 0.12}s`;
            document.body.appendChild(ring);
            setTimeout(() => ring.remove(), 1300 + i * 130);
        }

        // Debris thrown mostly backwards/sideways (recoil), biased away from the beam.
        for (let i = 0; i < 22; i++) {
            const shard = document.createElement('div');
            shard.className = 'kameha-debris';
            // Bias the spread to the left/up/down (the beam goes right).
            const angle = Math.PI * (0.45 + Math.random() * 1.1);
            const distance = 120 + Math.random() * 320;
            const size = 3 + Math.random() * 7;
            shard.style.left = `${cx}px`;
            shard.style.top = `${cy}px`;
            shard.style.width = `${size}px`;
            shard.style.height = `${size}px`;
            shard.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
            shard.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
            shard.style.animationDelay = `${Math.random() * 0.2}s`;
            document.body.appendChild(shard);
            shard.addEventListener('animationend', () => shard.remove());
        }
    }

    /**
     * Electric arcs snapping off the beam as it sweeps across the screen,
     * timed to roughly follow the wave's leading edge.
     */
    function crackleAlongBeam() {
        const BURSTS = 12;
        const TRAVEL_MS = 1500;
        for (let i = 0; i < BURSTS; i++) {
            const t = (i / BURSTS) * TRAVEL_MS;
            setTimeout(() => {
                // Follow the leading edge horizontally, scatter vertically
                // around the beam's band.
                const x = window.innerWidth * (i / BURSTS) * 1.05;
                const y = window.innerHeight * (0.32 + Math.random() * 0.36);
                let cx = x;
                let cy = y;
                const segments = 2 + Math.floor(Math.random() * 3);
                for (let s = 0; s < segments; s++) {
                    const length = 22 + Math.random() * 38;
                    const segAngle = (Math.random() * 120 - 60) * (Math.PI / 180);
                    const spark = document.createElement('div');
                    spark.className = 'ssj2-spark kameha-arc';
                    spark.style.left = `${cx}px`;
                    spark.style.top = `${cy}px`;
                    spark.style.height = `${length}px`;
                    spark.style.setProperty('--bolt-rot', `${segAngle}rad`);
                    spark.style.animationDelay = `${s * 0.03}s`;
                    document.body.appendChild(spark);
                    cx += Math.sin(segAngle) * length;
                    cy += Math.cos(segAngle) * length;
                    setTimeout(() => spark.remove(), 600 + s * 40);
                }
            }, t);
        }
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
        document.addEventListener('keydown', onKonamiKeyDown);
        document.addEventListener('keydown', onKeyDown);
        preloadKonamiGif();
    }

    /**
     * Warms the browser cache for the Konami gif. Deferred (and low priority) so
     * it never competes with the assets needed to render the app.
     */
    function preloadKonamiGif() {
        if (konamiGifPreload) return;
        const start = () => {
            konamiGifPreload = new Image();
            konamiGifPreload.decoding = 'async';
            if ('fetchPriority' in konamiGifPreload) {
                konamiGifPreload.fetchPriority = 'low';
            }
            konamiGifPreload.src = KONAMI_GIF_URL;
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(start, { timeout: 4000 });
        } else {
            setTimeout(start, 2500);
        }
    }

    window.SPP = window.SPP || {};
    window.SPP.easterEggs = {
        init,
        playKamehamehaStage,
        triggerKamehameha,
        triggerKonami,
        playKonami
    };
})();

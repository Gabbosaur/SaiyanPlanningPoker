// user-grab.js - "Grab & throw" playful avatar interaction.
//
// Physics-driven drag of a participant avatar: the avatar follows the grabber's
// hand with spring inertia (so it lags and swings, which feels satisfying),
// tilts with velocity, and on release is thrown in the flick direction before
// springing elastically back to its seat at the table.
//
// The same code drives BOTH the local grabber and remote spectators, so
// everyone sees the same thing. Offsets travel over the wire normalised to the
// viewport, so different screen sizes stay consistent.
//
// Exposes window.SPP.userGrab.create(deps) -> { begin, setTarget, release, cancelAll, isGrabbing }
(function () {
    'use strict';

    // --- Physics tuning ---------------------------------------------------
    // While held: soft spring toward the hand => visible lag / swing.
    const HELD_STIFFNESS = 0.16;
    const HELD_DAMPING = 0.72;
    // After release: springs back home with overshoot (elastic snap).
    const HOME_STIFFNESS = 0.10;
    const HOME_DAMPING = 0.82;
    // Throw impulse multiplier applied to the flick velocity on release.
    const THROW_BOOST = 1.6;
    // Max throw speed (px/frame) so a violent flick can't fling it miles away.
    const MAX_THROW_SPEED = 55;
    // Rotation: degrees per px/frame of horizontal velocity (capped).
    const TILT_PER_VELOCITY = 1.5;
    const MAX_TILT = 38;
    // Considered "settled" (animation can stop) below these thresholds.
    const SETTLE_DIST = 0.6;
    const SETTLE_SPEED = 0.4;
    // Clamp how far an avatar can be dragged from home (px).
    const MAX_OFFSET = 420;

    // Sound played when someone grabs another user.
    const GRAB_SOUND_URL = '/sounds/dragon-ball-z-grabbing-sound.mp3';
    // Sound played when a thrown avatar slams into the edge of the screen.
    const IMPACT_SOUND_URL = '/sounds/punch-heavy.mp3';

    // --- Wall impact ------------------------------------------------------
    // Margin (px) from the viewport edge counted as "the wall".
    const WALL_MARGIN = 30;
    // Minimum speed (px/frame) required to trigger a crash effect.
    const IMPACT_MIN_SPEED = 9;
    // Energy kept after bouncing off the wall.
    const BOUNCE_RESTITUTION = 0.45;
    // Don't retrigger a crash for the same avatar more often than this.
    const IMPACT_COOLDOWN_MS = 220;

    function create(deps = {}) {
        const isSoundEnabled = deps.isSoundEnabled || (() => false);

        // userId -> physics state
        const grabs = new Map();
        let rafId = null;
        // SVG layer holding the ki beams that link grabber -> victim.
        let beamLayer = null;

        function playSound(url, volume = 0.5) {
            if (!isSoundEnabled()) return;
            try {
                const a = new Audio(url);
                a.volume = volume;
                const p = a.play();
                if (p) p.catch(() => {});
            } catch (e) { /* ignore */ }
        }

        function element(userId) {
            return document.querySelector(`[data-user-id="${userId}"]`);
        }

        /** Lazily creates the full-screen SVG layer used to draw ki beams. */
        function ensureBeamLayer() {
            if (beamLayer && beamLayer.isConnected) return beamLayer;
            beamLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            beamLayer.setAttribute('id', 'ki-beam-layer');
            beamLayer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(beamLayer);
            return beamLayer;
        }

        /** Centre of an avatar element in viewport coordinates. */
        function centreOf(el) {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }

        /**
         * Draws/updates the ki beam linking the grabber to the victim so
         * everyone can see WHO is doing the grabbing.
         */
        function updateBeam(g) {
            if (!g.grabberId) return;
            const grabberEl = element(g.grabberId);
            if (!grabberEl || !g.el) { removeBeam(g); return; }

            const from = centreOf(grabberEl);
            const to = centreOf(g.el);

            if (!g.beam) {
                const layer = ensureBeamLayer();
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'ki-beam');
                layer.appendChild(line);
                const glow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                glow.setAttribute('class', 'ki-beam-glow');
                layer.insertBefore(glow, line);
                g.beam = line;
                g.beamGlow = glow;
            }

            [g.beamGlow, g.beam].forEach((l) => {
                if (!l) return;
                l.setAttribute('x1', from.x);
                l.setAttribute('y1', from.y);
                l.setAttribute('x2', to.x);
                l.setAttribute('y2', to.y);
            });
        }

        /**
         * Detects a high-speed collision with the viewport edges and, if found,
         * bounces the avatar and spawns the crash effect. Works on the avatar's
         * real screen position so it's accurate regardless of seat placement.
         */
        function checkWallImpact(g, userId) {
            if (!g.el) return;
            const r = g.el.getBoundingClientRect();
            const now = performance.now();
            if (now - (g.lastImpactAt || 0) < IMPACT_COOLDOWN_MS) return;

            let hitX = 0, hitY = 0;
            if (r.left <= WALL_MARGIN && g.vx < 0) hitX = -1;
            else if (r.right >= window.innerWidth - WALL_MARGIN && g.vx > 0) hitX = 1;
            if (r.top <= WALL_MARGIN && g.vy < 0) hitY = -1;
            else if (r.bottom >= window.innerHeight - WALL_MARGIN && g.vy > 0) hitY = 1;

            if (!hitX && !hitY) return;

            const speed = Math.hypot(g.vx, g.vy);
            if (speed < IMPACT_MIN_SPEED) return;

            g.lastImpactAt = now;

            // Bounce: reverse the offending axis, losing energy.
            if (hitX) g.vx = -g.vx * BOUNCE_RESTITUTION;
            if (hitY) g.vy = -g.vy * BOUNCE_RESTITUTION;

            // Impact point = the avatar's contact edge.
            const px = hitX === -1 ? r.left : hitX === 1 ? r.right : r.left + r.width / 2;
            const py = hitY === -1 ? r.top : hitY === 1 ? r.bottom : r.top + r.height / 2;

            spawnCrash(px, py, speed);
            playSound(IMPACT_SOUND_URL, Math.min(1, 0.45 + speed / 60));

            // Squash the avatar briefly on impact.
            g.el.classList.add('user-slammed');
            setTimeout(() => {
                if (g.el) g.el.classList.remove('user-slammed');
            }, 260);

            // Shake the screen, scaled by impact strength. Applied to the game
            // screen (not <body>) because a transform on body would become the
            // containing block for position:fixed elements, dragging the ki
            // pointer and beams along with the shake.
            const shakeEl = document.getElementById('game-screen') || document.body;
            shakeEl.classList.remove('screen-shake', 'screen-shake-hard');
            void shakeEl.offsetWidth;
            shakeEl.classList.add(speed > 26 ? 'screen-shake-hard' : 'screen-shake');
            setTimeout(() => {
                shakeEl.classList.remove('screen-shake', 'screen-shake-hard');
            }, 420);
        }

        /** Cracks + debris burst at the impact point. */
        function spawnCrash(x, y, speed) {
            // Crack decal
            const crack = document.createElement('div');
            crack.className = 'wall-crack';
            crack.style.left = x + 'px';
            crack.style.top = y + 'px';
            const scale = Math.min(1.6, 0.7 + speed / 40);
            crack.style.setProperty('--crack-scale', scale.toFixed(2));
            crack.style.setProperty('--crack-rot', (Math.random() * 360).toFixed(0) + 'deg');
            document.body.appendChild(crack);
            crack.addEventListener('animationend', () => crack.remove());

            // Debris shards flying off
            const n = Math.min(14, 6 + Math.round(speed / 5));
            for (let i = 0; i < n; i++) {
                const shard = document.createElement('div');
                shard.className = 'wall-debris';
                const angle = Math.PI * 2 * (i / n) + Math.random() * 0.5;
                const distance = 30 + Math.random() * (30 + speed);
                shard.style.left = x + 'px';
                shard.style.top = y + 'px';
                shard.style.setProperty('--dx', (Math.cos(angle) * distance).toFixed(0) + 'px');
                shard.style.setProperty('--dy', (Math.sin(angle) * distance).toFixed(0) + 'px');
                shard.style.setProperty('--spin', (Math.random() * 720 - 360).toFixed(0) + 'deg');
                const size = 4 + Math.random() * 6;
                shard.style.width = size.toFixed(0) + 'px';
                shard.style.height = size.toFixed(0) + 'px';
                document.body.appendChild(shard);
                shard.addEventListener('animationend', () => shard.remove());
            }
        }

        function removeBeam(g) {
            if (g.beam) { g.beam.remove(); g.beam = null; }
            if (g.beamGlow) { g.beamGlow.remove(); g.beamGlow = null; }
            if (g.grabberId) {
                const grabberEl = element(g.grabberId);
                if (grabberEl) grabberEl.classList.remove('user-grabbing');
            }
        }

        /**
         * Starts a grab on the given user.
         * @param {string} userId - the victim
         * @param {string} [grabberId] - who is grabbing (drawn as a ki beam)
         */
        function begin(userId, grabberId) {
            const el = element(userId);
            if (!el) return;

            // The consensus celebration overlay covers the whole screen for ~5s
            // right when grabbing becomes possible. Fade it down so the action
            // stays visible instead of happening behind a wall of GIF.
            document.body.classList.add('grab-in-progress');

            // Reuse existing state if re-grabbed mid-flight.
            const prev = grabs.get(userId);
            grabs.set(userId, {
                el,
                grabberId: grabberId || null,
                beam: null,
                beamGlow: null,
                x: prev ? prev.x : 0,
                y: prev ? prev.y : 0,
                vx: prev ? prev.vx : 0,
                vy: prev ? prev.vy : 0,
                tx: prev ? prev.x : 0,
                ty: prev ? prev.y : 0,
                held: true
            });

            // Aura on the grabber so it's clear who's responsible.
            if (grabberId) {
                const grabberEl = element(grabberId);
                if (grabberEl) grabberEl.classList.add('user-grabbing');
            }

            // Disable the CSS transition so per-frame transforms aren't smoothed
            // twice (which would feel mushy and lag badly).
            el.classList.add('user-grabbed');
            playSound(GRAB_SOUND_URL, 0.6);
            ensureLoop();
        }

        /**
         * Sets the desired offset (px, relative to the avatar's home seat).
         */
        function setTarget(userId, dx, dy) {
            const g = grabs.get(userId);
            if (!g || !g.held) return;
            const clamp = (v) => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, v));
            g.tx = clamp(dx);
            g.ty = clamp(dy);
        }

        /**
         * Releases the grab, optionally throwing with the given velocity
         * (px/frame). The avatar then springs back to its seat.
         */
        function release(userId, vx = 0, vy = 0) {
            const g = grabs.get(userId);
            if (!g) return;
            g.held = false;

            // Apply the flick as an impulse, capped.
            let ix = (vx || 0) * THROW_BOOST;
            let iy = (vy || 0) * THROW_BOOST;
            const speed = Math.hypot(ix, iy);
            if (speed > MAX_THROW_SPEED) {
                const k = MAX_THROW_SPEED / speed;
                ix *= k;
                iy *= k;
            }
            g.vx += ix;
            g.vy += iy;

            if (g.el) g.el.classList.add('user-thrown');
            if (Math.hypot(ix, iy) > 8) playSound('/sounds/thrust2.mp3', 0.45);
            ensureLoop();
        }

        function finish(userId) {
            const g = grabs.get(userId);
            if (g) {
                removeBeam(g);
                if (g.el) {
                    g.el.style.transform = '';
                    g.el.style.zIndex = '';
                    g.el.classList.remove('user-grabbed', 'user-thrown');
                }
            }
            grabs.delete(userId);
            // Restore the celebration overlay once nothing is being grabbed.
            if (grabs.size === 0) {
                document.body.classList.remove('grab-in-progress');
            }
        }

        function cancelAll() {
            Array.from(grabs.keys()).forEach(finish);
            document.body.classList.remove('grab-in-progress');
        }

        function isGrabbing(userId) {
            const g = grabs.get(userId);
            return !!(g && g.held);
        }

        // --- Animation loop -------------------------------------------------
        function ensureLoop() {
            if (rafId === null) rafId = requestAnimationFrame(step);
        }

        function step() {
            rafId = null;
            if (grabs.size === 0) return;

            grabs.forEach((g, userId) => {
                // Element may have been re-rendered; re-resolve it.
                if (!g.el || !g.el.isConnected) {
                    const el = element(userId);
                    if (!el) { grabs.delete(userId); return; }
                    g.el = el;
                    el.classList.add('user-grabbed');
                }

                const held = g.held;
                const targetX = held ? g.tx : 0;
                const targetY = held ? g.ty : 0;
                const k = held ? HELD_STIFFNESS : HOME_STIFFNESS;
                const d = held ? HELD_DAMPING : HOME_DAMPING;

                // Spring integration.
                g.vx = (g.vx + (targetX - g.x) * k) * d;
                g.vy = (g.vy + (targetY - g.y) * k) * d;
                g.x += g.vx;
                g.y += g.vy;

                // Tilt with horizontal velocity for a "swung around" feel.
                const tilt = Math.max(-MAX_TILT,
                    Math.min(MAX_TILT, g.vx * TILT_PER_VELOCITY));
                // Slight squash/scale while held.
                const scale = held ? 1.12 : 1;

                // Must re-apply the -50%/-50% centering the layout relies on.
                g.el.style.transform =
                    `translate(-50%, -50%) translate(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px) ` +
                    `rotate(${tilt.toFixed(1)}deg) scale(${scale})`;
                g.el.style.zIndex = '400';

                // Ki beam only while actually held (drops on release/throw).
                if (held) {
                    updateBeam(g);
                } else {
                    if (g.beam) removeBeam(g);
                    // Only a thrown (free-flying) avatar can slam into a wall.
                    checkWallImpact(g, userId);
                }

                // Settled and released -> clean up.
                if (!held
                    && Math.hypot(g.x, g.y) < SETTLE_DIST
                    && Math.hypot(g.vx, g.vy) < SETTLE_SPEED) {
                    finish(userId);
                }
            });

            if (grabs.size > 0) ensureLoop();
        }

        return { begin, setTarget, release, cancelAll, isGrabbing };
    }

    window.SPP = window.SPP || {};
    window.SPP.userGrab = { create };
})();

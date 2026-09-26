// genkidama.js - The Spirit Bomb ritual.
//
// Purely ceremonial team moment: when every user running webcam hand mode
// raises their hands to the sky, everyone sees the Genkidama charge and rise.
// It changes no game state — it's the DBZ equivalent of a collective high five.
//
// Charge visuals scale with how many people are donating, so the effect builds
// as teammates join in. Exposes window.SPP.genkidama.create(deps).
(function () {
    'use strict';

    const MUSIC_URL = '/music/Genkidama_Theme_From_Dragon_Ball_GT.mp3';
    const GIF_URL = '/images/Goku-Genkidama-Film-Cyborg.gif';

    // Timings
    const MUSIC_FADE_IN_MS = 1200;
    const MUSIC_FADE_OUT_MS = 2600;
    const MUSIC_VOLUME = 0.7;
    // Minimum number of raised arms before the theme starts. One arm alone is
    // easy to trigger by accident, so the music waits for a clearer intent.
    const MUSIC_MIN_ARMS = 2;

    // --- Escalation tiers (by TOTAL raised arms, whoever raises them) ------
    // Every step adds something new so contributors get visible feedback and
    // onlookers are tempted to join in.
    //   1  -> rising energy only (quiet, mysterious)
    //   2  -> sphere appears + music starts + sky darkens
    //   3  -> light flares + Goku backdrop + orbiting ring (no lightning: the
    //         Genkidama is pure radiant light in the anime, sparks are SSJ2)
    //   4+ -> shockwave pulses + screen rumble
    //
    // Thresholds are kept low on purpose: two people raising both arms only adds
    // up to 4, so spreading the tiers any further would leave the top ones
    // unreachable in a typical session.
    const TIER_SPHERE = 2;
    const TIER_FLARES = 3;
    const TIER_BACKDROP = 3;
    const TIER_SHOCKWAVE = 4;

    // Sphere size is driven by the ABSOLUTE number of raised arms, not by the
    // fraction of the session participating. That way the sphere keeps growing
    // as more people join in — a big team produces a visibly bigger Genkidama
    // than two people do, which is the whole point of the technique.
    // ~12 arms (6 people fully committed) reaches maximum size.
    const ARMS_FOR_MAX_SIZE = 12;
    // Sphere scale range, from "just appeared" to "fully gathered".
    const SPHERE_MIN_SCALE = 0.3;
    const SPHERE_MAX_SCALE = 1.25;
    // Extra swell applied when the ritual completes, on top of the current size.
    const RITUAL_SCALE_BOOST = 0.18;
    // Vertical anchor of the sphere as a fraction of the viewport. Must match
    // `top` in .genkidama-sphere so the ki streams aim at the right spot.
    const SPHERE_ANCHOR_Y = 0.26;
    // The ritual runs for at least this long, then continues while people keep
    // their hands up, up to RITUAL_MAX_MS.
    const RITUAL_MIN_MS = 9000;
    const RITUAL_MAX_MS = 60000;
    // Duration of the closing bloom + fade.
    const RELEASE_MS = 2800;
    // Backdrop fade durations (kept in sync with the CSS transitions).
    const BACKDROP_FADE_MS = 2200;

    function create(deps = {}) {
        const isSoundEnabled = deps.isSoundEnabled || (() => false);

        let charging = false;      // at least one donor
        let firing = false;        // full ritual running
        let releasing = false;     // ritual is winding down
        let activeDonors = 0;      // latest donor count from the server
        let ritualTimer = null;    // minimum-duration timer
        let ritualMaxTimer = null; // hard cap timer
        let flareTimer = null;
        let flarePeriod = 0;
        let shockwaveTimer = null;
        let highestTier = 0;       // highest arm count reached (for unlock pulses)
        // Smoothly-interpolated charge level. CSS custom properties that aren't
        // registered via @property animate discretely, so transitioning
        // --sphere-scale makes the sphere *jump*. We ease it in JS instead.
        let chargeCurrent = 0;
        let chargeTarget = 0;
        let chargeRaf = null;

        let sphereEl = null;
        let skyEl = null;
        let backdropEl = null;
        let music = null;
        let musicFadeTimer = null;
        let motesTimer = null;
        let gifPreload = null;

        // --- Asset preloading (the gif is ~7.7MB) --------------------------
        function preload() {
            if (gifPreload) return;
            const start = () => {
                gifPreload = new Image();
                gifPreload.decoding = 'async';
                if ('fetchPriority' in gifPreload) gifPreload.fetchPriority = 'low';
                gifPreload.src = GIF_URL;
            };
            if ('requestIdleCallback' in window) {
                requestIdleCallback(start, { timeout: 6000 });
            } else {
                setTimeout(start, 4000);
            }
        }

        // --- Sky darkening + sphere ---------------------------------------
        function ensureSky() {
            if (skyEl && skyEl.isConnected) return skyEl;
            skyEl = document.createElement('div');
            skyEl.className = 'genkidama-sky';
            document.body.appendChild(skyEl);
            // Force a frame so the opacity transition actually runs.
            void skyEl.offsetWidth;
            skyEl.classList.add('active');
            return skyEl;
        }

        function ensureSphere() {
            if (sphereEl && sphereEl.isConnected) return sphereEl;
            sphereEl = document.createElement('div');
            sphereEl.className = 'genkidama-sphere';
            sphereEl.innerHTML =
                '<div class="genkidama-core"></div>' +
                '<div class="genkidama-glow"></div>' +
                '<div class="genkidama-ring"></div>';
            document.body.appendChild(sphereEl);
            // Seed the size from the current eased value so it doesn't pop in at
            // the default scale before the first easing frame lands.
            applyCharge();
            void sphereEl.offsetWidth;
            sphereEl.classList.add('active');
            return sphereEl;
        }

        /**
         * Updates the charge state. Called on every progress broadcast.
         * @param {number} donors
         * @param {number} total
         * @param {string[]} donorIds
         */
        /**
         * Updates the charge state on every progress broadcast.
         *
         * Staging is deliberate:
         *  - 1 donor  -> only rising energy (no sphere, no backdrop). Subtle, so
         *                others notice and are tempted to join in.
         *  - 2+ donors-> sphere and Goku backdrop appear and stay while they last.
         * Energy scales per ARM, so raising both arms contributes twice.
         *
         * @param {Object} p
         * @param {number} p.donors      people donating
         * @param {number} p.total       people in hand mode
         * @param {number} p.arms        total raised arms
         * @param {number} p.maxArms     arms if everyone raised both
         * @param {boolean} p.sphereVisible
         * @param {Array<{id:string,hands:number}>} p.donorArms
         */
        function setProgress(p = {}) {
            const donors = p.donors || 0;
            const arms = p.arms || 0;
            const maxArms = p.maxArms || 0;
            const donorArms = p.donorArms || [];

            // Always track the live donor count: the ritual uses it to decide
            // whether to keep going or wind down.
            activeDonors = donors;

            if (firing) {
                if (releasing) return;
                // Keep the energy streams alive while people hold their hands up,
                // and let the sphere keep growing if more people join mid-ritual.
                if (donors > 0) {
                    setChargeTarget(Math.min(1, Math.sqrt(arms / ARMS_FOR_MAX_SIZE)));
                    startMotes(donorArms);
                } else {
                    // Everyone let go — if the minimum duration already elapsed,
                    // start the release now.
                    if (!ritualTimer) beginRelease();
                }
                return;
            }

            if (donors <= 0) {
                stopCharge();
                return;
            }

            charging = true;
            ensureSky();

            // Growth is tied to the ABSOLUTE arm count, so the sphere keeps
            // getting bigger as more people join rather than maxing out as soon
            // as everyone present has committed. Eased with a square root so the
            // early arms feel impactful and later ones add a steadier swell.
            const ratio = Math.min(1, Math.sqrt(arms / ARMS_FOR_MAX_SIZE));

            // Sky darkens progressively with the energy gathered.
            if (skyEl) skyEl.style.setProperty('--sky-strength', ratio.toFixed(3));

            // --- Tiered escalation, driven purely by the arm count -----------
            if (arms >= TIER_SPHERE) {
                ensureSphere();
                // Ease toward the new level so raising another arm makes the
                // sphere swell gradually rather than snapping to a new size.
                setChargeTarget(ratio);
            } else {
                hideSphere();
            }

            if (arms >= TIER_FLARES) {
                startFlares(arms);
            } else {
                stopFlares();
            }

            if (arms >= TIER_BACKDROP) {
                showBackdrop(ratio);
                if (sphereEl) sphereEl.classList.add('show-ring');
            } else {
                hideBackdrop();
                if (sphereEl) sphereEl.classList.remove('show-ring');
            }

            if (arms >= TIER_SHOCKWAVE) {
                startShockwaves();
                document.body.classList.add('genkidama-rumble');
            } else {
                stopShockwaves();
                document.body.classList.remove('genkidama-rumble');
            }

            // Announce each newly-reached tier with a small "unlock" pulse, so
            // the moment of progress is unmistakable.
            announceTier(arms);

            startMotes(donorArms);

            // Music only kicks in from MUSIC_MIN_ARMS raised arms up, so a single
            // arm lifted by accident never starts the theme. Past the threshold
            // it swells with the energy gathered.
            if (arms >= MUSIC_MIN_ARMS) {
                startMusic(0.2 + ratio * 0.5);
            } else if (music) {
                fadeOutMusic();
            }
        }

        /** Everyone lowered their hands: wind everything back down gently. */
        function stopCharge() {
            if (firing) return;
            if (!charging) return;
            charging = false;
            highestTier = 0;
            stopMotes();
            stopFlares();
            stopShockwaves();
            document.body.classList.remove('genkidama-rumble');
            fadeOutMusic();
            hideSphere();
            hideBackdrop();
            if (skyEl) {
                skyEl.classList.remove('active');
                const el = skyEl;
                skyEl = null;
                setTimeout(() => el.remove(), 1800);
            }
        }

        // --- Tier: radiant light flares ------------------------------------
        /**
         * Starts (or re-times) the light flares radiating from the sphere.
         * Faithful to the anime: the Genkidama emits soft beams of light, not
         * electricity. Denser as more arms join.
         */
        function startFlares(arms) {
            const period = Math.max(300, 900 - (arms - TIER_FLARES) * 140);
            if (flareTimer && flarePeriod === period) return;
            stopFlares();
            flarePeriod = period;
            flareTimer = setInterval(() => spawnFlare(), period);
            spawnFlare();
        }

        function stopFlares() {
            if (flareTimer) {
                clearInterval(flareTimer);
                flareTimer = null;
                flarePeriod = 0;
            }
        }

        /** A soft beam of light lancing outward from the sphere. */
        function spawnFlare() {
            if (!sphereEl) return;
            const r = sphereEl.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const radius = Math.max(40, r.width / 2);

            // Two or three beams per burst, spread around the sphere.
            const beams = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < beams; i++) {
                const angle = Math.random() * 360;
                const length = radius * (0.9 + Math.random() * 1.1);

                const flare = document.createElement('div');
                flare.className = 'genkidama-flare';
                flare.style.left = `${cx}px`;
                flare.style.top = `${cy}px`;
                flare.style.height = `${length}px`;
                flare.style.setProperty('--flare-rot', `${angle}deg`);
                flare.style.animationDelay = `${i * 0.08}s`;
                document.body.appendChild(flare);
                flare.addEventListener('animationend', () => flare.remove());
            }

            // A gentle halo bloom in sync with the beams.
            const halo = document.createElement('div');
            halo.className = 'genkidama-halo';
            halo.style.left = `${cx}px`;
            halo.style.top = `${cy}px`;
            halo.style.width = `${radius * 2.2}px`;
            halo.style.height = `${radius * 2.2}px`;
            document.body.appendChild(halo);
            halo.addEventListener('animationend', () => halo.remove());
        }

        // --- Tier: shockwave pulses ---------------------------------------
        function startShockwaves() {
            if (shockwaveTimer) return;
            const pulse = () => {
                if (!sphereEl) return;
                const r = sphereEl.getBoundingClientRect();
                const ring = document.createElement('div');
                ring.className = 'genkidama-shockwave';
                ring.style.left = `${r.left + r.width / 2}px`;
                ring.style.top = `${r.top + r.height / 2}px`;
                document.body.appendChild(ring);
                ring.addEventListener('animationend', () => ring.remove());
            };
            pulse();
            shockwaveTimer = setInterval(pulse, 1500);
        }

        function stopShockwaves() {
            if (shockwaveTimer) {
                clearInterval(shockwaveTimer);
                shockwaveTimer = null;
            }
        }

        // --- Tier unlock feedback ------------------------------------------
        /** Flashes a short "unlock" pulse the first time each tier is reached. */
        function announceTier(arms) {
            if (arms <= highestTier) {
                // Allow re-announcing if the level drops and climbs again.
                if (arms < highestTier) highestTier = arms;
                return;
            }
            highestTier = arms;

            // Only celebrate the steps that actually add something.
            // Deduplicated: TIER_FLARES and TIER_BACKDROP share a value.
            const tierSteps = [...new Set([TIER_SPHERE, TIER_FLARES, TIER_BACKDROP, TIER_SHOCKWAVE])];
            if (!tierSteps.includes(arms)) {
                return;
            }

            const flash = document.createElement('div');
            flash.className = 'genkidama-tier-flash';
            document.body.appendChild(flash);
            flash.addEventListener('animationend', () => flash.remove());

            if (sphereEl) {
                sphereEl.classList.remove('tier-pop');
                void sphereEl.offsetWidth;
                sphereEl.classList.add('tier-pop');
                setTimeout(() => sphereEl && sphereEl.classList.remove('tier-pop'), 600);
            }
        }

        // --- Smooth charge easing -----------------------------------------
        /** Sets the charge level to ease toward (0..1). */
        function setChargeTarget(ratio) {
            chargeTarget = Math.max(0, Math.min(1, ratio));
            if (chargeRaf === null) {
                chargeRaf = requestAnimationFrame(stepCharge);
            }
        }

        /**
         * Eases chargeCurrent toward chargeTarget and writes the derived size /
         * intensity onto the sphere every frame. Framerate-independent easing.
         */
        function stepCharge() {
            chargeRaf = null;
            const diff = chargeTarget - chargeCurrent;

            if (Math.abs(diff) < 0.001) {
                chargeCurrent = chargeTarget;
            } else {
                // ~6% of the remaining distance per frame: a soft, organic swell.
                chargeCurrent += diff * 0.06;
            }

            applyCharge();

            if (chargeCurrent !== chargeTarget) {
                chargeRaf = requestAnimationFrame(stepCharge);
            }
        }

        function applyCharge() {
            if (!sphereEl) return;
            const span = SPHERE_MAX_SCALE - SPHERE_MIN_SCALE;
            const boost = firing ? RITUAL_SCALE_BOOST : 0;
            const scale = SPHERE_MIN_SCALE + chargeCurrent * span + boost;
            sphereEl.style.setProperty('--charge', chargeCurrent.toFixed(3));
            sphereEl.style.setProperty('--sphere-scale', scale.toFixed(3));
        }

        function stopChargeEasing() {
            if (chargeRaf !== null) {
                cancelAnimationFrame(chargeRaf);
                chargeRaf = null;
            }
        }

        /** Fades the sphere out (used when dropping below 2 donors). */
        function hideSphere() {
            if (!sphereEl) return;
            stopChargeEasing();
            chargeCurrent = 0;
            chargeTarget = 0;
            sphereEl.classList.remove('active');
            const el = sphereEl;
            sphereEl = null;
            setTimeout(() => el.remove(), 1200);
        }

        /** Fades the Goku backdrop out. */
        function hideBackdrop() {
            if (!backdropEl) return;
            backdropEl.classList.add('fading');
            const el = backdropEl;
            backdropEl = null;
            // Drop the stacking class only AFTER the fade finishes. It's what
            // lifts the UI (z-index 1) above the backdrop (z-index 0); removing
            // it early let the still-visible, still-fading gif paint over the
            // header and footer.
            setTimeout(() => {
                el.remove();
                // A new backdrop may have appeared meanwhile (ritual restarted);
                // in that case it still needs the stacking class.
                if (!backdropEl) {
                    document.body.classList.remove('genkidama-active');
                }
            }, BACKDROP_FADE_MS + 200);
        }

        // --- Ki motes rising from each donor ------------------------------
        /**
         * Streams ki motes from every donor. Someone raising both arms emits
         * twice as many, making the difference visible.
         * @param {Array<{id:string,hands:number}>} donorArms
         */
        function startMotes(donorArms) {
            stopMotes();
            if (!donorArms || !donorArms.length) return;
            motesTimer = setInterval(() => {
                donorArms.forEach((d) => {
                    const streams = Math.max(1, Math.min(2, d.hands || 1));
                    for (let i = 0; i < streams; i++) spawnMote(d.id, streams, i);
                });
            }, 220);
        }

        function stopMotes() {
            if (motesTimer) {
                clearInterval(motesTimer);
                motesTimer = null;
            }
        }

        /**
         * One ki mote travelling from a donor's avatar up to the sphere.
         * With two arms the streams start slightly left/right of centre so you
         * can see two distinct columns of energy.
         */
        function spawnMote(userId, streams = 1, index = 0) {
            const el = document.querySelector(`[data-user-id="${userId}"]`);
            if (!el) return;
            const r = el.getBoundingClientRect();
            const armOffset = streams > 1 ? (index === 0 ? -16 : 16) : 0;
            const fromX = r.left + r.width / 2 + armOffset + (Math.random() * 14 - 7);
            const fromY = r.top + r.height / 2;

            // Aim at the sphere's actual centre when it exists, so the streams
            // stay aligned as it grows; otherwise use its resting anchor.
            let toX = window.innerWidth / 2;
            let toY = window.innerHeight * SPHERE_ANCHOR_Y;
            if (sphereEl) {
                const sr = sphereEl.getBoundingClientRect();
                toX = sr.left + sr.width / 2;
                toY = sr.top + sr.height / 2;
            }

            const mote = document.createElement('div');
            mote.className = 'genkidama-mote';
            const size = 5 + Math.random() * 6;
            mote.style.width = `${size}px`;
            mote.style.height = `${size}px`;
            mote.style.left = `${fromX}px`;
            mote.style.top = `${fromY}px`;
            mote.style.setProperty('--tx', `${toX - fromX}px`);
            mote.style.setProperty('--ty', `${toY - fromY}px`);
            mote.style.animationDuration = `${1.1 + Math.random() * 0.5}s`;
            document.body.appendChild(mote);
            mote.addEventListener('animationend', () => mote.remove());
        }

        // --- Full ritual ---------------------------------------------------
        function fire({ donors, donorNames } = {}) {
            if (firing) return;
            firing = true;
            charging = false;

            ensureSky();
            const sphere = ensureSphere();
            // Keep whatever size the team actually gathered (a 12-arm Genkidama
            // must stay bigger than a 4-arm one) and just add a final swell via
            // RITUAL_SCALE_BOOST in applyCharge.
            applyCharge();
            sphere.classList.add('complete');

            showBackdrop(1);
            startMusic(MUSIC_VOLUME);
            showLabel(donors, donorNames);

            // The ritual holds for a minimum time, then keeps going for as long
            // as people are still donating. It only winds down once everyone has
            // lowered their hands (or the max duration is hit), so the music and
            // visuals don't cut out from under an active team.
            if (ritualTimer) clearTimeout(ritualTimer);
            ritualTimer = setTimeout(() => {
                ritualTimer = null;
                maybeFinish();
            }, RITUAL_MIN_MS);

            // Hard cap so it can't run forever if someone walks away with their
            // hands up.
            if (ritualMaxTimer) clearTimeout(ritualMaxTimer);
            ritualMaxTimer = setTimeout(() => {
                ritualMaxTimer = null;
                beginRelease();
            }, RITUAL_MAX_MS);
        }

        /**
         * Ends the ritual only if nobody is donating any more; otherwise keeps it
         * alive and re-checks when the donor count next changes.
         */
        function maybeFinish() {
            if (!firing) return;
            if (activeDonors > 0) return;   // still being held: keep going
            beginRelease();
        }

        /** Sphere blooms, then everything fades out. */
        function beginRelease() {
            if (!firing || releasing) return;
            releasing = true;
            if (ritualTimer) { clearTimeout(ritualTimer); ritualTimer = null; }
            if (ritualMaxTimer) { clearTimeout(ritualMaxTimer); ritualMaxTimer = null; }

            stopMotes();
            if (sphereEl) sphereEl.classList.add('release');
            setTimeout(() => finish(), RELEASE_MS);
        }

        function finish() {
            stopMotes();
            fadeOutMusic();

            if (sphereEl) {
                sphereEl.classList.remove('active', 'complete');
                const el = sphereEl;
                sphereEl = null;
                setTimeout(() => el.remove(), 1600);
            }
            // Handles the fade and drops the stacking class only once it's done,
            // so the fading gif never paints over the header/footer.
            hideBackdrop();
            if (skyEl) {
                skyEl.classList.remove('active');
                const el = skyEl;
                skyEl = null;
                setTimeout(() => el.remove(), 1800);
            }

            setTimeout(() => {
                firing = false;
                releasing = false;
            }, 1200);
        }

        // --- Backdrop gif ---------------------------------------------------
        /**
         * Shows the Goku backdrop, or just updates its intensity if it's already
         * up (so it persists smoothly while 2+ people keep donating).
         * @param {number} intensity 0..1
         */
        function showBackdrop(intensity = 1) {
            if (backdropEl && backdropEl.isConnected) {
                backdropEl.style.setProperty('--backdrop-strength', intensity.toFixed(3));
                return;
            }
            document.querySelectorAll('.genkidama-backdrop').forEach((el) => el.remove());

            backdropEl = document.createElement('div');
            backdropEl.className = 'genkidama-backdrop';
            backdropEl.style.setProperty('--backdrop-strength', intensity.toFixed(3));

            const img = document.createElement('img');
            img.alt = '';
            img.className = 'genkidama-backdrop-img';
            // Hold hidden until decoded: the gif is large, and showing it while
            // still streaming makes it restart its loop (visible stutter).
            img.style.opacity = '0';
            img.src = (gifPreload && gifPreload.src) || GIF_URL;
            const reveal = () => { img.style.opacity = ''; };
            if (img.decode) {
                img.decode().then(reveal).catch(reveal);
            } else if (img.complete) {
                reveal();
            } else {
                img.addEventListener('load', reveal, { once: true });
                img.addEventListener('error', reveal, { once: true });
            }

            backdropEl.appendChild(img);
            document.body.appendChild(backdropEl);
            // Lifts the UI above the backdrop without touching the page
            // background, so the fade-out reveals the original look seamlessly.
            document.body.classList.add('genkidama-active');
        }

        function showLabel(donors, donorNames) {
            const label = document.createElement('div');
            label.className = 'genkidama-label';

            const title = document.createElement('div');
            title.className = 'genkidama-label-title';
            title.textContent = 'GENKIDAMA';
            label.appendChild(title);

            const sub = document.createElement('div');
            sub.className = 'genkidama-label-sub';
            sub.textContent = donors === 1
                ? 'Un guerriero dona la sua energia'
                : donors > 1
                    ? `${donors} guerrieri donano la loro energia`
                    : 'Energia condivisa';
            label.appendChild(sub);

            document.body.appendChild(label);
            setTimeout(() => {
                label.classList.add('fading');
                setTimeout(() => label.remove(), 1200);
            }, 4200);
        }

        // --- Music ----------------------------------------------------------
        /**
         * Starts the theme (once) and ramps toward `targetVolume`. Called
         * repeatedly as participation changes, so the track swells rather than
         * restarting. Volume is capped by MUSIC_VOLUME.
         */
        function startMusic(targetVolume = MUSIC_VOLUME) {
            if (!isSoundEnabled()) return;
            const target = Math.max(0, Math.min(MUSIC_VOLUME, targetVolume));

            try {
                if (!music) {
                    music = new Audio(MUSIC_URL);
                    music.loop = true;
                    music.volume = 0;
                    // Safety net: some browsers don't honour `loop` reliably on
                    // long streamed files, so restart manually if it ever ends
                    // while the ritual is still running.
                    music.addEventListener('ended', () => {
                        if (music && (charging || firing) && !releasing) {
                            try {
                                music.currentTime = 0;
                                music.play().catch(() => {});
                            } catch { /* ignore */ }
                        }
                    });
                    const playPromise = music.play();
                    if (playPromise) {
                        playPromise.catch((err) => {
                            // Autoplay policies block audio until the user has
                            // interacted with the page. Surface it instead of
                            // failing silently.
                            console.warn('Genkidama music blocked by autoplay policy:', err && err.name);
                        });
                    }
                }
                rampMusicTo(target, MUSIC_FADE_IN_MS);
            } catch (e) {
                console.warn('Genkidama music failed:', e);
            }
        }

        /** Smoothly ramps the current music volume to `target`. */
        function rampMusicTo(target, durationMs) {
            if (!music) return;
            if (musicFadeTimer) clearInterval(musicFadeTimer);
            const audio = music;
            const from = audio.volume;
            const steps = 20;
            const stepMs = Math.max(20, durationMs / steps);
            let step = 0;
            musicFadeTimer = setInterval(() => {
                step++;
                if (music !== audio) { clearInterval(musicFadeTimer); return; }
                audio.volume = Math.max(0, Math.min(1, from + (target - from) * (step / steps)));
                if (step >= steps) clearInterval(musicFadeTimer);
            }, stepMs);
        }

        function fadeOutMusic() {
            if (!music) return;
            if (musicFadeTimer) clearInterval(musicFadeTimer);
            const target = music;
            const steps = 26;
            const stepMs = MUSIC_FADE_OUT_MS / steps;
            const start = target.volume;
            let step = 0;
            musicFadeTimer = setInterval(() => {
                step++;
                if (music !== target) { clearInterval(musicFadeTimer); return; }
                target.volume = Math.max(0, start * (1 - step / steps));
                if (step >= steps) {
                    clearInterval(musicFadeTimer);
                    stopMusic();
                }
            }, stepMs);
        }

        function stopMusic() {
            if (!music) return;
            try {
                music.pause();
                music.currentTime = 0;
            } catch { /* ignore */ }
            music = null;
        }

        function reset() {
            stopMotes();
            stopMusic();
            stopChargeEasing();
            chargeCurrent = 0;
            chargeTarget = 0;
            if (ritualTimer) { clearTimeout(ritualTimer); ritualTimer = null; }
            if (ritualMaxTimer) { clearTimeout(ritualMaxTimer); ritualMaxTimer = null; }
            firing = false;
            releasing = false;
            charging = false;
            activeDonors = 0;
            document.body.classList.remove('genkidama-active');
            document.querySelectorAll(
                '.genkidama-sphere, .genkidama-sky, .genkidama-backdrop, .genkidama-label, .genkidama-mote'
            ).forEach((el) => el.remove());
            sphereEl = skyEl = backdropEl = null;
        }

        preload();

        return { setProgress, fire, reset, isFiring: () => firing };
    }

    window.SPP = window.SPP || {};
    window.SPP.genkidama = { create };
})();

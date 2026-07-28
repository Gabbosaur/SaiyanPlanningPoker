// hand-control.js - Control the UI with hand gestures via webcam.
//
// Uses MediaPipe Hand Landmarker (loaded from CDN) to track one hand and
// synthesises hover/click on the existing interactive elements. The video
// never leaves the browser.
//
// Interaction model (GESTURE = 'pinch' | 'fist'):
//   - The index knuckle (MCP) drives a smoothed on-screen pointer. It feels
//     like pointing with the index finger yet stays stable when the hand
//     closes into a fist, unlike the fingertip which swings away on close.
//   - Click gesture, edge-triggered on the frame it engages, gated by dwell +
//     post-click cooldown so accidental gestures don't fire actions:
//       * 'pinch' = thumb tip (4) touching index tip (8)  [default]
//       * 'fist'  = all four fingers curled
//   - Destructive targets (e.g. reset) require a *held* gesture (~1s) with a
//     visible progress ring before the click is issued.
//   - Occlusion gate (pinch): if the thumb/index fingertips can't be reliably
//     seen (hidden behind the hand, or the tracking jumps), ALL actions freeze
//     and the pointer turns grey/dashed until tracking recovers.
//
// Exposes window.SPP.handControl.create(deps) -> { start, stop, toggle, isActive }.
(function () {
    'use strict';

    const MEDIAPIPE_VISION_CDN =
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const HAND_MODEL_URL =
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
    const WASM_ROOT = MEDIAPIPE_VISION_CDN + '/wasm';

    // --- Tuning constants ------------------------------------------------
    // Gesture mode: 'fist' (close hand) or 'pinch' (thumb + index touch).
    // Default is 'fist': the palm-anchored pointer stays rock-steady when the
    // hand closes, and there's no finger self-occlusion to fight — so hovering
    // a card and clicking is far more reliable than pinch. Pinch is kept as an
    // option, but its fingertips tend to occlude each other exactly at the
    // moment of the pinch, which the reliability gate then (correctly) freezes.
    const GESTURE = 'fist';

    // Fist detection: number of the four fingers (index, middle, ring, pinky)
    // that are curled. Hysteresis: >= CLOSE curled fingers engages the fist,
    // dropping to <= OPEN releases it. A real fist needs ALL FOUR fingers
    // clearly curled, so a slightly-open hand doesn't fire.
    const FIST_CLOSE = 4;   // all 4 fingers must be curled => fist (click)
    const FIST_OPEN = 2;    // <=2 curled fingers => open (release)
    // A finger counts as "curled" when its tip folds back toward its own base:
    // tipToBase / pipToBase < threshold. Extended finger ~= 2.0, a clear fist
    // is well below 1.0. ~1.1 requires a genuine curl without being fussy.
    const FINGER_CURL_RATIO = 1.1;

    // Pinch detection: thumb tip (4) to index tip (8), normalised by hand span
    // (wrist 0 -> middle-base 9). Hysteresis: below CLOSE engages, above OPEN
    // releases. Thumb+index is the most reliable pair (least self-occlusion).
    // CLOSE is tight so the fingertips must actually (nearly) touch, not just
    // approach — avoids firing while the fingers are still apart.
    const PINCH_CLOSE = 0.18;
    const PINCH_OPEN = 0.32;

    // --- Occlusion / reliability gate -----------------------------------
    // MediaPipe always outputs 21 landmarks, guessing hidden fingers. We treat
    // the pinch fingers as UNRELIABLE (and freeze all actions) when:
    //   - a pinch fingertip sits too far behind the palm plane (z depth), or
    //   - a fingertip teleports between frames (implausible velocity), or
    //   - the hand is angled so steeply the fingers likely hide each other.
    // A fingertip is "behind" the palm when its z exceeds the palm z by more
    // than this fraction of the hand span.
    const OCCLUSION_Z_RATIO = 0.55;
    // Max plausible per-frame fingertip travel (fraction of hand span). Above
    // this, the landmark is a bad guess (finger popped out of view).
    const MAX_TIP_JUMP_RATIO = 0.9;
    // The gate must be clear for this long before actions re-arm (debounce so
    // a single clean frame after occlusion doesn't immediately fire).
    const RELIABLE_SETTLE_MS = 120;

    // Pointer smoothing (exponential moving average). Lower = smoother/laggier.
    const SMOOTHING = 0.35;

    // Time the pointer must rest on a target before a pinch can click it.
    // Short, since the pinch rising-edge is the primary accidental-click guard.
    const DWELL_MS = 90;
    // Minimum gap between two clicks.
    const CLICK_COOLDOWN_MS = 850;
    // Held-pinch duration required to trigger a destructive action.
    const CONFIRM_HOLD_MS = 1000;
    // If no hand is seen for this long, hide the pointer.
    const HAND_LOST_MS = 700;

    // Selectors for elements the pointer can interact with.
    const TARGET_SELECTOR = [
        '.dbz-card-btn',
        '#reset-btn',
        '.emoji-btn',
        '#settings-btn',
        '#close-settings',
        '#save-settings',
        '#music-player-toggle',
        '#copy-invite-btn',
        '#create-session-btn',
        'button[type="submit"]'
    ].join(',');

    // Targets that require a held-pinch confirmation (hard to undo / affects
    // everyone in the session).
    const DESTRUCTIVE_SELECTOR = '#reset-btn';

    /**
     * @param {Object} deps
     * @param {() => void} [deps.onStart]
     * @param {() => void} [deps.onStop]
     */
    function create(deps = {}) {
        const { showToast, showNotification } = window.SPP.utils;

        let active = false;
        let starting = false;

        let handLandmarker = null;
        let video = null;
        let rafId = null;

        // DOM refs (created lazily)
        let pointerEl = null;
        let ringEl = null;
        let camPanel = null;
        let statusDot = null;
        let statusText = null;
        // Set by makeDraggable; re-clamps the panel into view once visible.
        let repositionPanel = null;

        // Ki-trail particle pool (reused DOM nodes to avoid GC churn)
        let trailLayer = null;
        const TRAIL_POOL_SIZE = 18;
        let trailPool = [];
        let trailIdx = 0;
        let lastTrailX = null;
        let lastTrailY = null;
        // Only spawn a trail particle every few px of movement.
        const TRAIL_MIN_STEP = 6;

        // Pointer state
        let smoothX = null;
        let smoothY = null;
        let lastHandSeen = 0;

        // Gesture state machine (used for both fist and pinch)
        let isGesture = false;
        let gestureStartedAt = 0;
        // Edge flag: true only on the single frame where the gesture just
        // engaged. A click requires this rising edge, so arriving at a target
        // with the hand already closed/pinched never fires a click.
        let gestureJustClosed = false;

        // Reliability gate
        let reliable = true;
        let reliableSince = 0;
        // Previous-frame fingertip positions (for velocity/teleport check).
        let prevThumb = null;
        let prevIndex = null;

        // Target dwell state
        let currentTarget = null;
        let targetEnteredAt = 0;

        // Click gating
        let lastClickAt = 0;
        let clickArmed = true; // becomes false after a click until the fist opens

        // Confirm (held fist) state
        let confirmTarget = null;
        let confirmStartAt = 0;

        // Magnetic dock effect on the vote cards
        const MAGNET_RADIUS = 240;      // px of horizontal influence
        const MAGNET_MAX_SCALE = 0.55;  // hovered card grows up to +55%
        const MAGNET_PUSH = 46;         // px neighbours slide away to make room
        const MAGNET_FALLOFF = 3.5;     // gaussian sharpness
        // Cached CLEAN card geometry (positions before any transform) so the
        // magnet math never feeds back on itself.
        let cardCache = null;
        let cardsMagnetized = false;

        // ------------------------------------------------------------------
        // DOM setup
        // ------------------------------------------------------------------
        function ensureDom() {
            if (pointerEl) return;

            // Trail layer sits under the pointer; holds pooled particles + bursts.
            trailLayer = document.createElement('div');
            trailLayer.id = 'hand-trail-layer';
            for (let i = 0; i < TRAIL_POOL_SIZE; i++) {
                const p = document.createElement('div');
                p.className = 'hand-trail-dot';
                trailLayer.appendChild(p);
                trailPool.push(p);
            }

            pointerEl = document.createElement('div');
            pointerEl.id = 'hand-pointer';
            // Inner core + comet tail elements for a richer look.
            pointerEl.innerHTML = '<span class="hand-pointer-core"></span>';

            ringEl = document.createElement('div');
            ringEl.id = 'hand-pointer-ring';

            camPanel = document.createElement('div');
            camPanel.id = 'hand-cam-panel';
            camPanel.className = 'hidden';
            camPanel.innerHTML = `
                <div id="hand-cam-header">
                    <div id="hand-cam-title"><i class="fas fa-hand-sparkles"></i> Ki Control</div>
                    <button id="hand-cam-close" title="Turn off hand control" aria-label="Turn off hand control">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="hand-cam-wrap">
                    <video id="hand-cam-video" playsinline muted></video>
                    <canvas id="hand-cam-canvas"></canvas>
                </div>
                <div id="hand-cam-status">
                    <span style="display:flex;align-items:center;gap:6px;">
                        <span class="hand-status-dot searching"></span>
                        <span id="hand-cam-status-text">Starting…</span>
                    </span>
                    <span style="opacity:0.6;" id="hand-cam-hint"></span>
                </div>
            `;

            document.body.appendChild(trailLayer);
            document.body.appendChild(pointerEl);
            document.body.appendChild(ringEl);
            document.body.appendChild(camPanel);

            video = camPanel.querySelector('#hand-cam-video');
            statusDot = camPanel.querySelector('.hand-status-dot');
            statusText = camPanel.querySelector('#hand-cam-status-text');

            // Hint reflects the active gesture mode.
            const hintEl = camPanel.querySelector('#hand-cam-hint');
            if (hintEl) {
                hintEl.textContent = GESTURE === 'pinch'
                    ? 'pollice+indice = click 🤏'
                    : 'pugno = click 👊';
            }

            camPanel.querySelector('#hand-cam-close').addEventListener('click', () => stop());
            makeDraggable(camPanel, camPanel.querySelector('#hand-cam-header'));
        }

        /**
         * Makes `el` draggable by `handle`. Position is pinned via left/top and
         * clamped to the viewport, and persisted in localStorage. Supports both
         * mouse and touch. The close button inside the handle is ignored.
         */
        function makeDraggable(el, handle) {
            let dragging = false;
            let startX = 0;
            let startY = 0;
            let originLeft = 0;
            let originTop = 0;

            function applyPosition(left, top) {
                const rect = el.getBoundingClientRect();
                // Fall back to the panel's CSS width if it's currently hidden
                // (getBoundingClientRect is 0x0 while display:none), so the
                // clamp doesn't let the panel drift off-screen.
                const w = rect.width || 200;
                const h = rect.height || 180;
                const maxLeft = Math.max(0, window.innerWidth - w);
                const maxTop = Math.max(0, window.innerHeight - h);
                const clampedLeft = Math.max(0, Math.min(left, maxLeft));
                const clampedTop = Math.max(0, Math.min(top, maxTop));
                el.style.left = clampedLeft + 'px';
                el.style.top = clampedTop + 'px';
                el.style.right = 'auto';
                el.style.bottom = 'auto';
                return { left: clampedLeft, top: clampedTop };
            }

            // Re-applies the current position with viewport clamping. Called
            // after the panel becomes visible (when it finally has real
            // dimensions) so a restored off-screen position snaps back in view.
            function reclamp() {
                const left = parseFloat(el.style.left);
                const top = parseFloat(el.style.top);
                if (Number.isFinite(left) && Number.isFinite(top)) {
                    applyPosition(left, top);
                }
            }
            repositionPanel = reclamp;

            // Restore saved position (if any). Re-clamped again on show.
            try {
                const saved = JSON.parse(localStorage.getItem('spp-handcam-pos') || 'null');
                if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
                    applyPosition(saved.left, saved.top);
                }
            } catch (e) { /* ignore */ }

            function pointerXY(e) {
                if (e.touches && e.touches.length) {
                    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
                }
                return { x: e.clientX, y: e.clientY };
            }

            function onDown(e) {
                // Don't start a drag from the close button.
                if (e.target.closest('#hand-cam-close')) return;
                dragging = true;
                el.classList.add('dragging');
                const p = pointerXY(e);
                startX = p.x;
                startY = p.y;
                const rect = el.getBoundingClientRect();
                originLeft = rect.left;
                originTop = rect.top;
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                document.addEventListener('touchmove', onMove, { passive: false });
                document.addEventListener('touchend', onUp);
                e.preventDefault();
            }

            function onMove(e) {
                if (!dragging) return;
                const p = pointerXY(e);
                applyPosition(originLeft + (p.x - startX), originTop + (p.y - startY));
                e.preventDefault();
            }

            function onUp() {
                if (!dragging) return;
                dragging = false;
                el.classList.remove('dragging');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onUp);
                const rect = el.getBoundingClientRect();
                try {
                    localStorage.setItem('spp-handcam-pos',
                        JSON.stringify({ left: rect.left, top: rect.top }));
                } catch (e) { /* ignore */ }
            }

            handle.addEventListener('mousedown', onDown);
            handle.addEventListener('touchstart', onDown, { passive: false });

            // Keep the panel on-screen if the window is resized.
            window.addEventListener('resize', () => {
                const rect = el.getBoundingClientRect();
                applyPosition(rect.left, rect.top);
            });
        }

        function setStatus(state, text) {
            if (!statusDot) return;
            statusDot.className = 'hand-status-dot ' + state;
            if (text) statusText.textContent = text;
        }

        // ------------------------------------------------------------------
        // MediaPipe loading
        // ------------------------------------------------------------------
        async function loadLandmarker() {
            if (handLandmarker) return handLandmarker;
            // Dynamic import of the ESM bundle from CDN.
            const vision = await import(
                /* @vite-ignore */ MEDIAPIPE_VISION_CDN + '/vision_bundle.mjs'
            );
            const { HandLandmarker, FilesetResolver } = vision;
            const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
            handLandmarker = await HandLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
                runningMode: 'VIDEO',
                numHands: 1
            });
            return handLandmarker;
        }

        // ------------------------------------------------------------------
        // Webcam
        // ------------------------------------------------------------------
        async function startCamera() {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
            video.srcObject = stream;
            await video.play();
            return stream;
        }

        function stopCamera() {
            if (video && video.srcObject) {
                video.srcObject.getTracks().forEach((t) => t.stop());
                video.srcObject = null;
            }
        }

        // ------------------------------------------------------------------
        // Geometry helpers
        // ------------------------------------------------------------------
        function dist(a, b) {
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dz = (a.z || 0) - (b.z || 0);
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        // Palm centre: average of wrist (0) and the four finger bases
        // (5, 9, 13, 17). Stable whether the hand is open or in a fist, so the
        // pointer doesn't jump when you close your hand to click.
        function palmCenter(lm) {
            const pts = [lm[0], lm[5], lm[9], lm[13], lm[17]];
            let x = 0, y = 0;
            for (const p of pts) { x += p.x; y += p.y; }
            return { x: x / pts.length, y: y / pts.length };
        }

        // Pointer anchor: the index-finger knuckle (MCP, landmark 5). It sits
        // further forward/up than the palm centre — so it feels like you're
        // pointing with your index finger — yet barely moves when the hand
        // closes into a fist, keeping the pointer stable through the click.
        // Blended slightly toward the palm centre to damp knuckle jitter.
        function pointerAnchor(lm) {
            const knuckle = lm[5];
            const palm = palmCenter(lm);
            const k = 0.8; // 0 = palm centre, 1 = pure knuckle
            return {
                x: knuckle.x * k + palm.x * (1 - k),
                y: knuckle.y * k + palm.y * (1 - k)
            };
        }

        // Counts how many of the four fingers (index, middle, ring, pinky) are
        // curled, using a metric LOCAL to each finger so it works regardless of
        // hand orientation (palm facing, side-on, back of hand).
        //
        // For each finger we compare the tip->MCP(base) distance against the
        // PIP->MCP distance. Extended: the tip is ~2x further from the base
        // than the PIP is. Curled: the tip folds back near the base, so the
        // ratio drops below FINGER_CURL_RATIO. Uses 3D distances (incl. z) so
        // rotation doesn't fool it. Thumb is ignored (curls sideways).
        function countCurledFingers(lm) {
            // [tip, pip, mcp] landmark triples for index, middle, ring, pinky.
            const fingers = [[8, 6, 5], [12, 10, 9], [16, 14, 13], [20, 18, 17]];
            let curled = 0;
            for (const [tip, pip, mcp] of fingers) {
                const tipToBase = dist(lm[tip], lm[mcp]);
                const pipToBase = dist(lm[pip], lm[mcp]) || 1e-6;
                if (tipToBase < pipToBase * FINGER_CURL_RATIO) curled++;
            }
            return curled;
        }

        // Hand span: wrist (0) to middle-finger base (9). Used to normalise all
        // distances so thresholds are independent of hand distance from camera.
        function handSpan(lm) {
            return dist(lm[0], lm[9]) || 1e-6;
        }

        // Normalised pinch distance for the reliable thumb(4)+index(8) pair.
        function pinchRatio(lm) {
            return dist(lm[4], lm[8]) / handSpan(lm);
        }

        // Decides whether the pinch fingertips are reliably visible. MediaPipe
        // guesses occluded fingers, so we look for tell-tale signs of a bad
        // guess rather than trusting the raw landmarks.
        //
        // Returns { ok: boolean, reason: string }.
        function assessReliability(lm) {
            const span = handSpan(lm);
            const palm = palmCenter(lm);
            // Approx palm depth = average z of wrist + finger bases.
            const palmZ = (lm[0].z + lm[5].z + lm[9].z + lm[13].z + lm[17].z) / 5;

            // 1) Depth check: a fingertip sitting far BEHIND the palm plane is
            //    almost certainly hidden behind the hand (z grows away from cam).
            const thumbBehind = (lm[4].z - palmZ) > OCCLUSION_Z_RATIO;
            const indexBehind = (lm[8].z - palmZ) > OCCLUSION_Z_RATIO;
            if (thumbBehind || indexBehind) {
                return { ok: false, reason: 'Dita nascoste' };
            }

            // 2) Teleport check: implausibly large per-frame jump of a fingertip
            //    (normalised by span) means the landmark popped in/out of view.
            if (prevThumb && prevIndex) {
                const thumbJump = dist(lm[4], prevThumb) / span;
                const indexJump = dist(lm[8], prevIndex) / span;
                if (thumbJump > MAX_TIP_JUMP_RATIO || indexJump > MAX_TIP_JUMP_RATIO) {
                    return { ok: false, reason: 'Tracking instabile' };
                }
            }

            return { ok: true, reason: '' };
        }

        // ------------------------------------------------------------------
        // Main loop
        // ------------------------------------------------------------------
        function loop() {
            if (!active) return;
            rafId = requestAnimationFrame(loop);

            if (!video || video.readyState < 2) return;

            let result;
            try {
                result = handLandmarker.detectForVideo(video, performance.now());
            } catch (e) {
                return;
            }

            const now = performance.now();
            const hands = result && result.landmarks;

            if (!hands || hands.length === 0) {
                if (now - lastHandSeen > HAND_LOST_MS) {
                    hidePointer();
                    setStatus('searching', 'Show your hand ✋');
                    resetInteractionState();
                }
                return;
            }

            lastHandSeen = now;
            setStatus('tracking', 'Tracking');

            const lm = hands[0];
            // Index knuckle drives the pointer. Video is mirrored, so flip X.
            const anchor = pointerAnchor(lm);
            const rawX = (1 - anchor.x) * window.innerWidth;
            const rawY = anchor.y * window.innerHeight;

            if (smoothX === null) {
                smoothX = rawX;
                smoothY = rawY;
            } else {
                smoothX += (rawX - smoothX) * SMOOTHING;
                smoothY += (rawY - smoothY) * SMOOTHING;
            }

            movePointer(smoothX, smoothY);

            // --- Reliability gate (pinch mode only) --------------------------
            // The pointer keeps following the palm regardless, but clicks are
            // frozen whenever the pinch fingers can't be trusted.
            if (GESTURE === 'pinch') {
                const rel = assessReliability(lm);
                if (rel.ok) {
                    if (!reliable) { reliable = true; reliableSince = now; }
                } else {
                    reliable = false;
                    // Force-release any in-progress gesture so occlusion can't
                    // "hold" a pinch and later complete an action.
                    if (isGesture) {
                        isGesture = false;
                        clickArmed = true;
                        cancelConfirm();
                        pointerEl.classList.remove('pinching');
                    }
                    setStatus('searching', rel.reason);
                    pointerEl.classList.add('unreliable');
                }
                if (reliable) pointerEl.classList.remove('unreliable');
                // Remember fingertips for next-frame velocity check.
                prevThumb = { x: lm[4].x, y: lm[4].y, z: lm[4].z };
                prevIndex = { x: lm[8].x, y: lm[8].y, z: lm[8].z };
            }

            // Actions only allowed when reliable AND settled for a short debounce.
            const actionsAllowed = GESTURE !== 'pinch'
                || (reliable && now - reliableSince >= RELIABLE_SETTLE_MS);

            // Update the gesture state machine.
            if (GESTURE === 'pinch') {
                const engaged = actionsAllowed && pinchRatio(lm) < PINCH_CLOSE;
                const released = pinchRatio(lm) > PINCH_OPEN;
                updateGestureState(engaged, released, now);
            } else {
                const curled = countCurledFingers(lm);
                updateGestureState(curled >= FIST_CLOSE, curled <= FIST_OPEN, now);
            }

            updateMagnet(smoothX, smoothY);
            updateTarget(smoothX, smoothY, now);

            // Freeze interactions while unreliable.
            if (actionsAllowed) {
                handleInteraction(now);
            } else {
                cancelConfirm();
            }
        }

        // ------------------------------------------------------------------
        // Pointer rendering
        // ------------------------------------------------------------------
        function movePointer(x, y) {
            pointerEl.classList.add('visible');
            pointerEl.style.transform = `translate(${x}px, ${y}px)`;
            ringEl.style.transform = `translate(${x}px, ${y}px)`;
            spawnTrail(x, y);
        }

        /**
         * Emits a fading ki particle behind the pointer, throttled by distance
         * so it forms a smooth comet trail regardless of frame rate.
         */
        function spawnTrail(x, y) {
            if (lastTrailX === null) {
                lastTrailX = x;
                lastTrailY = y;
                return;
            }
            const dx = x - lastTrailX;
            const dy = y - lastTrailY;
            if (dx * dx + dy * dy < TRAIL_MIN_STEP * TRAIL_MIN_STEP) return;
            lastTrailX = x;
            lastTrailY = y;

            const dot = trailPool[trailIdx];
            trailIdx = (trailIdx + 1) % TRAIL_POOL_SIZE;

            // Gold tint while over a target / making a fist, blue otherwise.
            const hot = pointerEl.classList.contains('over-target')
                || pointerEl.classList.contains('pinching');
            dot.classList.toggle('hot', hot);

            dot.style.left = x + 'px';
            dot.style.top = y + 'px';
            // Restart the fade animation.
            dot.classList.remove('animate');
            // Force reflow so the animation re-triggers.
            void dot.offsetWidth;
            dot.classList.add('animate');
        }

        /**
         * Spark burst at click position for a satisfying "ki hit" feel.
         */
        function spawnBurst(x, y) {
            if (!trailLayer) return;
            const n = 10;
            for (let i = 0; i < n; i++) {
                const spark = document.createElement('div');
                spark.className = 'hand-burst-spark';
                const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
                const dstance = 26 + Math.random() * 22;
                spark.style.left = x + 'px';
                spark.style.top = y + 'px';
                spark.style.setProperty('--bx', Math.cos(angle) * dstance + 'px');
                spark.style.setProperty('--by', Math.sin(angle) * dstance + 'px');
                trailLayer.appendChild(spark);
                spark.addEventListener('animationend', () => spark.remove());
            }
        }

        function hidePointer() {
            if (pointerEl) pointerEl.classList.remove('visible');
            if (ringEl) ringEl.classList.remove('visible');
            if (trailPool.length) trailPool.forEach((d) => d.classList.remove('animate'));
            clearMagnet();
            lastTrailX = lastTrailY = null;
            smoothX = smoothY = null;
        }

        // ------------------------------------------------------------------
        // Fist state machine (with hysteresis)
        // ------------------------------------------------------------------
        // Generic gesture state machine with hysteresis, shared by fist and
        // pinch. `engageCond`/`releaseCond` are the already-evaluated booleans
        // for this frame (with their own thresholds applied by the caller).
        function updateGestureState(engageCond, releaseCond, now) {
            gestureJustClosed = false;
            if (!isGesture && engageCond) {
                isGesture = true;
                gestureStartedAt = now;
                gestureJustClosed = true; // rising edge for this frame only
                pointerEl.classList.add('pinching');
            } else if (isGesture && releaseCond) {
                isGesture = false;
                pointerEl.classList.remove('pinching');
                // Releasing re-arms clicking and cancels any confirm.
                clickArmed = true;
                cancelConfirm();
            }
        }

        // ------------------------------------------------------------------
        // Magnetic dock effect on the vote cards
        // ------------------------------------------------------------------
        // Refreshes the cached CLEAN geometry of the cards (their centre X and
        // Y measured with transforms removed) so the magnet never feeds back on
        // its own output. Called when the pointer is far from the row.
        function refreshCardCache() {
            const container = document.getElementById('cards-container');
            if (!container) { cardCache = null; return; }
            const cards = Array.from(container.querySelectorAll('.dbz-card-btn'));
            if (!cards.length) { cardCache = null; return; }
            cardCache = cards.map((el) => {
                const r = el.getBoundingClientRect();
                return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
            });
        }

        function clearMagnet() {
            if (!cardsMagnetized) return;
            if (cardCache) {
                cardCache.forEach(({ el }) => {
                    el.style.transform = '';
                    el.style.zIndex = '';
                });
            }
            cardsMagnetized = false;
        }

        function updateMagnet(px, py) {
            const container = document.getElementById('cards-container');
            // Cards hidden (results shown) -> no magnet.
            if (!container || container.classList.contains('hidden')) {
                clearMagnet();
                cardCache = null;
                return;
            }

            // Are we near the card row at all? Use a cheap bounding check.
            const rowRect = container.getBoundingClientRect();
            const nearRow = py > rowRect.top - MAGNET_RADIUS
                && py < rowRect.bottom + MAGNET_RADIUS;

            // Refresh clean geometry only while NOT magnetized (avoids feedback).
            if (!cardsMagnetized || !cardCache
                || cardCache.length !== container.querySelectorAll('.dbz-card-btn').length) {
                if (!cardsMagnetized) refreshCardCache();
            }
            if (!cardCache || !cardCache.length) return;

            if (!nearRow) {
                clearMagnet();
                refreshCardCache();
                return;
            }

            cardsMagnetized = true;

            // First pass: compute each card's influence from the pointer.
            const infl = cardCache.map(({ cx, cy }) => {
                const dx = (px - cx) / MAGNET_RADIUS;
                const dy = (py - cy) / MAGNET_RADIUS;
                const d2 = dx * dx + dy * dy;
                return Math.exp(-d2 * MAGNET_FALLOFF); // 1 at centre -> ~0 far
            });

            // Second pass: apply scale + push neighbours away from the hot card.
            cardCache.forEach(({ el, cx }, i) => {
                const w = infl[i];
                const scale = 1 + MAGNET_MAX_SCALE * w;

                // Push: sum of sideways shove from every card more influential
                // than this one. Cards left of the hot spot move left, right ones
                // move right.
                let push = 0;
                for (let j = 0; j < cardCache.length; j++) {
                    if (j === i) continue;
                    if (infl[j] <= w) continue;
                    const dir = cx < cardCache[j].cx ? -1 : 1;
                    push += dir * infl[j] * MAGNET_PUSH;
                }

                const lift = -10 * w; // slight upward lift for the hot card
                el.style.transform =
                    `translate(${push.toFixed(1)}px, ${lift.toFixed(1)}px) scale(${scale.toFixed(3)})`;
                // Bigger card sits in front so it's never clipped by neighbours.
                el.style.zIndex = String(50 + Math.round(w * 50));
            });
        }

        // ------------------------------------------------------------------
        // Target detection (element under pointer) + dwell tracking
        // ------------------------------------------------------------------
        function updateTarget(x, y, now) {
            // Pointer has pointer-events:none, so elementFromPoint sees through it.
            const el = document.elementFromPoint(x, y);
            const target = el ? el.closest(TARGET_SELECTOR) : null;

            if (target !== currentTarget) {
                // Shrink the previously-hovered target back to normal.
                if (currentTarget) currentTarget.classList.remove('hand-hover-zoom');
                currentTarget = target;
                targetEnteredAt = now;
                // Enlarge the new target so it's easier to click. Vote cards are
                // handled by the magnet effect instead, so skip them here to
                // avoid two transforms fighting over the same element.
                if (target && !target.classList.contains('dbz-card-btn')) {
                    target.classList.add('hand-hover-zoom');
                }
                // Moving to a different target cancels an in-progress confirm.
                if (confirmTarget && confirmTarget !== target) cancelConfirm();
            }

            pointerEl.classList.toggle('over-target', !!target);
        }

        // ------------------------------------------------------------------
        // Interaction: decide when to click / confirm
        // ------------------------------------------------------------------
        function handleInteraction(now) {
            if (!currentTarget) {
                cancelConfirm();
                return;
            }

            const isDestructive = currentTarget.matches(DESTRUCTIVE_SELECTOR);

            if (isDestructive) {
                handleDestructive(now);
                return;
            }

            // Regular click: fires only on the frame the fist *closes* (rising
            // edge) while resting on a target, armed, and past cooldown.
            // Requiring the edge means arriving with a hand already closed
            // never triggers a click — you must perform the fist gesture here.
            if (
                gestureJustClosed &&
                clickArmed &&
                now - targetEnteredAt >= DWELL_MS &&
                now - lastClickAt >= CLICK_COOLDOWN_MS
            ) {
                fireClick(currentTarget);
                lastClickAt = now;
                clickArmed = false; // require an open hand before next click
            }
        }

        function handleDestructive(now) {
            if (isGesture) {
                if (confirmTarget !== currentTarget) {
                    confirmTarget = currentTarget;
                    confirmStartAt = now;
                    ringEl.classList.add('visible');
                }
                const progress = Math.min(100, ((now - confirmStartAt) / CONFIRM_HOLD_MS) * 100);
                ringEl.style.setProperty('--progress', progress.toFixed(0));

                if (progress >= 100 && clickArmed && now - lastClickAt >= CLICK_COOLDOWN_MS) {
                    fireClick(confirmTarget);
                    lastClickAt = now;
                    clickArmed = false;
                    cancelConfirm();
                }
            } else {
                cancelConfirm();
            }
        }

        function cancelConfirm() {
            confirmTarget = null;
            confirmStartAt = 0;
            if (ringEl) {
                ringEl.classList.remove('visible');
                ringEl.style.setProperty('--progress', '0');
            }
        }

        function resetInteractionState() {
            isGesture = false;
            clickArmed = true;
            reliable = true;
            prevThumb = prevIndex = null;
            if (currentTarget) currentTarget.classList.remove('hand-hover-zoom');
            currentTarget = null;
            cancelConfirm();
            if (pointerEl) pointerEl.classList.remove('pinching', 'over-target', 'unreliable');
        }

        function fireClick(el) {
            // Visual ping on the pointer + ki spark burst at the pointer position.
            pointerEl.animate(
                [{ transform: pointerEl.style.transform + ' scale(1.4)' },
                 { transform: pointerEl.style.transform + ' scale(1)' }],
                { duration: 200, easing: 'ease-out' }
            );
            if (smoothX !== null) spawnBurst(smoothX, smoothY);

            // Confirmation flash ON the target itself, so it's unmistakable
            // which element was selected. Uses glow/brightness (not transform)
            // to avoid fighting the magnet's inline transform on cards.
            el.classList.remove('hand-clicked');
            void el.offsetWidth; // restart the animation
            el.classList.add('hand-clicked');
            el.addEventListener('animationend', function onEnd() {
                el.classList.remove('hand-clicked');
                el.removeEventListener('animationend', onEnd);
            });

            el.click();
        }

        // ------------------------------------------------------------------
        // Public lifecycle
        // ------------------------------------------------------------------
        async function start() {
            if (active || starting) return;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showNotification('Webcam not supported in this browser', 'error');
                return;
            }
            starting = true;
            ensureDom();
            camPanel.classList.remove('hidden');
            // Now that the panel is visible (real dimensions), snap it back into
            // view in case a saved position was off-screen.
            if (repositionPanel) repositionPanel();
            setStatus('searching', 'Loading model…');

            try {
                await loadLandmarker();
                setStatus('searching', 'Requesting camera…');
                await startCamera();
                active = true;
                starting = false;
                lastHandSeen = performance.now();
                setStatus('searching', 'Show your hand ✋');
                document.body.classList.add('hand-control-active');
                loop();
                if (deps.onStart) deps.onStart();
                showToast({
                    title: 'Ki Control attivo',
                    body: GESTURE === 'pinch'
                        ? 'Palmo = puntatore · pollice+indice = click 🤏'
                        : 'Mano aperta = puntatore · pugno = click 👊',
                    variant: 'info',
                    icon: 'fas fa-hand-sparkles'
                });
            } catch (err) {
                starting = false;
                console.error('Hand control failed to start:', err);
                setStatus('error', 'Camera/model error');
                let msg = 'Could not start hand control.';
                if (err && err.name === 'NotAllowedError') {
                    msg = 'Camera permission denied.';
                } else if (err && err.name === 'NotFoundError') {
                    msg = 'No camera found.';
                }
                showNotification(msg, 'error');
                stop();
            }
        }

        function stop() {
            active = false;
            starting = false;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            stopCamera();
            hidePointer();
            resetInteractionState();
            document.body.classList.remove('hand-control-active');
            if (camPanel) camPanel.classList.add('hidden');
            if (deps.onStop) deps.onStop();
        }

        function toggle() {
            if (active || starting) stop();
            else start();
        }

        return {
            start,
            stop,
            toggle,
            isActive: () => active
        };
    }

    window.SPP = window.SPP || {};
    window.SPP.handControl = { create };
})();

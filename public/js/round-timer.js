// round-timer.js - Round stopwatch that counts up from 0:00
// and resets whenever the round is reset. Purely visual.
// Exposes window.SPP.roundTimer
(function () {
    'use strict';

    // Seconds thresholds for visual stages
    const WARM_THRESHOLD = 60;   // 1 minute -> orange
    const HOT_THRESHOLD = 300;   // 5 minutes -> red

    let containerEl = null;
    let valueEl = null;
    let startedAt = null;
    let tickInterval = null;
    let isInitialized = false;

    function format(totalSeconds) {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function tick() {
        if (!startedAt || !valueEl) return;

        const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        valueEl.textContent = format(elapsed);

        containerEl.classList.toggle('timer-warm', elapsed >= WARM_THRESHOLD && elapsed < HOT_THRESHOLD);
        containerEl.classList.toggle('timer-hot', elapsed >= HOT_THRESHOLD);
    }

    /**
     * Starts the timer. If `startedAtMs` is provided, uses it as the start
     * timestamp (so late-joining clients show the already-elapsed time).
     * If omitted, starts from now.
     */
    function start(startedAtMs) {
        if (!isInitialized) init();
        if (!containerEl) return;

        startedAt = typeof startedAtMs === 'number' ? startedAtMs : Date.now();
        containerEl.classList.remove('timer-warm', 'timer-hot', 'hidden');
        // Use same breakpoint as the Tailwind `hidden sm:flex` utility
        if (window.innerWidth >= 640) {
            containerEl.style.display = '';
        }

        // Show current value immediately (no 1s wait)
        tick();

        // Restart flash animation by toggling the class
        containerEl.classList.remove('timer-reset-pulse');
        // Force reflow so the animation can replay
        void containerEl.offsetWidth;
        containerEl.classList.add('timer-reset-pulse');

        if (tickInterval) clearInterval(tickInterval);
        tickInterval = setInterval(tick, 1000);
    }

    function stop() {
        if (tickInterval) {
            clearInterval(tickInterval);
            tickInterval = null;
        }
        startedAt = null;
    }

    function init() {
        containerEl = document.getElementById('round-timer');
        valueEl = document.getElementById('round-timer-value');
        if (containerEl && valueEl) {
            isInitialized = true;
        }
    }

    window.SPP = window.SPP || {};
    window.SPP.roundTimer = { start, stop, init };
})();

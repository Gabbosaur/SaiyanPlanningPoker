// stickers.js - Name-gated sticker reactions.
//
// Choosing a character display name unlocks that character's stickers. Sending
// one broadcasts it to the whole session, where it pops in near the sender's
// avatar (or the target's, if aimed at someone) and fades out.
//
// The server owns the catalogue and the unlock rules; this module only renders
// what it's told and offers the picker UI.
//
// Exposes window.SPP.stickers.create(deps) -> { setAvailable, show, isUnlocked }
(function () {
    'use strict';

    const { sanitizeInput } = window.SPP.utils;

    const STICKER_LIFETIME_MS = 2600;

    // Animation names with a matching `.anim-<name>` rule in stickers.css.
    // Whitelisted so a value from the wire can't inject an arbitrary class.
    const ANIMATIONS = [
        'pop', 'laugh', 'surprise', 'approve', 'bow',
        'wave', 'slam', 'rise', 'swagger', 'fade', 'sparkle'
    ];

    function create(deps = {}) {
        // { setKey, stickers: [{id, glyph, label}] }
        let available = { setKey: null, stickers: [] };
        let panelEl = null;
        let listEl = null;

        /**
         * Receives the sticker list unlocked for this user (sent on join).
         */
        function setAvailable(data) {
            available = {
                setKey: (data && data.setKey) || null,
                stickers: (data && Array.isArray(data.stickers)) ? data.stickers : []
            };
            renderPicker();

            // Celebrate an unlocked set so the easter egg is discoverable.
            if (available.setKey && window.SPP.utils.showToast) {
                window.SPP.utils.showToast({
                    title: 'Sticker sbloccati!',
                    body: `Set "${available.setKey}" disponibile nel pannello sticker`,
                    variant: 'success',
                    icon: 'fas fa-star'
                });
            }
        }

        function isUnlocked() {
            return !!available.setKey;
        }

        // ------------------------------------------------------------------
        // Picker UI
        // ------------------------------------------------------------------
        function ensurePanel() {
            if (panelEl && panelEl.isConnected) return panelEl;

            panelEl = document.createElement('div');
            panelEl.id = 'sticker-panel';
            panelEl.className = 'spp-sticker-panel';

            const toggle = document.createElement('div');
            toggle.className = 'spp-sticker-toggle';
            toggle.setAttribute('title', 'Sticker');
            toggle.innerHTML = '<i class="fas fa-star"></i>';
            panelEl.appendChild(toggle);

            listEl = document.createElement('div');
            listEl.className = 'spp-sticker-list';
            panelEl.appendChild(listEl);

            document.body.appendChild(panelEl);

            // Tap-to-toggle for touch devices (desktop uses :hover in CSS).
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                panelEl.classList.toggle('expanded');
            });
            document.addEventListener('click', (e) => {
                if (panelEl && !panelEl.contains(e.target)) {
                    panelEl.classList.remove('expanded');
                }
            });

            return panelEl;
        }

        function renderPicker() {
            if (!available.stickers.length) {
                if (panelEl) panelEl.remove();
                panelEl = null;
                return;
            }

            ensurePanel();
            listEl.innerHTML = '';

            available.stickers.forEach((s) => {
                const btn = document.createElement('button');
                btn.className = 'spp-sticker-btn';
                btn.type = 'button';
                btn.title = s.label;

                btn.appendChild(buildVisual(s, 'spp-sticker-glyph', 'spp-sticker-thumb'));

                const label = document.createElement('span');
                label.className = 'spp-sticker-label';
                label.textContent = s.label;
                btn.appendChild(label);

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Shift-click aims it at a random teammate, matching the
                    // existing emoji panel behaviour.
                    if (deps.onSend) deps.onSend(s.id, e.shiftKey);
                    panelEl.classList.remove('expanded');
                });

                listEl.appendChild(btn);
            });
        }

        /**
         * Picks where a sticker should pop for a given user.
         *
         * While the results view is open, everyone is looking at the "Individual
         * Votes" row rather than the avatars around the table, so the sticker
         * pops on that user's result card instead. Falls back to their avatar.
         */
        function findAnchor(userId) {
            const resultsArea = document.getElementById('results-area');
            if (resultsArea && !resultsArea.classList.contains('hidden')) {
                const card = resultsArea.querySelector(
                    `[data-breakdown-user-id="${userId}"]`);
                if (card && isVisible(card)) return card;
            }
            const avatar = document.querySelector(`[data-user-id="${userId}"]`);
            return (avatar && isVisible(avatar)) ? avatar : null;
        }

        /**
         * True if the element occupies space AND sits within the viewport. The
         * results row scrolls horizontally, so a card can be rendered yet
         * scrolled out of sight - anchoring there would drop the sticker
         * off-screen.
         */
        function isVisible(el) {
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return false;
            const cx = r.left + r.width / 2;
            return cx > 0 && cx < window.innerWidth
                && r.bottom > 0 && r.top < window.innerHeight;
        }

        /**
         * Builds the visual for a sticker: an <img> for image packs, or a text
         * glyph for emoji-based ones. Image stickers fall back to a glyph if the
         * file fails to load, so a missing asset never renders as a broken icon.
         */
        function buildVisual(sticker, glyphClass, imgClass) {
            if (sticker.src) {
                const img = document.createElement('img');
                img.className = imgClass;
                img.src = sticker.src;
                img.alt = sticker.label || '';
                img.loading = 'lazy';
                img.draggable = false;
                img.addEventListener('error', () => {
                    const fallback = document.createElement('span');
                    fallback.className = glyphClass;
                    fallback.textContent = sticker.glyph || '⭐';
                    img.replaceWith(fallback);
                });
                return img;
            }
            const span = document.createElement('span');
            span.className = glyphClass;
            span.textContent = sticker.glyph || '⭐';
            return span;
        }

        // ------------------------------------------------------------------
        // Rendering an incoming sticker
        // ------------------------------------------------------------------
        /**
         * Pops a sticker near the relevant avatar (target if aimed, otherwise
         * the sender) and fades it out. Falls back to a random spot when the
         * avatar can't be found.
         */
        function show(data) {
            if (!data || !data.sticker) return;
            const { sticker, from, to } = data;

            const anchorId = to || (from && from.id);
            const anchorEl = anchorId ? findAnchor(anchorId) : null;

            const el = document.createElement('div');
            // The server resolves an animation per sticker so the motion matches
            // the emotion (laugh wobbles, surprise snaps in, and so on).
            const anim = ANIMATIONS.includes(data.sticker.anim)
                ? data.sticker.anim
                : 'pop';
            el.className = `spp-sticker-pop anim-${anim}`;

            el.appendChild(buildVisual(sticker, 'spp-sticker-pop-glyph', 'spp-sticker-pop-img'));

            const label = document.createElement('div');
            label.className = 'spp-sticker-pop-label';
            label.textContent = sticker.label;
            el.appendChild(label);

            // Credit line: who sent it (and at whom, if aimed).
            if (from && from.name) {
                const credit = document.createElement('div');
                credit.className = 'spp-sticker-pop-credit';
                credit.textContent = to && to !== from.id
                    ? `${sanitizeInput(from.name)} →`
                    : sanitizeInput(from.name);
                el.appendChild(credit);
            }

            if (anchorEl) {
                const r = anchorEl.getBoundingClientRect();
                el.style.left = `${r.left + r.width / 2}px`;
                el.style.top = `${r.top}px`;
                // Result cards are much smaller than the table avatars, so use
                // a compact size there to keep the row readable.
                if (anchorEl.hasAttribute('data-breakdown-user-id')) {
                    el.classList.add('compact');
                }
            } else {
                el.style.left = `${20 + Math.random() * 60}vw`;
                el.style.top = `${30 + Math.random() * 30}vh`;
            }

            document.body.appendChild(el);
            setTimeout(() => el.remove(), STICKER_LIFETIME_MS);
        }

        return { setAvailable, show, isUnlocked };
    }

    window.SPP = window.SPP || {};
    window.SPP.stickers = { create };
})();

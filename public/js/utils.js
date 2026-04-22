// utils.js - Shared utility functions (security, audio fade, DOM helpers)
// Exposes window.SPP.utils
(function () {
    'use strict';

    const HTML_ENTITIES = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
    };

    /**
     * Escapes HTML special characters to prevent XSS when rendering user input.
     */
    function sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.replace(/[<>"'&]/g, (match) => HTML_ENTITIES[match]).trim();
    }

    /**
     * Generates a CSRF token stored per-session in sessionStorage.
     */
    function generateCSRFToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    function getCSRFToken() {
        let token = sessionStorage.getItem('csrf-token');
        if (!token) {
            token = generateCSRFToken();
            sessionStorage.setItem('csrf-token', token);
        }
        return token;
    }

    /**
     * Safely sets the text content of an element (avoids innerHTML).
     */
    function setSafeContent(element, content) {
        if (!element) return;
        element.textContent = content || '';
    }

    /**
     * Creates an element with sanitized text content (avoids innerHTML XSS).
     */
    function createSafeElement(tagName, textContent, className) {
        const el = document.createElement(tagName);
        if (textContent !== undefined) el.textContent = textContent;
        if (className) el.className = className;
        return el;
    }

    /**
     * Persistent per-browser user ID used to dedupe rejoin events and prevent
     * multi-tab vote abuse. Stored in localStorage so all tabs in the same
     * browser share the same identity.
     */
    function getPersistentUserId() {
        try {
            let pid = localStorage.getItem('spp-persistent-user-id');
            if (!pid) {
                pid = 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 11);
                localStorage.setItem('spp-persistent-user-id', pid);
            }
            return pid;
        } catch (e) {
            return 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 11);
        }
    }

    /**
     * Generates a short random session ID (e.g. "A3B9F2").
     */
    function generateSessionId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    /**
     * Smoothly fades out an <audio> element over the last second of playback.
     */
    function fadeOutAudio(audio, fadeDuration = 1000) {
        if (!audio || audio.paused) return;

        const fadeStartTime = audio.duration - 1;
        const currentTime = audio.currentTime;

        if (currentTime >= fadeStartTime) {
            startFadeOut(audio, fadeDuration);
        } else {
            const timeUntilFade = (fadeStartTime - currentTime) * 1000;
            setTimeout(() => startFadeOut(audio, fadeDuration), timeUntilFade);
        }
    }

    function startFadeOut(audio, duration) {
        const steps = 30;
        const stepDuration = duration / steps;
        const initialVolume = audio.volume;
        let currentStep = 0;

        const fadeInterval = setInterval(() => {
            currentStep++;
            const newVolume = initialVolume * (1 - currentStep / steps);
            audio.volume = Math.max(0, newVolume);

            if (currentStep >= steps) {
                clearInterval(fadeInterval);
            }
        }, stepDuration);
    }

    /**
     * Shows a toast-style notification in the top-right corner.
     * @param {string} message
     * @param {'info'|'success'|'error'} [type]
     */
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const bgClass = type === 'success' ? 'bg-green-500'
            : type === 'error' ? 'bg-red-500'
            : 'bg-blue-500';
        notification.className = `fixed top-1 right-4 px-4 py-2 rounded-lg shadow-lg z-50 ${bgClass} text-white`;
        notification.textContent = sanitizeInput(message);
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 1500);
    }

    /**
     * Shows a compact DBZ-themed toast in the bottom-right corner (mobile: bottom-center).
     * Slides in, stays for ~2.3s, slides out. Non-blocking, pointer-events: none.
     *
     * @param {Object} opts
     * @param {string} [opts.title] - bold title line (e.g. "Round reset")
     * @param {string} [opts.body] - optional secondary line
     * @param {'default'|'info'|'success'|'warn'} [opts.variant]
     * @param {string} [opts.icon] - optional font-awesome icon class (e.g. 'fas fa-redo')
     */
    function showToast({ title = '', body = '', variant = 'default', icon = 'fas fa-bolt' } = {}) {
        const toast = document.createElement('div');
        toast.className = `spp-toast ${variant}`;

        const iconEl = document.createElement('div');
        iconEl.className = 'spp-toast-icon';
        const iconI = document.createElement('i');
        iconI.className = icon;
        iconEl.appendChild(iconI);

        const textEl = document.createElement('div');
        textEl.className = 'spp-toast-text';
        if (title) {
            const t = document.createElement('div');
            t.className = 'spp-toast-title';
            t.textContent = title;
            textEl.appendChild(t);
        }
        if (body) {
            const b = document.createElement('div');
            b.className = 'spp-toast-body';
            b.textContent = body;
            textEl.appendChild(b);
        }

        toast.appendChild(iconEl);
        toast.appendChild(textEl);
        document.body.appendChild(toast);

        // Remove after the outro animation finishes (2.3s delay + 0.4s duration)
        setTimeout(() => toast.remove(), 2800);
    }

    window.SPP = window.SPP || {};
    window.SPP.utils = {
        sanitizeInput,
        generateCSRFToken,
        getCSRFToken,
        setSafeContent,
        createSafeElement,
        getPersistentUserId,
        generateSessionId,
        fadeOutAudio,
        showNotification,
        showToast
    };
})();

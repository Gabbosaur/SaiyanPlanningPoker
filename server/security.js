'use strict';

const HTML_ENTITIES = {
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '&': '&amp;'
};

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} input
 * @returns {string}
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>"'&]/g, (match) => HTML_ENTITIES[match]).trim();
}

/**
 * Validates that the provided CSRF token looks legitimate.
 * Real CSRF rotation is not implemented; we only check a minimum length.
 */
function isValidCsrfToken(token) {
    return typeof token === 'string' && token.length >= 32;
}

/**
 * In-memory rate limiter for uploads (5 uploads / minute / ip).
 */
const uploadAttempts = new Map();
const UPLOAD_WINDOW_MS = 60_000;
const UPLOAD_MAX_PER_WINDOW = 5;

function checkUploadRate(ip) {
    const now = Date.now();
    const attempts = uploadAttempts.get(ip) || [];
    const recentAttempts = attempts.filter((time) => now - time < UPLOAD_WINDOW_MS);

    if (recentAttempts.length >= UPLOAD_MAX_PER_WINDOW) {
        return false;
    }

    recentAttempts.push(now);
    uploadAttempts.set(ip, recentAttempts);
    return true;
}

/**
 * Security headers middleware (CSP, frame options, etc).
 */
function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        // 'wasm-unsafe-eval' + blob: required by MediaPipe tasks-vision (WASM + workers)
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.socket.io https://cdn.jsdelivr.net; " +
        "worker-src 'self' blob:; " +
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
        "img-src 'self' data:; " +
        "font-src 'self' https://cdnjs.cloudflare.com; " +
        // cdn.jsdelivr.net (wasm binaries) + storage.googleapis.com (hand model)
        "connect-src 'self' ws: wss: https://cdn.socket.io https://cdn.jsdelivr.net https://storage.googleapis.com; " +
        // blob: for the mirrored webcam stream
        "media-src 'self' blob:;"
    );
    next();
}

module.exports = {
    sanitizeInput,
    isValidCsrfToken,
    checkUploadRate,
    securityHeaders
};

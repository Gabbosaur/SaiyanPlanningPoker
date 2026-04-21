const {
    sanitizeInput,
    isValidCsrfToken,
    checkUploadRate,
    securityHeaders
} = require('../server/security');

describe('security.js - sanitizeInput', () => {
    test('escapes HTML special characters', () => {
        expect(sanitizeInput('<script>alert(1)</script>'))
            .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    test('escapes quotes and ampersands', () => {
        expect(sanitizeInput(`"Tom & Jerry's"`))
            .toBe('&quot;Tom &amp; Jerry&#x27;s&quot;');
    });

    test('trims surrounding whitespace', () => {
        expect(sanitizeInput('   hello   ')).toBe('hello');
    });

    test('returns empty string for non-string input', () => {
        expect(sanitizeInput(null)).toBe('');
        expect(sanitizeInput(undefined)).toBe('');
        expect(sanitizeInput(123)).toBe('');
        expect(sanitizeInput({})).toBe('');
    });
});

describe('security.js - isValidCsrfToken', () => {
    test('accepts 32+ character string tokens', () => {
        expect(isValidCsrfToken('a'.repeat(32))).toBe(true);
        expect(isValidCsrfToken('a'.repeat(64))).toBe(true);
    });

    test('rejects short tokens', () => {
        expect(isValidCsrfToken('short')).toBe(false);
        expect(isValidCsrfToken('a'.repeat(31))).toBe(false);
    });

    test('rejects non-string input', () => {
        expect(isValidCsrfToken(null)).toBe(false);
        expect(isValidCsrfToken(undefined)).toBe(false);
        expect(isValidCsrfToken(12345)).toBe(false);
    });
});

describe('security.js - checkUploadRate', () => {
    test('allows uploads under the limit for an ip', () => {
        const ip = '10.0.0.1';
        for (let i = 0; i < 5; i++) {
            expect(checkUploadRate(ip)).toBe(true);
        }
    });

    test('blocks the 6th upload within a minute from the same ip', () => {
        const ip = '10.0.0.2';
        for (let i = 0; i < 5; i++) checkUploadRate(ip);
        expect(checkUploadRate(ip)).toBe(false);
    });

    test('tracks rate per ip independently', () => {
        const ipA = '10.0.0.3';
        const ipB = '10.0.0.4';
        for (let i = 0; i < 5; i++) checkUploadRate(ipA);
        expect(checkUploadRate(ipA)).toBe(false);
        expect(checkUploadRate(ipB)).toBe(true);
    });
});

describe('security.js - securityHeaders', () => {
    test('sets standard security headers and CSP', () => {
        const headers = {};
        const res = {
            setHeader: (name, value) => { headers[name] = value; }
        };
        const next = jest.fn();

        securityHeaders({}, res, next);

        expect(headers['X-Content-Type-Options']).toBe('nosniff');
        expect(headers['X-Frame-Options']).toBe('DENY');
        expect(headers['X-XSS-Protection']).toBe('1; mode=block');
        expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
        expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
        expect(headers['Content-Security-Policy']).toContain('https://cdn.socket.io');
        expect(next).toHaveBeenCalledTimes(1);
    });
});

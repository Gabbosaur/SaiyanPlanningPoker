/**
 * @jest-environment jsdom
 */

// Load utils.js into this jsdom context so it registers window.SPP.utils
require('../public/js/utils.js');

const {
    sanitizeInput,
    getCSRFToken,
    setSafeContent,
    createSafeElement,
    getPersistentUserId,
    generateSessionId,
    showNotification
} = window.SPP.utils;

describe('utils.js - sanitizeInput', () => {
    test('escapes HTML special characters', () => {
        expect(sanitizeInput('<b>hi</b>')).toBe('&lt;b&gt;hi&lt;/b&gt;');
    });

    test('trims whitespace', () => {
        expect(sanitizeInput('   spaced   ')).toBe('spaced');
    });

    test('returns empty string for non-string input', () => {
        expect(sanitizeInput(null)).toBe('');
        expect(sanitizeInput(42)).toBe('');
    });
});

describe('utils.js - getCSRFToken', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    test('generates a 64-character hex token on first call', () => {
        const token = getCSRFToken();
        expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    test('returns the same token on subsequent calls within a session', () => {
        const first = getCSRFToken();
        const second = getCSRFToken();
        expect(second).toBe(first);
    });
});

describe('utils.js - setSafeContent', () => {
    test('sets textContent without HTML parsing (XSS safe)', () => {
        const el = document.createElement('div');
        setSafeContent(el, '<img src=x onerror=1>');
        expect(el.textContent).toBe('<img src=x onerror=1>');
        expect(el.children.length).toBe(0);
    });

    test('ignores null element without throwing', () => {
        expect(() => setSafeContent(null, 'x')).not.toThrow();
    });
});

describe('utils.js - createSafeElement', () => {
    test('creates an element with given tag, text and class', () => {
        const el = createSafeElement('span', 'hello', 'my-cls');
        expect(el.tagName).toBe('SPAN');
        expect(el.textContent).toBe('hello');
        expect(el.className).toBe('my-cls');
    });
});

describe('utils.js - getPersistentUserId', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('generates and stores an id on first call', () => {
        const id = getPersistentUserId();
        expect(id).toMatch(/^u-[a-z0-9]+-[a-z0-9]+$/);
        expect(localStorage.getItem('spp-persistent-user-id')).toBe(id);
    });

    test('returns the same id on subsequent calls', () => {
        const first = getPersistentUserId();
        const second = getPersistentUserId();
        expect(second).toBe(first);
    });
});

describe('utils.js - generateSessionId', () => {
    test('returns a short uppercase alphanumeric id', () => {
        const id = generateSessionId();
        expect(id).toMatch(/^[A-Z0-9]{1,8}$/);
    });

    test('returns different ids on successive calls', () => {
        const ids = new Set();
        for (let i = 0; i < 20; i++) ids.add(generateSessionId());
        // extremely unlikely to get 20 collisions
        expect(ids.size).toBeGreaterThan(15);
    });
});

describe('utils.js - showNotification', () => {
    afterEach(() => {
        document.querySelectorAll('.z-50').forEach((el) => el.remove());
    });

    test('appends a notification element with the right classes', () => {
        showNotification('Success!', 'success');
        const el = document.querySelector('.bg-green-500');
        expect(el).not.toBeNull();
        expect(el.textContent).toBe('Success!');
    });

    test('uses red background for errors', () => {
        showNotification('Error!', 'error');
        expect(document.querySelector('.bg-red-500')).not.toBeNull();
    });

    test('uses blue background as default', () => {
        showNotification('Info');
        expect(document.querySelector('.bg-blue-500')).not.toBeNull();
    });
});

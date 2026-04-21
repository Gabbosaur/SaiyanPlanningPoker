/**
 * @jest-environment jsdom
 */

require('../public/js/utils.js');
require('../public/js/animations.js');

const {
    playResetAnimation,
    playUserJoinAnimation,
    playUserLeaveAnimation
} = window.SPP.animations;

// Silence jsdom audio playback errors
beforeEach(() => {
    // HTMLMediaElement.play is not implemented in jsdom; stub it
    window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
    window.HTMLMediaElement.prototype.load = jest.fn();
});

afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
});

describe('animations.js - playResetAnimation', () => {
    test('appends and later removes an overlay element', () => {
        jest.useFakeTimers();
        playResetAnimation({ soundEnabled: false });

        expect(document.querySelector('.reset-wave-overlay')).not.toBeNull();
        expect(document.querySelector('.reset-flash')).not.toBeNull();
        expect(document.querySelector('.reset-wave-ring')).not.toBeNull();

        jest.advanceTimersByTime(1000);
        expect(document.querySelector('.reset-wave-overlay')).toBeNull();
    });

    test('does not throw when called with no options', () => {
        expect(() => playResetAnimation()).not.toThrow();
    });
});

describe('animations.js - playUserJoinAnimation', () => {
    test('adds user-joining class and trail/impact elements', () => {
        jest.useFakeTimers();
        const participant = document.createElement('div');
        participant.dataset.userId = 'u1';
        document.body.appendChild(participant);

        playUserJoinAnimation(participant);

        expect(participant.classList.contains('user-joining')).toBe(true);
        expect(participant.querySelector('.user-join-trail')).not.toBeNull();
        expect(participant.querySelector('.user-join-impact')).not.toBeNull();

        jest.advanceTimersByTime(1100);
        expect(participant.classList.contains('user-joining')).toBe(false);
        expect(participant.querySelector('.user-join-trail')).toBeNull();
        expect(participant.querySelector('.user-join-impact')).toBeNull();
    });

    test('is a no-op when participant element is missing', () => {
        expect(() => playUserJoinAnimation(null)).not.toThrow();
    });
});

describe('animations.js - playUserLeaveAnimation', () => {
    test('invokes onComplete immediately and creates a ghost clone', () => {
        jest.useFakeTimers();
        const participant = document.createElement('div');
        participant.setAttribute('data-user-id', 'u1');
        participant.className = 'absolute transform';
        participant.innerHTML = '<div class="dbz-participant-card"></div>';
        document.body.appendChild(participant);

        const onComplete = jest.fn();
        playUserLeaveAnimation('u1', onComplete);

        expect(onComplete).toHaveBeenCalledTimes(1);

        const ghost = document.querySelector('.user-leaving');
        expect(ghost).not.toBeNull();
        expect(ghost.classList.contains('user-leave-stripes')).toBe(true);

        jest.advanceTimersByTime(1100);
        expect(document.querySelector('.user-leaving')).toBeNull();
    });

    test('still calls onComplete when the target element does not exist', () => {
        const onComplete = jest.fn();
        playUserLeaveAnimation('missing', onComplete);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });
});

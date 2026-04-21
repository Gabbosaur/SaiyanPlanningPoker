const {
    cardDecks,
    calculateMode,
    calculateAverage,
    checkConsensus,
    calculateResults
} = require('../server/game');

describe('game.js - card decks', () => {
    test('exposes fibonacci, modifiedFibonacci and tshirt decks', () => {
        expect(cardDecks.fibonacci).toContain(0);
        expect(cardDecks.fibonacci).toContain(89);
        expect(cardDecks.fibonacci).toContain('?');

        expect(cardDecks.modifiedFibonacci).toContain(0.5);
        expect(cardDecks.modifiedFibonacci).toContain(100);

        expect(cardDecks.tshirt).toEqual(expect.arrayContaining(['XS', 'S', 'M', 'L', 'XL', 'XXL', '?']));
    });
});

describe('game.js - calculateMode', () => {
    test('returns the most frequent numeric vote', () => {
        expect(calculateMode([1, 2, 2, 3])).toBe(2);
        expect(calculateMode([5, 5, 5, 8])).toBe(5);
    });

    test('ignores "?" votes when computing mode', () => {
        expect(calculateMode(['?', '?', 5, 5, 3])).toBe(5);
    });

    test('returns null when only question marks are present', () => {
        expect(calculateMode(['?', '?'])).toBe(null);
    });

    test('returns null for empty input', () => {
        expect(calculateMode([])).toBe(null);
    });
});

describe('game.js - calculateAverage', () => {
    test('returns average of numeric votes as string with 2 decimals', () => {
        expect(calculateAverage([1, 2, 3])).toBe('2.00');
        expect(calculateAverage([5, 10])).toBe('7.50');
    });

    test('skips question marks', () => {
        expect(calculateAverage(['?', 2, 4])).toBe('3.00');
    });

    test('returns null when no numeric votes are present', () => {
        expect(calculateAverage(['?', '?'])).toBe(null);
        expect(calculateAverage([])).toBe(null);
    });
});

describe('game.js - checkConsensus', () => {
    test('returns true when all non-"?" votes agree', () => {
        expect(checkConsensus([5, 5, 5])).toBe(true);
        expect(checkConsensus(['M', 'M'])).toBe(true);
    });

    test('returns false when votes differ', () => {
        expect(checkConsensus([5, 5, 8])).toBe(false);
    });

    test('ignores "?" votes', () => {
        expect(checkConsensus([5, 5, '?'])).toBe(true);
    });

    test('returns false when only "?" votes are present', () => {
        expect(checkConsensus(['?', '?'])).toBe(false);
    });
});

describe('game.js - calculateResults', () => {
    test('returns placeholders for empty votes', () => {
        expect(calculateResults([])).toEqual({ mode: '-', average: '-', consensus: false });
    });

    test('computes mode, average and consensus for a unanimous vote', () => {
        const result = calculateResults([5, 5, 5]);
        expect(result.mode).toBe('5');
        expect(result.average).toBe('5.0');
        expect(result.consensus).toBe(true);
    });

    test('computes results for a mixed vote (no consensus)', () => {
        const result = calculateResults([3, 5, 5, 8]);
        expect(result.mode).toBe('5');
        // average uses toFixed(1), so 5.25 rounds to "5.3"
        expect(result.average).toBe('5.3');
        expect(result.consensus).toBe(false);
    });

    test('handles T-shirt size votes (non-numeric)', () => {
        const result = calculateResults(['M', 'M', 'L']);
        expect(result.mode).toBe('M');
        expect(result.average).toBe('-');
        expect(result.consensus).toBe(false);
    });
});

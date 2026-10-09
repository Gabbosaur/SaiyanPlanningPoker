'use strict';

const fs = require('fs');
const path = require('path');

const stickers = require('../server/stickers');

describe('sticker catalogue', () => {
    test('is internally valid (no duplicate ids, bad paths or alias clashes)', () => {
        expect(stickers.validateCatalogue()).toEqual([]);
    });

    test('every referenced image file exists on disk', () => {
        const all = [
            ...stickers.DEFAULT_STICKERS,
            ...Object.values(stickers.STICKER_SETS).flatMap((s) => s.stickers)
        ];
        const missing = all
            .filter((s) => s.src)
            .filter((s) => !fs.existsSync(path.join(__dirname, '..', 'public', s.src)))
            .map((s) => `${s.id} -> ${s.src}`);

        expect(missing).toEqual([]);
    });

    test('image paths stay inside the stickers directory', () => {
        // These values are handed to clients and used as an <img> src.
        const all = Object.values(stickers.STICKER_SETS).flatMap((s) => s.stickers);
        all.filter((s) => s.src).forEach((s) => {
            expect(s.src).toMatch(/^\/images\/stickers\//);
            expect(s.src).not.toContain('..');
        });
    });
});

describe('name gating', () => {
    test('matches a plain name', () => {
        expect(stickers.resolveSetKey('Simona')).toBe('simona');
        expect(stickers.resolveSetKey('Daniele')).toBe('daniele');
    });

    test('is case and whitespace insensitive', () => {
        expect(stickers.resolveSetKey('  SIMONA  ')).toBe('simona');
        expect(stickers.resolveSetKey('gAbRiElE')).toBe('gabriele');
    });

    test('strips accents and punctuation', () => {
        expect(stickers.resolveSetKey('Végeta')).toBe('vegeta');
        expect(stickers.resolveSetKey('Vegeta!')).toBe('vegeta');
    });

    test('matches aliases', () => {
        expect(stickers.resolveSetKey('Kakarot')).toBe('goku');
        expect(stickers.resolveSetKey('Gabbosaur')).toBe('gabriele');
        expect(stickers.resolveSetKey('Broly')).toBe('gabriele');
        expect(stickers.resolveSetKey('Bills')).toBe('beerus');
    });

    test('matches a single-word alias inside a longer name', () => {
        expect(stickers.resolveSetKey('Goku Sama')).toBe('goku');
        expect(stickers.resolveSetKey('Gabriele Guo')).toBe('gabriele');
    });

    test('matches stretched-out spellings via patterns', () => {
        // Luigi actually types these, so one regex covers them all.
        ['luis', 'luiss', 'luisss', 'luissss', 'luigii', 'gigiii']
            .forEach((n) => expect(stickers.resolveSetKey(n)).toBe('luigi'));
    });

    test('returns null for unknown names', () => {
        ['Pippo', 'Luca', '', '   ', 'lu', 'luissa', 'Gokuu']
            .forEach((n) => expect(stickers.resolveSetKey(n)).toBeNull());
    });

    test('handles non-string input', () => {
        [null, undefined, 42, {}].forEach((v) => {
            expect(stickers.resolveSetKey(v)).toBeNull();
        });
    });

    test('literal aliases win over another set\'s loose pattern', () => {
        // 'lui' is a literal Luigi alias; make sure no pattern hijacks it.
        expect(stickers.resolveSetKey('lui')).toBe('luigi');
    });
});

describe('permissions', () => {
    test('everyone gets the default stickers', () => {
        const { stickers: list, setKey } = stickers.getStickersFor('Nobody');
        expect(setKey).toBeNull();
        expect(list).toHaveLength(stickers.DEFAULT_STICKERS.length);
        expect(stickers.canSend('Nobody', 'base-lgtm')).toBe(true);
    });

    test('an unlocked name gets defaults plus its own set', () => {
        const { setKey, stickers: list } = stickers.getStickersFor('Simona');
        expect(setKey).toBe('simona');
        const expected = stickers.DEFAULT_STICKERS.length
            + stickers.STICKER_SETS.simona.stickers.length;
        expect(list).toHaveLength(expected);
    });

    test('a user can send their own set', () => {
        expect(stickers.canSend('Simona', 'simona-thumbsup')).toBe(true);
    });

    test('a user cannot send another set\'s stickers', () => {
        expect(stickers.canSend('Simona', 'goku-kamehameha')).toBe(false);
        expect(stickers.canSend('Nobody', 'simona-thumbsup')).toBe(false);
    });

    test('unknown or malformed sticker ids are rejected', () => {
        [null, undefined, '', 'does-not-exist', 42, {}].forEach((id) => {
            expect(stickers.canSend('Simona', id)).toBe(false);
        });
    });
});

describe('animations', () => {
    const CSS = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'css', 'stickers.css'), 'utf8');
    const CLIENT = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'stickers.js'), 'utf8');

    const allStickers = [
        ...stickers.DEFAULT_STICKERS,
        ...Object.values(stickers.STICKER_SETS).flatMap((s) => s.stickers)
    ];

    test('every sticker resolves to an animation', () => {
        allStickers.forEach((s) => {
            expect(typeof stickers.animFor(s)).toBe('string');
            expect(stickers.animFor(s)).not.toBe('');
        });
    });

    test('poses map to the matching emotion', () => {
        expect(stickers.animFor({ id: 'simona-laugh' })).toBe('laugh');
        expect(stickers.animFor({ id: 'simona-surprised' })).toBe('surprise');
        expect(stickers.animFor({ id: 'simona-thumbsup' })).toBe('approve');
        expect(stickers.animFor({ id: 'simona-thanks' })).toBe('bow');
        expect(stickers.animFor({ id: 'simona-hello' })).toBe('wave');
        expect(stickers.animFor({ id: 'simona-victory' })).toBe('rise');
        expect(stickers.animFor({ id: 'gabriele-angry' })).toBe('slam');
        expect(stickers.animFor({ id: 'luigi-coolpose' })).toBe('swagger');
    });

    test('an explicit anim overrides the id-derived one', () => {
        expect(stickers.animFor({ id: 'simona-laugh', anim: 'rise' })).toBe('rise');
    });

    test('unrecognised ids fall back to the neutral pop', () => {
        expect(stickers.animFor({ id: 'something-odd' })).toBe('pop');
        expect(stickers.animFor({})).toBe('pop');
    });

    test('every animation used has a CSS rule', () => {
        const used = new Set(allStickers.map((s) => stickers.animFor(s)));
        used.forEach((anim) => {
            expect(CSS).toContain(`.anim-${anim}`);
        });
    });

    test('every animation used is whitelisted client-side', () => {
        // The client only applies names from its whitelist, so a value the
        // server can emit but the client rejects would silently lose the effect.
        const used = new Set(allStickers.map((s) => stickers.animFor(s)));
        used.forEach((anim) => {
            expect(CLIENT).toContain(`'${anim}'`);
        });
    });

    test('getStickersFor includes the resolved animation', () => {
        const { stickers: list } = stickers.getStickersFor('Simona');
        list.forEach((s) => expect(s.anim).toBeTruthy());
    });

    test('findSticker includes the resolved animation', () => {
        expect(stickers.findSticker('simona-laugh').anim).toBe('laugh');
        expect(stickers.findSticker('nope')).toBeNull();
    });
});

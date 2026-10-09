'use strict';

// Name-gated sticker sets.
//
// Picking a character name as your display name unlocks that character's
// stickers. This is an easter egg, NOT an access-control mechanism: display
// names are self-declared, so anyone can type "Goku" and unlock that set. That's
// intentional — it nudges people toward fun names.
//
// The unlock check still lives on the server so a client can't claim stickers it
// hasn't earned, and so the catalogue stays a single source of truth.

/**
 * Each set lists the aliases that unlock it and the stickers it contains.
 *
 * A sticker is either:
 *   - image based: { id, src, label }   (preferred; transparent PNG)
 *   - glyph based: { id, glyph, label } (emoji fallback, no asset needed)
 *
 * Image packs live in /public/images/stickers/<name>/ and are pre-processed
 * with tools/remove-sticker-bg.py to strip the baked-in checkerboard and
 * downsize them.
 */
const STICKER_SETS = {
    daniele: {
        aliases: ['daniele', 'dani', 'raditz'],
        stickers: [
            { id: 'daniele-thumbsup', src: '/images/stickers/daniele/thumbsup.png', label: 'Approvato!' },
            { id: 'daniele-surprised', src: '/images/stickers/daniele/surprised.png', label: 'Lo scouter non mente!' },
            { id: 'daniele-hello', src: '/images/stickers/daniele/hello.png', label: 'Sono tuo fratello!' },
            { id: 'daniele-coolpose', src: '/images/stickers/daniele/coolpose.png', label: 'Orgoglio Saiyan' },
            { id: 'daniele-thanks', src: '/images/stickers/daniele/thanks.png', label: 'Grazie!' },
            { id: 'daniele-laugh', src: '/images/stickers/daniele/laugh.png', label: 'Ahahah, patetico!' },
            { id: 'daniele-victory', src: '/images/stickers/daniele/victory.png', label: 'Vittoria!' }
        ]
    },
    luigi: {
        aliases: ['luigi', 'gigi', 'lui'],
        // Covers the stretched-out variants he actually uses: luis, luiss,
        // luisss, luigiii ... rather than listing every possible spelling.
        patterns: [/^lui+s+$/, /^luigi+$/, /^gigi+$/],
        stickers: [
            { id: 'luigi-thumbsup', src: '/images/stickers/luigi/thumbsup.png', label: 'Ci sta!' },
            { id: 'luigi-surprised', src: '/images/stickers/luigi/surprised.png', label: 'Ma quanti punti?!' },
            { id: 'luigi-hello', src: '/images/stickers/luigi/hello.png', label: 'Ciao a tutti!' },
            { id: 'luigi-coolpose', src: '/images/stickers/luigi/coolpose.png', label: 'Tranquilli, ci penso io' },
            { id: 'luigi-thanks', src: '/images/stickers/luigi/thanks.png', label: 'Grazie mille!' },
            { id: 'luigi-laugh', src: '/images/stickers/luigi/laugh.png', label: 'Ahahah!' },
            { id: 'luigi-victory', src: '/images/stickers/luigi/victory.png', label: 'Sprint salvato!' }
        ]
    },
    gabriele: {
        // Broly themed pack.
        aliases: ['gabriele', 'gabri', 'gab', 'gabbo', 'gabbosaur', 'gabbosaurus', 'broly', 'brolly'],
        stickers: [
            { id: 'gabriele-thumbsup', src: '/images/stickers/gabriele/thumbsup.png', label: 'Approvato!' },
            { id: 'gabriele-surprised', src: '/images/stickers/gabriele/surprised.png', label: 'Ma come?!' },
            { id: 'gabriele-hello', src: '/images/stickers/gabriele/hello.png', label: 'Ciao!' },
            { id: 'gabriele-angry', src: '/images/stickers/gabriele/angry.png', label: 'KAKAROT!' },
            { id: 'gabriele-thanks', src: '/images/stickers/gabriele/thanks.png', label: 'Grazie!' },
            { id: 'gabriele-laugh', src: '/images/stickers/gabriele/laugh.png', label: 'Ahahah!' },
            { id: 'gabriele-victory', src: '/images/stickers/gabriele/victory.png', label: 'Potenza illimitata!' }
        ]
    },
    marco: {
        // Goku Black themed pack.
        aliases: ['marco', 'marc', 'goku black', 'gokublack', 'black'],
        stickers: [
            { id: 'marco-thumbsup', src: '/images/stickers/marco/thumbsup.png', label: 'Approvo.' },
            { id: 'marco-surprised', src: '/images/stickers/marco/surprised.png', label: 'Interessante...' },
            { id: 'marco-hello', src: '/images/stickers/marco/hello.png', label: 'Salve, mortali' },
            { id: 'marco-thanks', src: '/images/stickers/marco/thanks.png', label: 'Grazie.' },
            { id: 'marco-laugh', src: '/images/stickers/marco/laugh.png', label: 'Che ingenui!' },
            { id: 'marco-victory', src: '/images/stickers/marco/victory.png', label: 'Giustizia divina' },
            { id: 'marco-zamasu', src: '/images/stickers/marco/pose-1.png', label: 'Questo task è un peccato' }
        ]
    },
    samuele: {
        aliases: ['samuele', 'samu', 'sam'],
        stickers: [
            { id: 'samuele-thumbsup', src: '/images/stickers/samuele/thumbsup.png', label: 'Ottimo!' },
            { id: 'samuele-surprised', src: '/images/stickers/samuele/surprised.png', label: 'Non ci credo!' },
            { id: 'samuele-coolpose', src: '/images/stickers/samuele/coolpose.png', label: 'Facile.' },
            { id: 'samuele-confident', src: '/images/stickers/samuele/confident.png', label: 'Lo gestisco io' },
            { id: 'samuele-thanks', src: '/images/stickers/samuele/thanks.png', label: 'Grazie!' },
            { id: 'samuele-laugh', src: '/images/stickers/samuele/laugh.png', label: 'Ahahah!' },
            { id: 'samuele-victory', src: '/images/stickers/samuele/victory.png', label: 'Fatto!' }
        ]
    },
    simona: {
        aliases: ['simona', 'simo'],
        stickers: [
            { id: 'simona-thumbsup', src: '/images/stickers/simona/thumbsup.png', label: 'Perfetto!' },
            { id: 'simona-laugh', src: '/images/stickers/simona/laugh.png', label: 'Ahahah!' },
            { id: 'simona-surprised', src: '/images/stickers/simona/surprised.png', label: 'Davvero?!' },
            { id: 'simona-thanks', src: '/images/stickers/simona/thanks.png', label: 'Grazie!' },
            { id: 'simona-victory', src: '/images/stickers/simona/victory.png', label: 'Vittoria!' },
            { id: 'simona-hello', src: '/images/stickers/simona/hello.png', label: 'Ciao!' },
            { id: 'simona-fantasy', src: '/images/stickers/simona/fantasy.png', label: 'Magia!' }
        ]
    },
    goku: {
        aliases: ['goku', 'kakarot', 'kakarott', 'son goku', 'songoku'],
        stickers: [
            { id: 'goku-kamehameha', glyph: '🌊', label: 'KAMEHAMEHA!' },
            { id: 'goku-genki', glyph: '🔵', label: 'GENKIDAMA!' },
            { id: 'goku-ssj', glyph: '⚡', label: 'SUPER SAIYAN!' },
            { id: 'goku-hungry', glyph: '🍜', label: 'Ho fame...' }
        ]
    },
    vegeta: {
        aliases: ['vegeta', 'vegita', 'principe vegeta', 'prince vegeta'],
        stickers: [
            { id: 'vegeta-over9000', glyph: '📈', label: "IT'S OVER 9000!" },
            { id: 'vegeta-final', glyph: '💥', label: 'FINAL FLASH!' },
            { id: 'vegeta-pride', glyph: '👑', label: 'Orgoglio Saiyan' },
            { id: 'vegeta-tsk', glyph: '😤', label: 'Tsk. Patetico.' }
        ]
    },
    gohan: {
        aliases: ['gohan', 'son gohan', 'songohan'],
        stickers: [
            { id: 'gohan-study', glyph: '📚', label: 'Devo studiare!' },
            { id: 'gohan-rage', glyph: '😡', label: 'RABBIA REPRESSA' },
            { id: 'gohan-cell', glyph: '🫸', label: 'Kamehameha a una mano' }
        ]
    },
    piccolo: {
        aliases: ['piccolo', 'junior', 'piccolo junior'],
        stickers: [
            { id: 'piccolo-makankosappo', glyph: '🫲', label: 'MAKANKOSAPPO!' },
            { id: 'piccolo-wise', glyph: '🧘', label: 'Medita, giovane' },
            { id: 'piccolo-cape', glyph: '🧥', label: 'Peso del mantello' }
        ]
    },
    krillin: {
        aliases: ['krillin', 'crilin', 'kuririn'],
        stickers: [
            { id: 'krillin-destructo', glyph: '🥏', label: 'DISCO DISTRUTTORE!' },
            { id: 'krillin-dead', glyph: '💀', label: 'Sono morto di nuovo' },
            { id: 'krillin-zero', glyph: '0️⃣', label: 'Per me è uno zero' }
        ]
    },
    bulma: {
        aliases: ['bulma', 'bulmaa'],
        stickers: [
            { id: 'bulma-invent', glyph: '🔧', label: 'Ci penso io' },
            { id: 'bulma-radar', glyph: '📡', label: 'Radar del Drago' },
            { id: 'bulma-angry', glyph: '💢', label: 'Non farmi arrabbiare' }
        ]
    },
    freezer: {
        aliases: ['freezer', 'frieza', 'freeza'],
        stickers: [
            { id: 'freezer-laugh', glyph: '🤣', label: 'Oh ho ho ho!' },
            { id: 'freezer-full', glyph: '🦾', label: 'Massima potenza' },
            { id: 'freezer-estimate', glyph: '🫰', label: 'Stima questa' }
        ]
    },
    beerus: {
        aliases: ['beerus', 'bills', 'birus'],
        stickers: [
            { id: 'beerus-hakai', glyph: '🟣', label: 'HAKAI' },
            { id: 'beerus-food', glyph: '🍮', label: 'Che pudding è questo?' },
            { id: 'beerus-nap', glyph: '😴', label: 'Torno a dormire' }
        ]
    }
};

/** Stickers everyone gets, regardless of name. */
const DEFAULT_STICKERS = [
    { id: 'base-lgtm', glyph: '🐉', label: 'LGTM' },
    { id: 'base-split', glyph: '✂️', label: 'Troppo grande, dividiamola' },
    { id: 'base-nocomment', glyph: '🫥', label: 'No comment' }
];

/**
 * Normalises a display name for matching: lowercase, trimmed, accents stripped,
 * and punctuation removed, so "Vegeta!" and "vegeta" both match.
 */
function normalizeName(name) {
    if (typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // strip accents
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Returns the sticker set key unlocked by a display name, or null.
 *
 * Matching, in order of preference:
 *  1. exact alias match on the whole normalised name
 *  2. a single-word alias appearing as a word in the name ("Goku Sama")
 *  3. an optional regex in `patterns`, tested against the whole name and each
 *     word. This exists so a set can absorb stretched-out spellings
 *     ("luiss", "luisss") without listing every variant by hand.
 */
function resolveSetKey(name) {
    const normalized = normalizeName(name);
    if (!normalized) return null;

    const words = normalized.split(' ');
    const entries = Object.entries(STICKER_SETS);

    // Exact and word-level alias matches first, so a literal alias always wins
    // over another set's looser pattern.
    for (const [key, set] of entries) {
        for (const alias of set.aliases) {
            if (normalized === alias) return key;
            if (!alias.includes(' ') && words.includes(alias)) return key;
        }
    }

    for (const [key, set] of entries) {
        if (!set.patterns) continue;
        for (const re of set.patterns) {
            if (re.test(normalized) || words.some((w) => re.test(w))) return key;
        }
    }
    return null;
}

/**
 * Full sticker list available to a given display name (defaults + any unlocked
 * set).
 */
function getStickersFor(name) {
    const key = resolveSetKey(name);
    const unlocked = key ? STICKER_SETS[key].stickers : [];
    return {
        setKey: key,
        stickers: [...DEFAULT_STICKERS, ...unlocked].map(withAnim)
    };
}

/** True if `name` is allowed to send the sticker `id`. */
function canSend(name, id) {
    if (typeof id !== 'string') return false;
    return getStickersFor(name).stickers.some((s) => s.id === id);
}

/** Looks up a sticker by id across defaults and every set. */
function findSticker(id) {
    const all = [
        ...DEFAULT_STICKERS,
        ...Object.values(STICKER_SETS).flatMap((s) => s.stickers)
    ];
    const found = all.find((s) => s.id === id);
    return found ? withAnim(found) : null;
}

/**
 * Maps a sticker id onto a pop-in animation, so the motion expresses the
 * emotion: a laugh wobbles, a surprise snaps in, a thumbs-up punches upward.
 *
 * Derived from the id rather than declared per sticker, because the packs
 * already share a naming vocabulary (thumbsup / surprised / laugh / ...).
 * Explicit `anim` on a sticker always wins.
 */
const ANIM_BY_POSE = [
    ['laugh',     /laugh|risat/],
    ['surprise',  /surprise|sorpres|shock/],
    ['approve',   /thumbsup|approv|lgtm/],
    ['bow',       /thanks|grazie|pray/],
    ['wave',      /hello|salut|ciao|wave/],
    ['slam',      /angry|minaccios|rage|hakai|final|kamehameha/],
    ['rise',      /victory|vittoria|win|ssj|genki|super/],
    ['swagger',   /cool|confident|pride|orgoglio/],
    ['fade',      /nocomment|nope|tsk|dead|zero/],
    ['sparkle',   /fantasy|magic|magia|star/]
];

function animFor(sticker) {
    if (sticker.anim) return sticker.anim;
    const id = String(sticker.id || '').toLowerCase();
    for (const [anim, re] of ANIM_BY_POSE) {
        if (re.test(id)) return anim;
    }
    return 'pop';
}

/** Returns a copy of the sticker with its animation resolved. */
function withAnim(sticker) {
    return { ...sticker, anim: animFor(sticker) };
}

/**
 * Sanity-checks every image path in the catalogue at startup, so a typo shows
 * up immediately instead of as a broken image for whoever unlocked that set.
 * Image paths are also constrained to the stickers directory, since they are
 * handed to clients and used as an <img> src.
 */
function validateCatalogue() {
    const problems = [];

    // Aliases must be unique across sets, or one set becomes unreachable.
    const aliasOwner = {};
    for (const [key, set] of Object.entries(STICKER_SETS)) {
        for (const alias of set.aliases) {
            if (aliasOwner[alias]) {
                problems.push(`alias "${alias}" is claimed by both ${aliasOwner[alias]} and ${key}`);
            }
            aliasOwner[alias] = key;
        }
        for (const re of set.patterns || []) {
            if (!(re instanceof RegExp)) {
                problems.push(`${key}: patterns must contain RegExp values (got ${typeof re})`);
            }
        }
    }

    const all = [
        ...DEFAULT_STICKERS,
        ...Object.values(STICKER_SETS).flatMap((s) => s.stickers)
    ];
    const seen = new Set();

    for (const s of all) {
        if (!s.id) problems.push(`sticker without an id: ${JSON.stringify(s)}`);
        if (seen.has(s.id)) problems.push(`duplicate sticker id: ${s.id}`);
        seen.add(s.id);
        if (!s.src && !s.glyph) problems.push(`${s.id}: needs either src or glyph`);
        if (s.src && !/^\/images\/stickers\/[A-Za-z0-9_\-/]+\.(png|gif|webp)$/.test(s.src)) {
            problems.push(`${s.id}: src must be a png/gif/webp under /images/stickers/ (got ${s.src})`);
        }
    }
    return problems;
}

module.exports = {
    STICKER_SETS,
    DEFAULT_STICKERS,
    normalizeName,
    resolveSetKey,
    getStickersFor,
    canSend,
    findSticker,
    animFor,
    validateCatalogue
};

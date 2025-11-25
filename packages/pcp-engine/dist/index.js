export const PRESETS = {
    easy: { tileCount: 5, alphabet: ["a", "b"], minLength: 2, maxLength: 3, allowUnsolvable: false },
    medium: { tileCount: 6, alphabet: ["a", "b", "c"], minLength: 2, maxLength: 4, allowUnsolvable: false },
    hard: { tileCount: 8, alphabet: ["a", "b", "c"], minLength: 3, maxLength: 5, allowUnsolvable: false },
    extreme: { tileCount: 9, alphabet: ["a", "b", "c", "d"], minLength: 3, maxLength: 6, allowUnsolvable: true },
};
const DEFAULT_TARGET_LENGTH = 7;
const mulberry32 = (seed) => {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};
const hashSeed = (seed) => {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return (h ^ (h >>> 16)) >>> 0;
};
const randomString = (rng, alphabet, length) => {
    let out = "";
    for (let i = 0; i < length; i++) {
        const idx = Math.floor(rng() * alphabet.length) % alphabet.length;
        out += alphabet[idx];
    }
    return out;
};
const deriveSeed = (seed) => {
    if (seed && seed.trim().length > 0)
        return seed.trim();
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `seed-${Math.random().toString(36).slice(2, 10)}`;
};
const shuffle = (rng, arr) => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
};
const makeId = (rng, idx) => `tile-${idx}-${Math.floor(rng() * 1e6).toString(36)}`;
const randomPartition = (rng, total, count, minLen, maxLen) => {
    if (total < count * minLen || total > count * maxLen)
        return null;
    let attempts = 0;
    while (attempts < 100) {
        const cuts = new Set();
        while (cuts.size < count - 1) {
            cuts.add(1 + Math.floor(rng() * (total - 1)));
        }
        const sorted = [0, ...Array.from(cuts).sort((a, b) => a - b), total];
        const lens = [];
        let ok = true;
        for (let i = 0; i < sorted.length - 1; i++) {
            const len = sorted[i + 1] - sorted[i];
            if (len < minLen || len > maxLen) {
                ok = false;
                break;
            }
            lens.push(len);
        }
        if (ok)
            return lens;
        attempts++;
    }
    return null;
};
const buildSolvableTiles = (rng, settings) => {
    const tiles = [];
    const solution = [];
    const minLen = Math.max(1, settings.minLength);
    const maxLen = Math.max(minLen, settings.maxLength);
    const minTotal = settings.tileCount * minLen;
    const maxTotal = settings.tileCount * maxLen;
    let topParts = null;
    let bottomParts = null;
    let totalLength = 0;
    let tries = 0;
    while (tries < 50 && (!topParts || !bottomParts)) {
        totalLength = Math.min(maxTotal, Math.max(minTotal, DEFAULT_TARGET_LENGTH + Math.floor(rng() * (maxTotal - minTotal + 1))));
        topParts = randomPartition(rng, totalLength, settings.tileCount, minLen, maxLen);
        bottomParts = randomPartition(rng, totalLength, settings.tileCount, minLen, maxLen);
        if (topParts && bottomParts) {
            const hasDiff = topParts.some((len, idx) => len !== bottomParts[idx]);
            if (!hasDiff) {
                topParts = null;
                bottomParts = null;
            }
        }
        tries++;
    }
    if (!topParts || !bottomParts) {
        const base = Array.from({ length: settings.tileCount }, () => minLen);
        base[0] = minLen;
        base[1] = Math.min(maxLen, minLen + 1);
        topParts = [...base];
        bottomParts = [...base].reverse();
        totalLength = base.reduce((sum, v) => sum + v, 0);
    }
    const target = randomString(rng, settings.alphabet, totalLength);
    let topOffset = 0;
    let bottomOffset = 0;
    for (let i = 0; i < settings.tileCount; i++) {
        const topLen = topParts[i];
        const bottomLen = bottomParts[i];
        const topSlice = target.slice(topOffset, topOffset + topLen);
        const bottomSlice = target.slice(bottomOffset, bottomOffset + bottomLen);
        const id = makeId(rng, i);
        tiles.push({ id, top: topSlice, bottom: bottomSlice });
        solution.push(id);
        topOffset += topLen;
        bottomOffset += bottomLen;
    }
    const shuffledTiles = shuffle(rng, tiles);
    return { tiles: shuffledTiles, solution };
};
export const generatePuzzle = ({ preset, seed }) => {
    const settings = PRESETS[preset];
    const actualSeed = deriveSeed(seed);
    const rng = mulberry32(hashSeed(actualSeed));
    const shouldBeUnsolvable = settings.allowUnsolvable && rng() > 0.6;
    if (shouldBeUnsolvable) {
        const tiles = Array.from({ length: settings.tileCount }).map((_, idx) => {
            const top = randomString(rng, settings.alphabet, settings.minLength);
            let bottom = randomString(rng, settings.alphabet, settings.maxLength);
            if (bottom === top) {
                bottom = `${bottom}${settings.alphabet[Math.floor(rng() * settings.alphabet.length)]}`;
            }
            return { id: makeId(rng, idx), top, bottom };
        });
        return { seed: actualSeed, preset, settings, tiles, solvable: false };
    }
    const { tiles, solution } = buildSolvableTiles(rng, settings);
    return { seed: actualSeed, preset, settings, tiles, solvable: true, solution };
};
export const validateSolution = (puzzle, order) => {
    if (order.length !== puzzle.settings.tileCount)
        return false;
    const unique = new Set(order);
    if (unique.size !== puzzle.settings.tileCount)
        return false;
    for (const id of unique) {
        if (!puzzle.tiles.find((t) => t.id === id))
            return false;
    }
    const byId = new Map(puzzle.tiles.map((t) => [t.id, t]));
    let top = "";
    let bottom = "";
    for (const id of order) {
        const tile = byId.get(id);
        if (!tile)
            return false;
        top += tile.top;
        bottom += tile.bottom;
    }
    return top === bottom;
};
export const findSolution = (puzzle) => {
    if (!puzzle.solvable)
        return null;
    return puzzle.solution ? [...puzzle.solution] : null;
};

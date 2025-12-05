export type PresetName = "easy" | "medium" | "hard" | "tricky" | "expert";

export type Tile = {
  id: string;
  top: string;
  bottom: string;
};

export type AlphabetTheme = "preset" | "binary" | "wide";

export type PuzzleSettings = {
  tileCount: number;
  tileCountRange?: [number, number];
  alphabet: string[];
  minLength: number;
  maxLength: number;
  allowUnsolvable: boolean;
  forceUnique: boolean;
  theme?: AlphabetTheme;
};

export type PuzzleInstance = {
  seed: string;
  preset: PresetName;
  settings: PuzzleSettings;
  tiles: Tile[];
  solvable: boolean;
  solution?: string[]; // tile ids in order
};

const ALPHABET_POOL = "abcdefghijklmnopqrstuvwxyz".split("");

export const PRESETS: Record<PresetName, PuzzleSettings> = {
  easy: {
    tileCount: 3,
    alphabet: ALPHABET_POOL.slice(0, 2),
    minLength: 2,
    maxLength: 3,
    allowUnsolvable: false,
    forceUnique: true,
  },
  medium: {
    tileCount: 5,
    alphabet: ALPHABET_POOL.slice(0, 3),
    minLength: 2,
    maxLength: 4,
    allowUnsolvable: false,
    forceUnique: true,
  },
  hard: {
    tileCount: 7,
    alphabet: ALPHABET_POOL.slice(0, 3),
    minLength: 3,
    maxLength: 5,
    allowUnsolvable: false,
    forceUnique: true,
  },
  tricky: {
    tileCount: 6,
    alphabet: ALPHABET_POOL.slice(0, 3),
    minLength: 2,
    maxLength: 4,
    allowUnsolvable: false,
    forceUnique: false,
  },
  expert: {
    tileCount: 9,
    tileCountRange: [8, 10],
    alphabet: ALPHABET_POOL.slice(0, 5),
    minLength: 4,
    maxLength: 7,
    allowUnsolvable: true,
    forceUnique: true,
  },
};

export type GenerateOptions = {
  preset: PresetName;
  seed?: string;
  overrides?: Partial<{
    tileCount: number;
    minLength: number;
    maxLength: number;
    alphabet: string[];
    alphabetSize: number;
    allowUnsolvable: boolean;
    forceUnique: boolean;
    theme: AlphabetTheme;
  }>;
};

type Rng = () => number;

const mulberry32 = (seed: number): Rng => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const hashSeed = (seed: string): number => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
};

const randomString = (rng: Rng, alphabet: string[], length: number) => {
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(rng() * alphabet.length) % alphabet.length;
    out += alphabet[idx];
  }
  return out;
};

const tweakString = (rng: Rng, value: string, alphabet: string[]): string => {
  if (value.length === 0) return value;
  const idx = Math.floor(rng() * value.length);
  const current = value[idx];
  const replacement = alphabet.find((c) => c !== current) ?? current;
  return value.slice(0, idx) + replacement + value.slice(idx + 1);
};

const deriveSeed = (seed?: string) => {
  if (seed && seed.trim().length > 0) return seed.trim();
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `seed-${Math.random().toString(36).slice(2, 10)}`;
};

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

const buildAlphabet = (size: number) => ALPHABET_POOL.slice(0, clampInt(size, 1, ALPHABET_POOL.length));

const resolveSettings = (preset: PresetName, rng: Rng, overrides?: GenerateOptions["overrides"]): PuzzleSettings => {
  const base = PRESETS[preset];
  const tileCountRange: [number, number] = overrides?.tileCount
    ? [overrides.tileCount, overrides.tileCount]
    : base.tileCountRange ?? [base.tileCount, base.tileCount];
  const tileCountSpan = tileCountRange[1] - tileCountRange[0] + 1;
  const tileCount =
    overrides?.tileCount ?? clampInt(tileCountRange[0] + Math.floor(rng() * tileCountSpan), 2, 24);

  const minLength = clampInt(overrides?.minLength ?? base.minLength, 1, 48);
  const maxLength = clampInt(overrides?.maxLength ?? base.maxLength, minLength, 64);

  const alphabetOverride = overrides?.alphabet;
  const theme: AlphabetTheme = overrides?.theme ?? "preset";
  let alphabetSize = overrides?.alphabetSize ?? alphabetOverride?.length ?? base.alphabet.length;
  let alphabet: string[];

  if (alphabetOverride) {
    alphabet = [...alphabetOverride];
    alphabetSize = alphabet.length;
  } else if (theme === "binary") {
    alphabet = ["0", "1"];
    alphabetSize = alphabet.length;
  } else if (theme === "wide") {
    alphabetSize = clampInt(Math.max(alphabetSize, 5), 5, 6);
    alphabet = buildAlphabet(alphabetSize);
  } else {
    alphabet = buildAlphabet(alphabetSize);
    alphabetSize = alphabet.length;
  }

  return {
    tileCount,
    tileCountRange,
    alphabet,
    minLength,
    maxLength,
    allowUnsolvable: overrides?.allowUnsolvable ?? base.allowUnsolvable,
    forceUnique: overrides?.forceUnique ?? base.forceUnique,
    theme,
  };
};

const shuffle = <T,>(rng: Rng, arr: T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const makeId = (rng: Rng, idx: number) => `tile-${idx}-${Math.floor(rng() * 1e6).toString(36)}`;

const randomPartition = (
  rng: Rng,
  total: number,
  count: number,
  minLen: number,
  maxLen: number,
): number[] | null => {
  if (total < count * minLen || total > count * maxLen) return null;
  let attempts = 0;
  while (attempts < 100) {
    const cuts = new Set<number>();
    while (cuts.size < count - 1) {
      cuts.add(1 + Math.floor(rng() * (total - 1)));
    }
    const sorted = [0, ...Array.from(cuts).sort((a, b) => a - b), total];
    const lens: number[] = [];
    let ok = true;
    for (let i = 0; i < sorted.length - 1; i++) {
      const len = sorted[i + 1] - sorted[i];
      if (len < minLen || len > maxLen) {
        ok = false;
        break;
      }
      lens.push(len);
    }
    if (ok) return lens;
    attempts++;
  }
  return null;
};

const partitionsForceEqualTile = (topParts: number[], bottomParts: number[], maxAlignedEquals: number): boolean => {
  let topOffset = 0;
  let bottomOffset = 0;
  let alignedEquals = 0;
  for (let i = 0; i < topParts.length; i++) {
    if (topOffset === bottomOffset && topParts[i] === bottomParts[i]) {
      alignedEquals++;
      if (alignedEquals > maxAlignedEquals) {
        return true;
      }
    }
    topOffset += topParts[i];
    bottomOffset += bottomParts[i];
  }
  return false;
};

const buildSolvableTiles = (rng: Rng, settings: PuzzleSettings): { tiles: Tile[]; solution: string[] } => {
  const minLen = Math.max(1, settings.minLength);
  const maxLen = Math.max(minLen, settings.maxLength);
  const minTotal = settings.tileCount * minLen;
  const maxTotal = settings.tileCount * maxLen;
  const requireUnique = settings.forceUnique !== false;
  const maxAlignedEquals = requireUnique ? (settings.tileCount >= 6 ? 1 : 0) : settings.tileCount;

  let attempts = 0;
  while (attempts < 100) {
    let topParts: number[] | null = null;
    let bottomParts: number[] | null = null;
    let totalLength = 0;
    let tries = 0;

    while (tries < 50 && (!topParts || !bottomParts)) {
      const dynamicTargetBase =
        minTotal +
        Math.floor(
          rng() *
            Math.max(
              1,
              Math.min(
                maxTotal - minTotal,
                Math.round((maxTotal - minTotal) * 0.6),
              ),
            ),
        );
      totalLength = Math.min(
        maxTotal,
        Math.max(minTotal, dynamicTargetBase + Math.floor(rng() * (maxLen - minLen + 1))),
      );
      topParts = randomPartition(rng, totalLength, settings.tileCount, minLen, maxLen);
      bottomParts = randomPartition(rng, totalLength, settings.tileCount, minLen, maxLen);

      if (topParts && bottomParts) {
        const hasDiff = topParts.some((len, idx) => len !== bottomParts![idx]);
        const forcedMatch = requireUnique && partitionsForceEqualTile(topParts, bottomParts, maxAlignedEquals);
        if (!hasDiff || forcedMatch) {
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

    if (
      requireUnique &&
      topParts &&
      bottomParts &&
      partitionsForceEqualTile(topParts, bottomParts, maxAlignedEquals)
    ) {
      attempts++;
      continue;
    }

    for (let targetAttempt = 0; targetAttempt < 60; targetAttempt++) {
      const target = randomString(rng, settings.alphabet, totalLength);
      const tiles: Tile[] = [];
      const solution: string[] = [];
      const seen = new Set<string>();

      let topOffset = 0;
      let bottomOffset = 0;
      let invalid = false;

      for (let i = 0; i < settings.tileCount; i++) {
        const topLen = topParts![i];
        const bottomLen = bottomParts![i];

        const topSlice = target.slice(topOffset, topOffset + topLen);
        const bottomSlice = target.slice(bottomOffset, bottomOffset + bottomLen);
        const key = `${topSlice}|${bottomSlice}`;

        if (seen.has(key) || topSlice === bottomSlice) {
          invalid = true;
          break;
        }

        const id = makeId(rng, i);
        tiles.push({ id, top: topSlice, bottom: bottomSlice });
        solution.push(id);
        seen.add(key);

        topOffset += topLen;
        bottomOffset += bottomLen;
      }

      if (!invalid) {
        const shuffledTiles = shuffle(rng, tiles);
        return { tiles: shuffledTiles, solution };
      }
    }

    attempts++;
  }

  throw new Error("Failed to generate a solvable tile set.");
};

export const generatePuzzle = ({ preset, seed, overrides }: GenerateOptions): PuzzleInstance => {
  const actualSeed = deriveSeed(seed);
  const rng = mulberry32(hashSeed(actualSeed));
  const settings = resolveSettings(preset, rng, overrides);

  const shouldBeUnsolvable = settings.allowUnsolvable && rng() > 0.6;

  if (shouldBeUnsolvable) {
    const seen = new Set<string>();
    const tiles: Tile[] = Array.from({ length: settings.tileCount }).map((_, idx) => {
      let top = "";
      let bottom = "";
      let key = "";
      let guard = 0;

      do {
        const topLen = settings.minLength + Math.floor(rng() * Math.max(1, settings.maxLength - settings.minLength + 1));
        const bottomLen = settings.minLength + Math.floor(rng() * Math.max(1, settings.maxLength - settings.minLength + 1));
        top = randomString(rng, settings.alphabet, topLen);
        bottom = randomString(rng, settings.alphabet, bottomLen);
        if (bottom === top) bottom = tweakString(rng, bottom, settings.alphabet);
        key = `${top}|${bottom}`;
        guard++;
      } while ((seen.has(key) || top === bottom) && guard < 50);

      if (top === bottom) {
        bottom = tweakString(rng, bottom, settings.alphabet);
      }

      seen.add(key);
      return { id: makeId(rng, idx), top, bottom };
    });
    return { seed: actualSeed, preset, settings, tiles, solvable: false };
  }

  const { tiles, solution } = buildSolvableTiles(rng, settings);
  return { seed: actualSeed, preset, settings, tiles, solvable: true, solution };
};

export const validateSolution = (puzzle: PuzzleInstance, order: string[]): boolean => {
  if (order.length === 0) return false;
  const byId = new Map(puzzle.tiles.map((t) => [t.id, t]));
  let top = "";
  let bottom = "";
  for (const id of order) {
    const tile = byId.get(id);
    if (!tile) return false;
    top += tile.top;
    bottom += tile.bottom;
  }
  return top === bottom;
};

export const findSolution = (puzzle: PuzzleInstance): string[] | null => {
  if (!puzzle.solvable) return null;
  return puzzle.solution ? [...puzzle.solution] : null;
};

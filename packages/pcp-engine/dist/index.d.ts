export type PresetName = "easy" | "medium" | "hard" | "custom";
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
    solution?: string[];
};
export declare const PRESETS: Record<PresetName, PuzzleSettings>;
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
export declare const generatePuzzle: ({ preset, seed, overrides }: GenerateOptions) => PuzzleInstance;
export declare const validateSolution: (puzzle: PuzzleInstance, order: string[]) => boolean;
export declare const findSolution: (puzzle: PuzzleInstance) => string[] | null;

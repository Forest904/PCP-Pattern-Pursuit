export type PresetName = "easy" | "medium" | "hard" | "extreme";
export type Tile = {
    id: string;
    top: string;
    bottom: string;
};
export type PuzzleSettings = {
    tileCount: number;
    alphabet: string[];
    minLength: number;
    maxLength: number;
    allowUnsolvable: boolean;
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
};
export declare const generatePuzzle: ({ preset, seed }: GenerateOptions) => PuzzleInstance;
export declare const validateSolution: (puzzle: PuzzleInstance, order: string[]) => boolean;
export declare const findSolution: (puzzle: PuzzleInstance) => string[] | null;

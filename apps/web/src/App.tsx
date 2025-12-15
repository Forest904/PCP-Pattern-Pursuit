import { Fragment, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  PRESETS,
  type AlphabetTheme,
  type PresetName,
  type PuzzleInstance,
  type PuzzleSettings,
  generatePuzzle,
  validateSolution,
  findSolution,
} from "@pcp/pattern-engine";
import "./App.css";

type Status = "idle" | "playing" | "solved" | "unsolved";

type DragState = {
  draggingId: string | null;
  selectedId: string | null;
};

type KnobState = {
  tileCount: number;
  minLength: number;
  maxLength: number;
  alphabetSize: number;
  allowUnsolvable: boolean;
  forceUnique: boolean;
  theme: AlphabetTheme;
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const presetLabels: Record<PresetName, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  tricky: "Tricky",
  expert: "Expert/Marathon",
};

const presetOrder: PresetName[] = ["easy", "medium", "hard", "tricky", "expert"];

const normalizeKnobs = (value: KnobState): KnobState => {
  const minLength = Math.min(48, Math.max(1, Math.round(value.minLength)));
  const maxLength = Math.min(64, Math.max(minLength, Math.round(value.maxLength)));
  const tileCount = Math.min(16, Math.max(2, Math.round(value.tileCount)));
  const alphabetSizeRaw = Math.min(26, Math.max(1, Math.round(value.alphabetSize)));
  const theme: AlphabetTheme = value.theme === "binary" || value.theme === "wide" ? value.theme : "preset";
  const alphabetSize =
    theme === "binary" ? 2 : theme === "wide" ? Math.min(6, Math.max(5, alphabetSizeRaw)) : alphabetSizeRaw;
  return {
    tileCount,
    minLength,
    maxLength,
    alphabetSize,
    allowUnsolvable: value.allowUnsolvable,
    forceUnique: value.forceUnique,
    theme,
  };
};

const settingsToKnobs = (settings: PuzzleSettings): KnobState =>
  normalizeKnobs({
    tileCount: settings.tileCount,
    minLength: settings.minLength,
    maxLength: settings.maxLength,
    alphabetSize: settings.alphabet.length,
    allowUnsolvable: settings.allowUnsolvable,
    forceUnique: settings.forceUnique,
    theme: settings.theme ?? "preset",
  });

const presetDefaults: Record<PresetName, KnobState> = presetOrder.reduce((acc, name) => {
  acc[name] = settingsToKnobs(PRESETS[name]);
  return acc;
}, {} as Record<PresetName, KnobState>);

const formatSeedPayload = (seed: string, preset: PresetName, knobs: KnobState, ladderLevels?: number) => {
  const tokens = [
    seed,
    preset,
    `tc${knobs.tileCount}`,
    `min${knobs.minLength}`,
    `max${knobs.maxLength}`,
    `a${knobs.alphabetSize}`,
    `uns${knobs.allowUnsolvable ? 1 : 0}`,
    `uniq${knobs.forceUnique ? 1 : 0}`,
  ];
  if (knobs.theme && knobs.theme !== "preset") {
    tokens.push(`th${knobs.theme}`);
  }
  if (ladderLevels && ladderLevels > 1) {
    tokens.push(`lad${ladderLevels}`);
  }
  return tokens.join("|");
};

const parseSeedPayload = (
  raw: string,
): { seed?: string; preset?: PresetName; knobs?: Partial<KnobState>; ladderLevels?: number } => {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (!trimmed.includes("|") && trimmed.includes(":")) {
    const [seedPart, presetMaybe] = trimmed.split(":");
    const preset = presetOrder.includes(presetMaybe as PresetName) ? (presetMaybe as PresetName) : undefined;
    return { seed: seedPart, preset };
  }
  const parts = trimmed.split("|").filter(Boolean);
  const [seedPart, ...tokens] = parts;
  let preset: PresetName | undefined;
  const knobTokens: string[] = [];

  for (const token of tokens) {
    if (!preset && presetOrder.includes(token as PresetName)) {
      preset = token as PresetName;
    } else {
      knobTokens.push(token);
    }
  }
  const knobs: Partial<KnobState> = {};
  let ladderLevels: number | undefined;

  for (const token of knobTokens) {
    if (token.startsWith("tc")) {
      const value = Number(token.slice(2));
      if (!Number.isNaN(value)) knobs.tileCount = value;
      continue;
    }
    if (token.startsWith("min")) {
      const value = Number(token.slice(3));
      if (!Number.isNaN(value)) knobs.minLength = value;
      continue;
    }
    if (token.startsWith("max")) {
      const value = Number(token.slice(3));
      if (!Number.isNaN(value)) knobs.maxLength = value;
      continue;
    }
    if (token.startsWith("a")) {
      const value = Number(token.slice(1));
      if (!Number.isNaN(value)) knobs.alphabetSize = value;
      continue;
    }
    if (token.startsWith("uns")) {
      const value = Number(token.slice(3));
      knobs.allowUnsolvable = Number.isNaN(value) ? true : value > 0;
      continue;
    }
    if (token.startsWith("uniq")) {
      const value = Number(token.slice(4));
      knobs.forceUnique = Number.isNaN(value) ? true : value > 0;
      continue;
    }
    if (token.startsWith("th")) {
      const value = token.slice(2);
      if (value === "binary" || value === "wide" || value === "preset") {
        knobs.theme = value;
      }
      continue;
    }
    if (token.startsWith("lad")) {
      const value = Number(token.slice(3));
      if (!Number.isNaN(value)) ladderLevels = value;
    }
  }

  return {
    seed: seedPart,
    preset,
    knobs: Object.keys(knobs).length ? knobs : undefined,
    ladderLevels,
  };
};

const knobsToOverrides = (value: KnobState) => ({
  tileCount: value.tileCount,
  minLength: value.minLength,
  maxLength: value.maxLength,
  alphabetSize: value.alphabetSize,
  allowUnsolvable: value.allowUnsolvable,
  forceUnique: value.forceUnique,
  theme: value.theme,
});

const resolvePresetAndKnobs = (
  parsed: ReturnType<typeof parseSeedPayload>,
  currentPreset: PresetName,
  currentKnobs: KnobState,
): { preset: PresetName; knobs: KnobState } => {
  const effectivePreset = parsed.preset ?? currentPreset;
  const baseKnobs = presetDefaults[effectivePreset];
  const allowCurrent = effectivePreset === currentPreset;
  const mergedKnobs = normalizeKnobs({
    ...baseKnobs,
    ...(parsed.knobs ?? {}),
    ...(allowCurrent ? currentKnobs : {}),
  });
  return { preset: effectivePreset, knobs: mergedKnobs };
};

function App() {
  const [preset, setPreset] = useState<PresetName>("easy");
  const [knobs, setKnobs] = useState<KnobState>(() => presetDefaults["easy"]);
  const [ladderLevels, setLadderLevels] = useState(3);
  const [ladder, setLadder] = useState<{ baseSeed: string; puzzles: PuzzleInstance[]; index: number } | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [puzzle, setPuzzle] = useState<PuzzleInstance | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [moves, setMoves] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [drag, setDrag] = useState<DragState>({ draggingId: null, selectedId: null });
  const [message, setMessage] = useState<string>("Generate a puzzle to begin.");
  const [showPanel, setShowPanel] = useState(true);
  const [showBrief, setShowBrief] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [mobileActionsHidden, setMobileActionsHidden] = useState(false);
  const [mobileStage, setMobileStage] = useState<"setup" | "play">("setup");
  const [mobileActionsMinimized, setMobileActionsMinimized] = useState(false);
  const boardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (status !== "playing" || startTime === null) return;
    const id = setInterval(() => setElapsed(Date.now() - startTime), 250);
    return () => clearInterval(id);
  }, [status, startTime]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const apply = () => setIsMobile(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setShowBrief(false);
      setMobileStage((prev) => prev);
    }
    if (!isMobile) {
      setMobileStage("setup");
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      setHudCollapsed(false);
      setMobileActionsHidden(false);
      setMobileStage("setup");
      setMobileActionsMinimized(false);
      return;
    }
    const boardEl = boardRef.current;
    if (!boardEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setHudCollapsed(entry.isIntersecting);
          setMobileActionsHidden(entry.isIntersecting);
        });
      },
      { threshold: 0.2 },
    );
    observer.observe(boardEl);
    return () => observer.disconnect();
  }, [isMobile]);

  const getPuzzleMessage = (next: PuzzleInstance) => {
    if (!next.solvable) return "This seed is unsolvable.";
    if (next.settings.allowUnsolvable) return "Press Start or drop a tile - this seed might be unsolvable.";
    if (next.settings.forceUnique) return "Start or drop a tile to play.";
    return "Start or drop a tile - multiple solutions may exist.";
  };

  const handlePresetChange = (nextPreset: PresetName) => {
    const nextDefaults = presetDefaults[nextPreset];
    const nextPuzzle = generatePuzzle({
      preset: nextPreset,
      seed: undefined,
      overrides: knobsToOverrides(nextDefaults),
    });
    const appliedKnobs = settingsToKnobs(nextPuzzle.settings);
    setPreset(nextPreset);
    setKnobs(appliedKnobs);
    setSeedInput(formatSeedPayload(nextPuzzle.seed, nextPreset, appliedKnobs));
    setCopied(false);
    setPuzzle(nextPuzzle);
    setLadder(null);
    resetProgress();
    setMessage(getPuzzleMessage(nextPuzzle));
    if (isMobile) {
      setMobileStage("play");
      setMobileActionsMinimized(false);
    }
  };

  const resetProgress = () => {
    setSlots([]);
    setStatus("idle");
    setMoves(0);
    setElapsed(0);
    setStartTime(null);
    setDrag({ draggingId: null, selectedId: null });
  };

  const handleGenerate = () => {
    const parsed = parseSeedPayload(seedInput);
    if (parsed.ladderLevels && parsed.ladderLevels > 1) {
      handleGenerateLadder(parsed.ladderLevels, parsed);
      return;
    }
    const { preset: effectivePreset, knobs: mergedKnobs } = resolvePresetAndKnobs(parsed, preset, knobs);
    const next = generatePuzzle({
      preset: effectivePreset,
      seed: parsed.seed || undefined,
      overrides: knobsToOverrides(mergedKnobs),
    });
    const appliedKnobs = settingsToKnobs(next.settings);
    setPreset(effectivePreset);
    setKnobs(appliedKnobs);
    setPuzzle(next);
    setLadder(null);
    resetProgress();
    if (isMobile) {
      setMobileStage("play");
      setMobileActionsMinimized(false);
    }
    setMessage(getPuzzleMessage(next));
    setSeedInput(formatSeedPayload(next.seed, effectivePreset, appliedKnobs));
    setCopied(false);
  };

  const handleGenerateLadder = (levelsInput?: number, parsedOverride?: ReturnType<typeof parseSeedPayload>) => {
    const parsed = parsedOverride ?? parseSeedPayload(seedInput);
    const { preset: effectivePreset, knobs: mergedKnobs } = resolvePresetAndKnobs(parsed, preset, knobs);
    const levels = Math.max(2, Math.min(10, levelsInput ?? ladderLevels));

    const levelKnobs = (level: number): KnobState => {
      const lengthBump = level;
      const maxBump = Math.ceil(level / 2);
      const baseAlphabet =
        mergedKnobs.theme === "binary"
          ? 2
          : mergedKnobs.theme === "wide"
            ? Math.max(5, mergedKnobs.alphabetSize)
            : mergedKnobs.alphabetSize;
      const grownAlphabet =
        mergedKnobs.theme === "binary"
          ? 2
          : mergedKnobs.theme === "wide"
            ? Math.min(6, baseAlphabet + level)
            : Math.min(26, baseAlphabet + level);
      return normalizeKnobs({
        ...mergedKnobs,
        minLength: mergedKnobs.minLength + lengthBump,
        maxLength: mergedKnobs.maxLength + maxBump,
        alphabetSize: grownAlphabet,
      });
    };

    const puzzles: PuzzleInstance[] = [];
    const firstKnobs = levelKnobs(0);
    const firstPuzzle = generatePuzzle({
      preset: effectivePreset,
      seed: parsed.seed || undefined,
      overrides: knobsToOverrides(firstKnobs),
    });
    const baseSeed = firstPuzzle.seed;
    puzzles.push(firstPuzzle);

    for (let i = 1; i < levels; i++) {
      const levelPuzzle = generatePuzzle({
        preset: effectivePreset,
        seed: `${baseSeed}-L${i}`,
        overrides: knobsToOverrides(levelKnobs(i)),
      });
      puzzles.push(levelPuzzle);
    }

    setLadder({ baseSeed, puzzles, index: 0 });
    setPreset(effectivePreset);
    setKnobs(settingsToKnobs(firstPuzzle.settings));
    setPuzzle(firstPuzzle);
    resetProgress();
    if (isMobile) {
      setMobileStage("play");
      setMobileActionsMinimized(false);
    }
    setMessage(
      !firstPuzzle.solvable
        ? `Ladder level 1/${levels} is unsolvable.`
        : firstPuzzle.settings.allowUnsolvable
          ? `Ladder level 1/${levels}. Might be unsolvable.`
          : firstPuzzle.settings.forceUnique
            ? `Ladder level 1/${levels}. Start or drop a tile.`
            : `Ladder level 1/${levels}. Multiple solutions allowed.`,
    );
    setSeedInput(formatSeedPayload(baseSeed, effectivePreset, settingsToKnobs(firstPuzzle.settings), levels));
    setCopied(false);
    setLadderLevels(levels);
  };

  const handleStart = () => {
    if (!puzzle) return;
    setSlots([]);
    setMoves(0);
    setElapsed(0);
    setStartTime(Date.now());
    setStatus("playing");
    setDrag({ draggingId: null, selectedId: null });
    if (!puzzle.solvable) {
      setMessage("Explore the tiles - this seed is unsolvable.");
    } else if (puzzle.settings.allowUnsolvable) {
      setMessage("Arrange the tiles below. Heads up: this seed might be impossible.");
    } else if (!puzzle.settings.forceUnique) {
      setMessage("Arrange the tiles - multiple valid solutions are allowed.");
    } else {
      setMessage("Arrange the tiles below.");
    }
  };

  const evaluateWin = (nextSlots: string[]) => {
    if (!puzzle) return;
    const order = nextSlots.filter(Boolean);
    if (order.length === 0) return;
    const ok = validateSolution(puzzle, order);
    if (ok) {
      setStatus("solved");
      setMessage("Matched!");
      setStartTime(null);
      if (isMobile) {
        setMobileStage("setup");
      }
    }
  };

  const placeTile = (targetIndex: number, mode: "insert" | "replace") => {
    const currentId = drag.draggingId ?? drag.selectedId;
    if (!currentId || !puzzle) return;

    if (status !== "playing") {
      setStatus("playing");
      if (startTime === null) {
        setStartTime(Date.now());
      }
    }

    setSlots((prev) => {
      let next = [...prev];
      if (mode === "insert") {
        next.splice(targetIndex, 0, currentId);
      } else {
        if (targetIndex >= next.length) {
          next.push(currentId);
        } else {
          next[targetIndex] = currentId;
        }
      }
      const limit = puzzle.settings.tileCount;
      if (next.length > limit) {
        next = next.slice(0, limit);
      }
      return next;
    });
    setMoves((m) => m + 1);
    setDrag({ draggingId: null, selectedId: null });
  };

  const onDropInsert = (index: number) => placeTile(index, "insert");
  const onDropReplace = (index: number) => placeTile(index, "replace");

  const handleTileSelect = (tileId: string) => {
    if (!puzzle) return;
    setDrag((prev) => ({ draggingId: null, selectedId: prev.selectedId === tileId ? null : tileId }));
  };

  const handleTileKeyDown = (event: KeyboardEvent<HTMLDivElement>, tileId: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleTileSelect(tileId);
  };

  const handleZoneKey = (event: KeyboardEvent<HTMLDivElement>, index: number, mode: "insert" | "replace") => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    placeTile(index, mode);
  };

  useEffect(() => {
    if (!puzzle) return;
    evaluateWin(slots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const moveToLadderLevel = (targetIndex: number) => {
    if (!ladder) return;
    const clamped = Math.min(Math.max(targetIndex, 0), ladder.puzzles.length - 1);
    const nextPuzzle = ladder.puzzles[clamped];
    setLadder({ ...ladder, index: clamped });
    setPuzzle(nextPuzzle);
    setKnobs(settingsToKnobs(nextPuzzle.settings));
    resetProgress();
    setMessage(
      !nextPuzzle.solvable
        ? `Ladder level ${clamped + 1}/${ladder.puzzles.length} is unsolvable.`
        : nextPuzzle.settings.allowUnsolvable
          ? `Ladder level ${clamped + 1}/${ladder.puzzles.length}. Might be unsolvable.`
          : nextPuzzle.settings.forceUnique
            ? `Ladder level ${clamped + 1}/${ladder.puzzles.length}. Start or drop a tile.`
            : `Ladder level ${clamped + 1}/${ladder.puzzles.length}. Multiple solutions allowed.`,
    );
    setSeedInput(
      formatSeedPayload(ladder.baseSeed, nextPuzzle.preset, settingsToKnobs(ladder.puzzles[0].settings), ladder.puzzles.length),
    );
    setCopied(false);
  };

  const onShowSolution = () => {
    if (!puzzle) return;
    const solution = findSolution(puzzle);
    if (solution) {
      setSlots(solution.slice(0, puzzle.settings.tileCount));
      setStatus("solved");
      setMessage("Solution revealed.");
      if (isMobile) {
        setMobileStage("setup");
      }
    } else {
      setStatus("unsolved");
      setMessage("This instance is unsolvable.");
    }
    setStartTime(null);
    setDrag({ draggingId: null, selectedId: null });
  };

  const onClearSolution = () => {
    if (!puzzle) return;
    setSlots([]);
    setMessage("Solution row cleared.");
    setStatus("playing");
    setDrag({ draggingId: null, selectedId: null });
  };

  const onGiveUp = () => {
    setStartTime(null);
    setStatus("idle");
    setDrag({ draggingId: null, selectedId: null });
    if (isMobile) {
      setMobileStage("setup");
      setMobileActionsMinimized(false);
    }
    setMessage("Gave up. Adjust settings or regenerate to try again.");
  };

  const onShareSeed = async () => {
    if (!puzzle) return;
    const payload = formatSeedPayload(
      ladder ? ladder.baseSeed : puzzle.seed,
      puzzle.preset,
      ladder ? settingsToKnobs(ladder.puzzles[0].settings) : settingsToKnobs(puzzle.settings),
      ladder?.puzzles.length,
    );
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(payload);
      setMessage("Seed + settings copied to clipboard.");
      setCopied(true);
    } else {
      setMessage(payload);
    }
  };

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  const onResetStats = () => {
    setMoves(0);
    setElapsed(0);
    setStartTime(null);
    setStatus("idle");
    setDrag({ draggingId: null, selectedId: null });
    if (puzzle) {
      setSlots([]);
      setMessage("Stats reset. Ready when you are.");
    } else {
      setMessage("Stats reset. Generate a puzzle to start.");
    }
  };

  const toggleHud = () => setHudCollapsed((prev) => !prev);

  const slotCount = puzzle ? Math.max(slots.length || 1, puzzle.settings.tileCount) : Math.max(1, slots.length || 1);
  const slotVars: CSSProperties = {
    ["--slot-count" as string]: slotCount,
  };
  const activeTileCount = puzzle ? puzzle.settings.tileCount : knobs.tileCount;
  const activeLengths = puzzle
    ? `${puzzle.settings.minLength}-${puzzle.settings.maxLength}`
    : `${knobs.minLength}-${knobs.maxLength}`;
  const activeAlphabet = puzzle ? puzzle.settings.alphabet.length : knobs.alphabetSize;
  const ladderLabel = ladder ? `${ladder.index + 1}/${ladder.puzzles.length}` : "Single";
  const hasActiveTile = Boolean(drag.draggingId || drag.selectedId);
  const selectedTile = puzzle?.tiles.find((tile) => tile.id === drag.selectedId);
  const compactCards = isMobile && activeTileCount >= 7;
  const slotsFilled = slots.filter(Boolean).length;
  const solutionCapacity = puzzle ? puzzle.settings.tileCount : knobs.tileCount;
  const showShell = !isMobile || mobileStage === "setup";
  const showBoard = puzzle && (!isMobile || mobileStage === "play");

  return (
    <div className="app">
      {showShell && (
        <>
          <header className="site-header">
            <h1>
              <span className="holo">PCP</span> Pattern Pursuit
            </h1>
            <p className="subtitle">
              Drag domino-like tiles into order until the machine agrees: top string equals bottom string.
            </p>
          </header>

          {showBrief ? (
            <section className="rules">
              <div className="rules__header">
                <h3>Game Rules</h3>
                <button className="ghost" onClick={() => setShowBrief(false)}>
                  Hide
                </button>
              </div>
              <ul>
                <li>Reuse tiles as needed to fill all the solution slots; slots can hold duplicates.</li>
                <li>You win when the full top string equals the full bottom string.</li>
                <li>The game ends automatically when you land on a matching stack; press Show to reveal if you get stuck.</li>
              </ul>
            </section>
          ) : (
            <section className="rules rules--placeholder">
              <div className="rules__placeholder">
                <span>Mission Brief</span>
                <button className="ghost" onClick={() => setShowBrief(true)}>
                  Show
                </button>
              </div>
            </section>
          )}

          <section className={`status-hud ${isMobile && hudCollapsed ? "status-hud--compact" : ""}`}>
            <div className="hud-grid">
              <div className="hud-card">
                <span>Mode</span>
                <strong>{presetLabels[preset]}</strong>
              </div>
              <div className="hud-card">
                <span>Tiles</span>
                <strong>{activeTileCount}</strong>
              </div>
              <div className="hud-card">
                <span>Lengths</span>
                <strong>{activeLengths}</strong>
              </div>
              <div className="hud-card">
                <span>Alphabet</span>
                <strong>{activeAlphabet}</strong>
              </div>
              <div className="hud-card">
                <span>Ladder</span>
                <strong>{ladderLabel}</strong>
              </div>
              <div className="hud-card">
                <span>Time</span>
                <strong>{formatTime(elapsed)}</strong>
              </div>
              <div className="hud-card">
                <span>Moves</span>
                <strong>{moves}</strong>
              </div>
            </div>
            <div className="hud-actions">
              {isMobile && (
                <button className="ghost" onClick={toggleHud}>
                  {hudCollapsed ? "Show stats" : "Hide stats"}
                </button>
              )}
              <button className="ghost desktop-only" onClick={handleGenerate}>
                Regenerate
              </button>
              <button className="primary desktop-only" onClick={handleStart} disabled={!puzzle}>
                Start
              </button>
              <button className="ghost desktop-only" onClick={onResetStats}>
                Reset
              </button>
            </div>
          </section>
        </>
      )}

      {showShell && (
        <section className="setup-row">
          {isMobile ? (
            <div className="mobile-setup">
              <div className="mobile-setup__header">
                <h3>Preset</h3>
                <span className="field__hint">Custom controls available on desktop.</span>
              </div>
              <label className="field">
                <span>Mode</span>
                <select
                  value={preset}
                  onChange={(e) => handlePresetChange(e.target.value as PresetName)}
                >
                  {Object.entries(presetLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="field__hint">Tiles will use these defaults. Adjust knobs on larger screens.</p>
            </div>
          ) : showPanel ? (
            <div className="setup-panel">
              <div className="setup-header">
                <h2>Control Deck</h2>
                <button className="ghost" onClick={() => setShowPanel(false)}>
                  Hide
                </button>
              </div>
              <div className="setup-columns">
                <div className="panel-section setup-col setup-col--divider">
                  <h3>Setup</h3>
                <label className="field">
                  <span>Preset</span>
                  <select
                    value={preset}
                    onChange={(e) => handlePresetChange(e.target.value as PresetName)}
                  >
                      {Object.entries(presetLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field seed-field">
                    <span>Seed</span>
                    <div className="seed-input-row">
                      <input
                        value={seedInput}
                        onChange={(e) => {
                          setSeedInput(e.target.value);
                          setCopied(false);
                        }}
                        placeholder="seed or share code (blank = random)"
                      />
                      <button
                        className={`seed-copy ${copied ? "copied" : ""}`}
                        onClick={onShareSeed}
                        disabled={!puzzle}
                      >
                        <span className="copy-icon"></span>
                        <span>{copied ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </label>
                    <button onClick={handleGenerate} className="primary">
                      Generate Tiles
                    </button>
                  </div>

                  <div className="panel-section setup-col setup-col--divider">
                    <h3>Generator knobs</h3>
                    <div className="knob-grid">
                      <label className="field">
                        <span>Tile count</span>
                        <input
                          type="number"
                          min={2}
                          max={16}
                          value={knobs.tileCount}
                          onChange={(e) =>
                            setKnobs((prev) =>
                              normalizeKnobs({
                                ...prev,
                                tileCount: Number(e.target.value) || prev.tileCount,
                              }),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Alphabet size</span>
                        <input
                          type="number"
                          min={1}
                          max={26}
                          value={knobs.alphabetSize}
                          onChange={(e) =>
                            setKnobs((prev) =>
                              normalizeKnobs({
                                ...prev,
                                alphabetSize: Number(e.target.value) || prev.alphabetSize,
                              }),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Alphabet theme</span>
                        <select
                          value={knobs.theme}
                          onChange={(e) =>
                            setKnobs((prev) =>
                              normalizeKnobs({
                                ...prev,
                                theme: e.target.value as AlphabetTheme,
                              }),
                            )
                          }
                        >
                          <option value="preset">Preset/custom</option>
                          <option value="binary">Binary only (0/1)</option>
                          <option value="wide">Wide letters (5-6)</option>
                        </select>
                        <span className="field__hint">Switch feel without changing rules.</span>
                      </label>
                      <label className="field">
                        <span>Min length</span>
                        <input
                          type="number"
                          min={1}
                          max={48}
                          value={knobs.minLength}
                          onChange={(e) =>
                            setKnobs((prev) =>
                              normalizeKnobs({
                                ...prev,
                                minLength: Number(e.target.value) || prev.minLength,
                              }),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Max length</span>
                        <input
                          type="number"
                          min={knobs.minLength}
                          max={64}
                          value={knobs.maxLength}
                          onChange={(e) =>
                            setKnobs((prev) =>
                              normalizeKnobs({
                                ...prev,
                                maxLength: Number(e.target.value) || prev.maxLength,
                              }),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="toggle-grid">
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={knobs.allowUnsolvable}
                          onChange={(e) => setKnobs((prev) => ({ ...prev, allowUnsolvable: e.target.checked }))}
                        />
                        <div className="checkbox-field__copy">
                          <strong>Allow unsolvable seeds</strong>
                          <span className="field__hint">About a 40% chance when enabled.</span>
                        </div>
                      </label>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={!knobs.forceUnique}
                          onChange={(e) => setKnobs((prev) => ({ ...prev, forceUnique: !e.target.checked }))}
                        />
                        <div className="checkbox-field__copy">
                          <strong>Allow multiple solutions</strong>
                          <span className="field__hint">Enabled by default on Tricky.</span>
                        </div>
                      </label>
                    </div>
                    <div className="ladder-row">
                      <label className="field">
                        <span>Ladder levels</span>
                        <input
                          type="number"
                          min={2}
                          max={10}
                          value={ladderLevels}
                          onChange={(e) => setLadderLevels(Math.max(2, Math.min(10, Number(e.target.value) || ladderLevels)))}
                        />
                        <span className="field__hint">Builds a seed lineage that bumps lengths/alphabet each step.</span>
                      </label>
                      <button className="ghost ladder-button" onClick={() => handleGenerateLadder()}>
                        Generate ladder
                      </button>
                    </div>
                    <p className="field__hint">Knob choices are embedded in the seed/share text.</p>
                  </div>

                  <div className="panel-section setup-col">
                    <h3>Statistics</h3>
                    <div className="stat-row">
                      <span>Mode</span>
                      <strong>{presetLabels[preset]}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Tiles</span>
                      <strong>{puzzle ? puzzle.settings.tileCount : knobs.tileCount}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Lengths</span>
                      <strong>
                        {puzzle
                          ? `${puzzle.settings.minLength}-${puzzle.settings.maxLength}`
                          : `${knobs.minLength}-${knobs.maxLength}`}
                      </strong>
                    </div>
                    <div className="stat-row">
                      <span>Alphabet</span>
                      <strong>{puzzle ? puzzle.settings.alphabet.length : knobs.alphabetSize}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Solutions</span>
                      <strong>
                        {puzzle
                          ? puzzle.settings.forceUnique
                            ? "Unique"
                            : "Multiple"
                          : knobs.forceUnique
                            ? "Unique"
                            : "Multiple"}
                      </strong>
                    </div>
                    <div className="stat-row">
                      <span>Alphabet theme</span>
                      <strong>{puzzle ? puzzle.settings.theme ?? "preset" : knobs.theme}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Ladder</span>
                      <strong>{ladder ? `${ladder.index + 1}/${ladder.puzzles.length}` : "Single"}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Time</span>
                      <strong>{formatTime(elapsed)}</strong>
                    </div>
                  <div className="stat-row">
                    <span>Moves</span>
                    <strong>{moves}</strong>
                  </div>
                  <button className="ghost" onClick={onResetStats}>
                    Reset
                  </button>
                  <button className="start-button" onClick={handleStart} disabled={!puzzle}>
                    Start Game
                  </button>
                  {ladder && (
                    <div className="ladder-nav">
                      <button onClick={() => moveToLadderLevel(ladder.index - 1)} disabled={ladder.index === 0}>
                        Prev level
                      </button>
                      <button
                        onClick={() => moveToLadderLevel(ladder.index + 1)}
                        disabled={ladder.index >= ladder.puzzles.length - 1}
                      >
                        Next level
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="setup-placeholder">
              <span>Control Deck hidden</span>
              <button className="ghost" onClick={() => setShowPanel(true)}>
                Show
              </button>
            </div>
          )}
        </section>
      )}


      {showBoard && (
        <main className="main">
          {isMobile && mobileStage === "play" && mobileActionsMinimized && (
            <button className="mobile-action-badge" onClick={() => setMobileActionsMinimized(false)}>
              Show actions
            </button>
          )}
          <section className="board" ref={boardRef}>
            <div className="tray">
              <div className="tray__header">
                <h3>Available Tiles</h3>
              </div>
              <div className="tray__cards">
                {puzzle.tiles.map((tile) => {
                  const isActive = drag.draggingId === tile.id || drag.selectedId === tile.id;
                  return (
                    <div
                      key={tile.id}
                      className={`tile-card ${isActive ? "tile-card--active" : ""} ${compactCards ? "tile-card--compact" : ""}`}
                      draggable={Boolean(puzzle)}
                      onDragStart={() => setDrag({ draggingId: tile.id, selectedId: tile.id })}
                      onDragEnd={() => setDrag({ draggingId: null, selectedId: null })}
                      onClick={() => handleTileSelect(tile.id)}
                      onKeyDown={(event) => handleTileKeyDown(event, tile.id)}
                      role="button"
                      tabIndex={0}
                      aria-pressed={drag.selectedId === tile.id}
                    >
                      <div className="tile-card__half tile-card__half--top">{tile.top}</div>
                      <div className="tile-card__divider" />
                      <div className="tile-card__half tile-card__half--bottom">{tile.bottom}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`solution ${hasActiveTile ? "solution--selecting" : ""}`}>
                <div className="solution__header">
                  <h3>Solution</h3>
                  <p className="hint">Drag or tap tiles to place; tap between tiles to insert or reorder.</p>
                  <div className="message-inline">
                    {status === "solved" ? (
                      <div className="victory-banner">
                        <div className="victory-banner__content">
                          <span className="victory-banner__emoji">*</span>
                          <strong>Perfect Match!</strong>
                        </div>
                      </div>
                    ) : (
                      <>
                        {ladder && (
                          <span className="badge neon">
                            Ladder {ladder.index + 1}/{ladder.puzzles.length}
                          </span>
                        )}
                        {!puzzle?.solvable && <span className="badge warn big">Unsolvable seed</span>}
                        {puzzle?.settings.allowUnsolvable && puzzle.solvable && (
                          <span className="badge warn">Unsolvable possible</span>
                        )}
                        {!puzzle?.settings.forceUnique && <span className="badge neon">Multiple answers</span>}
                        {status === "unsolved" && <span className="badge warn big">Unsolvable</span>}
                        {selectedTile && (
                          <span className="badge neon selection-badge">
                            Selected: {selectedTile.top}/{selectedTile.bottom}
                          </span>
                        )}
                        {message && <strong>{message}</strong>}
                      </>
                    )}
                  </div>
                  {isMobile && (
                    <div className="solution__summary">
                      <span className="badge neon">Slots {slotsFilled}/{solutionCapacity}</span>
                      {selectedTile && (
                        <span className="badge neon selection-badge selection-badge--compact">
                          {selectedTile.top}/{selectedTile.bottom}
                        </span>
                      )}
                    </div>
                  )}
              </div>
              <div className="solution__slots" style={slotVars}>
                {slots.length === 0 && (
                  <div
                    className={`solution__dropzone solution__dropzone--solo ${hasActiveTile ? "solution__dropzone--active" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDropInsert(0);
                    }}
                    onClick={() => onDropInsert(0)}
                    onKeyDown={(event) => handleZoneKey(event, 0, "insert")}
                    role="button"
                    tabIndex={0}
                    aria-label="Place the first tile"
                  >
                    <span className="sr-only">Place the first tile</span>
                  </div>
                )}
                {slots.map((id, idx) => {
                  const tile = puzzle.tiles.find((t) => t.id === id);
                  return (
                    <Fragment key={`${id}-${idx}`}>
                      <div
                        className={`solution__dropzone ${hasActiveTile ? "solution__dropzone--active" : ""}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          onDropInsert(idx);
                        }}
                        onClick={() => onDropInsert(idx)}
                        onKeyDown={(event) => handleZoneKey(event, idx, "insert")}
                        role="button"
                        tabIndex={0}
                        aria-label={`Insert before slot ${idx + 1}`}
                      >
                        <span className="sr-only">Insert before slot {idx + 1}</span>
                      </div>

                      <div
                        className={`solution__slot ${hasActiveTile ? "solution__slot--ready" : ""}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          onDropReplace(idx);
                        }}
                        onClick={() => onDropReplace(idx)}
                        onKeyDown={(event) => handleZoneKey(event, idx, "replace")}
                        role="button"
                        tabIndex={0}
                        aria-label={`Place in slot ${idx + 1}`}
                      >
                        <div className="slot__label">Slot {idx + 1}</div>
                        {tile ? (
                          <div className={`tile-card tile-card--small ${compactCards ? "tile-card--compact" : ""}`}>
                            <div className="tile-card__half tile-card__half--top">{tile.top}</div>
                            <div className="tile-card__divider" />
                            <div className="tile-card__half tile-card__half--bottom">{tile.bottom}</div>
                          </div>
                        ) : (
                          <div className="slot__empty">Drop here</div>
                        )}
                      </div>

                      {idx === slots.length - 1 && (
                        <div
                          className={`solution__dropzone ${hasActiveTile ? "solution__dropzone--active" : ""}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            onDropInsert(idx + 1);
                          }}
                          onClick={() => onDropInsert(idx + 1)}
                          onKeyDown={(event) => handleZoneKey(event, idx + 1, "insert")}
                          role="button"
                          tabIndex={0}
                          aria-label={`Insert after slot ${idx + 1}`}
                        >
                          <span className="sr-only">Insert after slot {idx + 1}</span>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>

              <div className="solution__actions">
                <button onClick={onClearSolution} disabled={!puzzle}>
                  Clear solution row
                </button>
                <button onClick={onShowSolution} disabled={!puzzle}>
                  Show solution
                </button>
              </div>
            </div>
          </section>
        </main>
      )}

      {isMobile && mobileStage === "play" && !mobileActionsMinimized && (
        <div className={`mobile-action-bar ${mobileActionsHidden ? "mobile-action-bar--hidden" : ""}`} role="region" aria-label="Puzzle actions">
          <button className="primary" onClick={handleStart} disabled={!puzzle}>
            Start
          </button>
          <button className="ghost" onClick={handleGenerate}>
            Regenerate
          </button>
          <button className="ghost" onClick={onClearSolution} disabled={!puzzle}>
            Clear row
          </button>
          <button className="ghost" onClick={onShowSolution} disabled={!puzzle}>
            Show
          </button>
          <button className="ghost warn" onClick={onGiveUp}>
            Give up
          </button>
          <button className="ghost" onClick={() => setMobileActionsMinimized(true)}>
            Hide
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

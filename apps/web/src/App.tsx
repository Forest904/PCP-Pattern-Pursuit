import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { type PresetName, type PuzzleInstance, generatePuzzle, validateSolution, findSolution } from "@pcp/pattern-engine";
import "./App.css";

type Status = "idle" | "playing" | "solved" | "unsolved";

type DragState = {
  draggingId: string | null;
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
};

function App() {
  const [preset, setPreset] = useState<PresetName>("easy");
  const [seedInput, setSeedInput] = useState("");
  const [puzzle, setPuzzle] = useState<PuzzleInstance | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [moves, setMoves] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [drag, setDrag] = useState<DragState>({ draggingId: null });
  const [message, setMessage] = useState<string>("Generate a puzzle to begin.");
  const [showPanel, setShowPanel] = useState(true);
  const [showBrief, setShowBrief] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status !== "playing" || startTime === null) return;
    const id = setInterval(() => setElapsed(Date.now() - startTime), 250);
    return () => clearInterval(id);
  }, [status, startTime]);

  const handleGenerate = () => {
    const next = generatePuzzle({ preset, seed: seedInput || undefined });
    setPuzzle(next);
    setSlots([]);
    setStatus("idle");
    setMoves(0);
    setElapsed(0);
    setStartTime(null);
    setMessage("Press Start to play.");
    setSeedInput(next.seed);
    setCopied(false);
  };

  const handleStart = () => {
    if (!puzzle) return;
    setSlots([]);
    setMoves(0);
    setElapsed(0);
    setStartTime(Date.now());
    setStatus("playing");
    setMessage("Arrange the tiles below.");
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
    }
  };

  const placeTile = (targetIndex: number, mode: "insert" | "replace") => {
    const currentId = drag.draggingId;
    if (!currentId || !puzzle || status !== "playing") return;

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
    setDrag({ draggingId: null });
    setStatus("playing");
  };

  const onDropInsert = (index: number) => placeTile(index, "insert");
  const onDropReplace = (index: number) => placeTile(index, "replace");

  useEffect(() => {
    if (!puzzle) return;
    evaluateWin(slots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const onShowSolution = () => {
    if (!puzzle) return;
    const solution = findSolution(puzzle);
    if (solution) {
      setSlots(solution.slice(0, puzzle.settings.tileCount));
      setStatus("solved");
      setMessage("Solution revealed.");
    } else {
      setStatus("unsolved");
      setMessage("This instance is unsolvable.");
    }
    setStartTime(null);
  };

  const onClearSolution = () => {
    if (!puzzle) return;
    setSlots([]);
    setMessage("Solution row cleared.");
    setStatus("playing");
  };

  const onShareSeed = async () => {
    if (!puzzle) return;
    const payload = `${puzzle.seed}:${puzzle.preset}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(payload);
      setMessage("Seed copied to clipboard.");
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
    if (puzzle) {
      setSlots([]);
      setMessage("Stats reset. Ready when you are.");
    } else {
      setMessage("Stats reset. Generate a puzzle to start.");
    }
  };

  const slotVars: CSSProperties = {
    ["--slot-count" as string]: Math.max(1, slots.length || 1),
  };

  return (
    <div className="app">
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

      <section className="setup-row">
        {showPanel ? (
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
                    onChange={(e) => {
                      const nextPreset = e.target.value as PresetName;
                      setPreset(nextPreset);
                      setSeedInput("");
                      setCopied(false);
                      setPuzzle(null);
                      setSlots([]);
                      setStatus("idle");
                      setMessage("Generate a puzzle to begin.");
                    }}
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
                      placeholder="blank = random"
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
                <h3>Statistics</h3>
                <div className="stat-row">
                  <span>Mode</span>
                  <strong>{presetLabels[preset]}</strong>
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

      {puzzle && (
        <main className="main">
          <section className="board">
            <div className="tray">
              <div className="tray__header">
                <h3>Available Tiles</h3>
              </div>
              <div className="tray__cards">
                {puzzle.tiles.map((tile) => (
                  <div
                    key={tile.id}
                    className="tile-card"
                    draggable={status === "playing"}
                    onDragStart={() => setDrag({ draggingId: tile.id })}
                    onDragEnd={() => setDrag({ draggingId: null })}
                  >
                    <div className="tile-card__half tile-card__half--top">{tile.top}</div>
                    <div className="tile-card__divider" />
                    <div className="tile-card__half tile-card__half--bottom">{tile.bottom}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="solution">
              <div className="solution__header">
                <h3>Solution</h3>
                <p className="hint">Drop tiles here; drag between tiles to insert and reorder.</p>
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
                      {status === "unsolved" && <span className="badge warn big">Unsolvable</span>}
                      {message && <strong>{message}</strong>}
                    </>
                  )}
                </div>
              </div>
              <div className="solution__slots" style={slotVars}>
                {slots.length === 0 && (
                  <div
                    className="solution__dropzone solution__dropzone--solo"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDropInsert(0)}
                  >
                    <span className="sr-only">Place the first tile</span>
                  </div>
                )}
                {slots.map((id, idx) => {
                  const tile = puzzle.tiles.find((t) => t.id === id);
                  return (
                    <Fragment key={`${id}-${idx}`}>
                      <div
                        className="solution__dropzone"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDropInsert(idx)}
                      >
                        <span className="sr-only">Insert before slot {idx + 1}</span>
                      </div>

                      <div
                        className="solution__slot"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDropReplace(idx)}
                      >
                        <div className="slot__label">Slot {idx + 1}</div>
                        {tile ? (
                          <div className="tile-card tile-card--small">
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
                          className="solution__dropzone"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onDropInsert(idx + 1)}
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
    </div>
  );
}

export default App;

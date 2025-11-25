import { useEffect, useMemo, useState } from "react";
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
  extreme: "Extreme",
};

function App() {
  const [preset, setPreset] = useState<PresetName>("easy");
  const [seedInput, setSeedInput] = useState("");
  const [puzzle, setPuzzle] = useState<PuzzleInstance | null>(null);
  const [slots, setSlots] = useState<string[]>([]); // solution row slots (ids or "")
  const [status, setStatus] = useState<Status>("idle");
  const [moves, setMoves] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [drag, setDrag] = useState<DragState>({ draggingId: null });
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (status !== "playing" || startTime === null) return;
    const id = setInterval(() => setElapsed(Date.now() - startTime), 250);
    return () => clearInterval(id);
  }, [status, startTime]);

  const activeOrder = useMemo(() => slots.filter(Boolean), [slots]);

  const resetSlots = (count: number) => Array.from({ length: count }, () => "");

  const handleGenerate = () => {
    const next = generatePuzzle({ preset, seed: seedInput || undefined });
    setPuzzle(next);
    setSlots(resetSlots(next.settings.tileCount));
    setStatus("playing");
    setMoves(0);
    setElapsed(0);
    setStartTime(Date.now());
    setMessage("Arrange the tiles below.");
    setSeedInput(next.seed);
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

  const onDropSlot = (slotIndex: number) => {
    const currentId = drag.draggingId;
    if (!currentId || !puzzle || status === "solved") return;
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = currentId;
      return next;
    });
    setMoves((m) => m + 1);
    setDrag({ draggingId: null });
    setStatus("playing");
  };

  useEffect(() => {
    if (!puzzle) return;
    evaluateWin(slots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const onValidate = () => {
    if (!puzzle) return;
    const ok = validateSolution(puzzle, activeOrder);
    setStatus(ok ? "solved" : "playing");
    setMessage(ok ? "Matched!" : "Not matched yet.");
    if (ok) setStartTime(null);
  };

  const onShowSolution = () => {
    if (!puzzle) return;
    const solution = findSolution(puzzle);
    if (solution) {
      const filled = resetSlots(puzzle.settings.tileCount).map((_, idx) => solution[idx] || "");
      setSlots(filled);
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
    setSlots(resetSlots(puzzle.settings.tileCount));
    setMoves((m) => (m > 0 ? m + 1 : 0));
    setMessage("Solution row cleared.");
    setStatus("playing");
    setStartTime(Date.now());
  };

  const onShareSeed = async () => {
    if (!puzzle) return;
    const payload = `${puzzle.seed}:${puzzle.preset}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(payload);
      setMessage("Seed copied to clipboard.");
    } else {
      setMessage(payload);
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>PCP Pattern Pursuit</h1>
          <p className="subtitle">Drag domino-like tiles so top and bottom strings match.</p>
        </div>
        <div className="header__controls">
          <label className="field">
            <span>Preset</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value as PresetName)}>
              {Object.entries(presetLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Seed</span>
            <input
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              placeholder="blank = random"
            />
          </label>
          <button onClick={handleGenerate} className="primary">
            Generate
          </button>
        </div>
      </header>

      <section className="status-bar">
        <div>
          <strong>Time:</strong> {formatTime(elapsed)}
        </div>
        <div>
          <strong>Moves:</strong> {moves}
        </div>
        <div>
          <strong>Mode:</strong> {presetLabels[preset]}
        </div>
        <div>
          <strong>Seed:</strong> {puzzle?.seed ?? "-"}
        </div>
        <div className="status-bar__actions">
          <button onClick={onClearSolution} disabled={!puzzle}>
            Clear solution row
          </button>
          <button onClick={onValidate} disabled={!puzzle}>
            Validate
          </button>
          <button onClick={onShowSolution} disabled={!puzzle}>
            Show solution
          </button>
          <button onClick={onShareSeed} disabled={!puzzle}>
            Share seed
          </button>
        </div>
      </section>

      <section className="board">
        <div className="tray">
          <div className="tray__header">
            <h3>Available tiles</h3>
            {!puzzle && <p className="hint">Generate a puzzle to begin.</p>}
          </div>
          <div className="tray__cards">
            {puzzle?.tiles.map((tile) => (
              <div
                key={tile.id}
                className="tile-card"
                draggable
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
            <h3>Solution row</h3>
            <p className="hint">Drag tiles here; slots can be overwritten.</p>
          </div>
          <div className="solution__slots">
            {slots.map((id, idx) => {
              const tile = puzzle?.tiles.find((t) => t.id === id);
              return (
                <div
                  key={idx}
                  className="solution__slot"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropSlot(idx)}
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
              );
            })}
          </div>
        </div>
      </section>

      <section className="message">
        {status === "solved" && <span className="badge success">Solved</span>}
        {status === "unsolved" && <span className="badge warn">Unsolvable</span>}
        {message && <span>{message}</span>}
      </section>
    </div>
  );
}

export default App;

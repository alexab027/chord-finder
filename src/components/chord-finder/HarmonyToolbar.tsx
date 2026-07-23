import type { ReactNode } from "react";
import type { DurationName, GenerationMode } from "../../music/types";
import MusicSymbol, { type MusicSymbolName } from "./MusicSymbol";

type AccidentalName = "#" | "b" | "n";

type DurationOption = {
  duration: DurationName;
  symbol: MusicSymbolName;
  title: string;
};

const NOTE_DURATION_OPTIONS: DurationOption[] = [
  { duration: "w", symbol: "whole-note", title: "Whole note" },
  { duration: "h", symbol: "half-note", title: "Half note" },
  { duration: "q", symbol: "quarter-note", title: "Quarter note" },
  { duration: "8", symbol: "eighth-note", title: "Eighth note" },
];

const REST_DURATION_OPTIONS: DurationOption[] = [
  { duration: "w", symbol: "whole-rest", title: "Whole rest" },
  { duration: "h", symbol: "half-rest", title: "Half rest" },
  { duration: "q", symbol: "quarter-rest", title: "Quarter rest" },
  { duration: "8", symbol: "eighth-rest", title: "Eighth rest" },
];

const ACCIDENTALS: Array<{
  accidental: AccidentalName;
  symbol: MusicSymbolName;
  title: string;
}> = [
  { accidental: "#", symbol: "sharp", title: "Sharp" },
  { accidental: "b", symbol: "flat", title: "Flat" },
  { accidental: "n", symbol: "natural", title: "Natural" },
];

type HarmonyToolbarProps = {
  selectedDuration: DurationName;
  selectedKind: "note" | "rest";
  selectedAccidental: AccidentalName | null;
  keySignature: string;
  generationMode: GenerationMode;
  bpm: number;
  hasNotes: boolean;
  hasChords: boolean;
  onSelectNote: (duration: DurationName) => void;
  onSelectRest: (duration: DurationName) => void;
  onAccidentalClick: (accidental: AccidentalName) => void;
  onKeySignatureChange: (keySignature: string) => void;
  onGenerationModeChange: (generationMode: GenerationMode) => void;
  onBpmChange: (bpm: number) => void;
  onDeleteLast: () => void;
  onClearMelody: () => void;
  onPlay: () => void | Promise<void>;
  onClearChords: () => void;
};

const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2";
const iconButtonClass = `flex h-10 w-10 items-center justify-center border-r border-[var(--border)] last:border-r-0 ${focusClass}`;
const inputClass = `h-10 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] ${focusClass}`;
const secondaryButtonClass = `h-10 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface-subtle)] ${focusClass}`;

function selectionClass(isSelected: boolean) {
  return isSelected
    ? "bg-[var(--accent)] text-white"
    : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-subtle)]";
}

function ToolGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

export default function HarmonyToolbar({
  selectedDuration,
  selectedKind,
  selectedAccidental,
  keySignature,
  generationMode,
  bpm,
  hasNotes,
  hasChords,
  onSelectNote,
  onSelectRest,
  onAccidentalClick,
  onKeySignatureChange,
  onGenerationModeChange,
  onBpmChange,
  onDeleteLast,
  onClearMelody,
  onPlay,
  onClearChords,
}: HarmonyToolbarProps) {
  return (
    <div className="border-y border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
        <ToolGroup title="Notes and rests">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                Notes
              </div>
              <div className="inline-flex overflow-hidden rounded-md border border-[var(--border-strong)]">
                {NOTE_DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.duration}
                    className={`${iconButtonClass} ${selectionClass(
                      selectedKind === "note" &&
                        selectedDuration === option.duration,
                    )}`}
                    onClick={() => onSelectNote(option.duration)}
                    title={option.title}
                    type="button"
                  >
                    <MusicSymbol name={option.symbol} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                Rests
              </div>
              <div className="inline-flex overflow-hidden rounded-md border border-[var(--border-strong)]">
                {REST_DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.duration}
                    className={`${iconButtonClass} ${selectionClass(
                      selectedKind === "rest" &&
                        selectedDuration === option.duration,
                    )}`}
                    onClick={() => onSelectRest(option.duration)}
                    title={option.title}
                    type="button"
                  >
                    <MusicSymbol name={option.symbol} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className={`${secondaryButtonClass} ${
                  hasNotes ? "" : "cursor-not-allowed text-[var(--text-muted)]"
                }`}
                onClick={onDeleteLast}
                type="button"
              >
                Delete Last
              </button>
              <button
                className={`${secondaryButtonClass} ${
                  hasNotes ? "" : "cursor-not-allowed text-[var(--text-muted)]"
                }`}
                onClick={onClearMelody}
                type="button"
              >
                Clear Melody
              </button>
            </div>
          </div>
        </ToolGroup>

        <ToolGroup title="Accidentals">
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--border-strong)]">
            {ACCIDENTALS.map((option) => (
              <button
                key={option.accidental}
                className={`${iconButtonClass} ${selectionClass(
                  selectedAccidental === option.accidental,
                )}`}
                onClick={() => onAccidentalClick(option.accidental)}
                title={option.title}
                type="button"
              >
                <MusicSymbol name={option.symbol} />
              </button>
            ))}
          </div>
        </ToolGroup>

        <ToolGroup title="Key and mode">
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              Key signature
              <select
                className={`${inputClass} min-w-28`}
                onChange={(event) => onKeySignatureChange(event.target.value)}
                value={keySignature}
              >
                <option value="C">C</option>
                <option value="G">G / Em</option>
                <option value="D">D / Bm</option>
                <option value="A">A / F#m</option>
                <option value="E">E / C#m</option>
                <option value="B">B / G#m</option>
                <option value="F">F / Dm</option>
                <option value="Bb">Bb / Gm</option>
                <option value="Eb">Eb / Cm</option>
                <option value="Ab">Ab / Fm</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              Mode
              <select
                className={`${inputClass} min-w-28`}
                onChange={(event) =>
                  onGenerationModeChange(event.target.value as GenerationMode)
                }
                value={generationMode}
              >
                <option value="automatic">Automatic</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
            </label>
          </div>
        </ToolGroup>

        <ToolGroup title="Tempo and playback">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              BPM
              <input
                className={`${inputClass} w-20`}
                max="240"
                min="40"
                onChange={(event) => {
                  const nextBpm = Number(event.target.value);
                  if (!Number.isNaN(nextBpm)) onBpmChange(nextBpm);
                }}
                type="number"
                value={bpm}
              />
            </label>
            <button
              className={`h-10 rounded-md border border-[var(--accent-border)] bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] ${focusClass}`}
              onClick={onPlay}
              type="button"
            >
              Play
            </button>
            <button
              className={`h-10 rounded-md border px-3 text-sm font-medium ${focusClass} ${
                hasChords
                  ? "border-[var(--danger)] bg-[var(--surface)] text-[var(--danger)] hover:bg-red-50"
                  : "cursor-not-allowed border-[var(--border)] bg-[#ecece8] text-[var(--text-muted)]"
              }`}
              disabled={!hasChords}
              onClick={onClearChords}
              type="button"
            >
              Clear Chords
            </button>
          </div>
        </ToolGroup>
      </div>
    </div>
  );
}

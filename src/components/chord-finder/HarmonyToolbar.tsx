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
  hasNotes: boolean;
  onSelectNote: (duration: DurationName) => void;
  onSelectRest: (duration: DurationName) => void;
  onAccidentalClick: (accidental: AccidentalName) => void;
  onKeySignatureChange: (keySignature: string) => void;
  onGenerationModeChange: (generationMode: GenerationMode) => void;
  onDeleteLast: () => void;
  onClearMelody: () => void;
};

const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2";
const iconButtonClass = `flex h-10 w-10 items-center justify-center border-r border-[var(--border)] last:border-r-0 ${focusClass}`;
const inputClass = `h-10 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] ${focusClass}`;
const secondaryButtonClass = `h-10 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-normal text-[var(--text)] hover:bg-[var(--surface-subtle)] ${focusClass}`;

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
  hasNotes,
  onSelectNote,
  onSelectRest,
  onAccidentalClick,
  onKeySignatureChange,
  onGenerationModeChange,
  onDeleteLast,
  onClearMelody,
}: HarmonyToolbarProps) {
  return (
    <div className="border-y border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-4">
      <div className="flex flex-wrap items-end gap-x-7 gap-y-5">
        <label className="grid gap-2 text-xs font-semibold tracking-wide text-[var(--text-muted)]">
          Key signature
          <select
            className={`${inputClass} min-w-28 font-normal tracking-normal`}
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

        <label className="grid gap-2 text-xs font-semibold tracking-wide text-[var(--text-muted)]">
          Mode
          <select
            className={`${inputClass} min-w-28 font-normal tracking-normal`}
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

        <ToolGroup title="Notes">
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

        <ToolGroup title="Rests">
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
        </ToolGroup>

        <ToolGroup title="Melody">
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
        </ToolGroup>
      </div>
    </div>
  );
}

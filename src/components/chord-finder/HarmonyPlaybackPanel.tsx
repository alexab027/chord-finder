import { PLAYBACK_PANEL_WIDTH } from "./staffGeometry";

type HarmonyPlaybackPanelProps = {
  bpm: number;
  hasChords: boolean;
  onBpmChange: (bpm: number) => void;
  onPlay: () => void | Promise<void>;
  onClearChords: () => void;
};

const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2";

export default function HarmonyPlaybackPanel({
  bpm,
  hasChords,
  onBpmChange,
  onPlay,
  onClearChords,
}: HarmonyPlaybackPanelProps) {
  return (
    <aside
      aria-label="Tempo and playback"
      className="-ml-px flex shrink-0 flex-col border border-[var(--border)] bg-[var(--surface-subtle)] p-3"
      style={{ width: PLAYBACK_PANEL_WIDTH }}
    >
      <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)]">
        Playback
      </div>

      <label className="mt-4 grid gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
        Tempo (BPM)
        <input
          className={`h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] ${focusClass}`}
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
        className={`mt-3 h-10 w-full rounded-md border border-[var(--accent-border)] bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] ${focusClass}`}
        onClick={onPlay}
        type="button"
      >
        Play
      </button>

      <button
        className={`mt-auto min-h-10 w-full rounded-md border px-2 py-2 text-xs font-medium ${focusClass} ${
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
    </aside>
  );
}

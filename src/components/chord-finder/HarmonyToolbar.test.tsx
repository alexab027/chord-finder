import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HarmonyPlaybackPanel from "./HarmonyPlaybackPanel";
import HarmonyToolbar from "./HarmonyToolbar";

const noOp = () => {};

describe("HarmonyToolbar", () => {
  it("orders key, mode, notes, accidentals, and rests from left to right", () => {
    const markup = renderToStaticMarkup(
      <HarmonyToolbar
        generationMode="automatic"
        hasNotes={false}
        keySignature="C"
        onAccidentalClick={noOp}
        onClearMelody={noOp}
        onDeleteLast={noOp}
        onGenerationModeChange={noOp}
        onKeySignatureChange={noOp}
        onSelectNote={noOp}
        onSelectRest={noOp}
        selectedAccidental={null}
        selectedDuration="q"
        selectedKind="note"
      />,
    );

    const labels = ["Key signature", "Mode", "Notes", "Accidentals", "Rests"];
    const positions = labels.map((label) => markup.indexOf(`>${label}<`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(markup).not.toContain("Key and mode");
    expect(markup).not.toContain("Tempo and playback");
  });
});

describe("HarmonyPlaybackPanel", () => {
  it("stacks tempo and playback controls in a dedicated side rail", () => {
    const markup = renderToStaticMarkup(
      <HarmonyPlaybackPanel
        bpm={90}
        hasChords={false}
        onBpmChange={noOp}
        onClearChords={noOp}
        onPlay={noOp}
      />,
    );

    expect(markup).toContain('aria-label="Tempo and playback"');
    expect(markup).toContain("-ml-px flex shrink-0 flex-col");
    expect(markup.indexOf("Tempo (BPM)")).toBeLessThan(markup.indexOf(">Play<"));
    expect(markup.indexOf(">Play<")).toBeLessThan(
      markup.indexOf(">Clear Chords<"),
    );
    expect(markup).toContain("disabled");
  });
});

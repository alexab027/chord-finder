import { describe, expect, it } from "vitest";
import { buildNamedChord, buildRequestedChord } from "../music/chords";
import type { KeyContext, ScoredChord } from "../music/types";
import { applyChordEdits } from "./actions";
import { parsePureDirectEdits } from "./directEditParser";

// End-to-end coverage for the direct-edit fast path as Staff.handleDirectEdit-
// Shortcut runs it: parse the prompt into actions, then feed those actions to
// the SAME deterministic engine the shortcut uses (applyChordEdits). This
// verifies the two halves compose — the parser's ChordEditAction[] is exactly
// what the engine accepts — without needing to mount the React component.

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

// A four-measure progression with four DISTINCT chords (I – ii – V – vi) so an
// edit to any single measure is observably different from its neighbours.
function baseProgression(): ScoredChord[] {
  return [
    { chord: buildRequestedChord(cMajor, 1, "major"), score: 0, reasons: [] },
    { chord: buildRequestedChord(cMajor, 2, "minor"), score: 0, reasons: [] },
    { chord: buildRequestedChord(cMajor, 5, "major"), score: 0, reasons: [] },
    { chord: buildRequestedChord(cMajor, 6, "minor"), score: 0, reasons: [] },
  ];
}

// Mirrors handleDirectEditShortcut: null means "not a pure edit, defer to Groq".
function runShortcut(prompt: string, progression: ScoredChord[]) {
  const actions = parsePureDirectEdits(prompt, progression.length);
  if (!actions) return null;
  return applyChordEdits(progression, actions, { key: cMajor });
}

describe("direct-edit shortcut pipeline (parse -> apply)", () => {
  it("change measure 2 to F replaces only measure 2", () => {
    const base = baseProgression();
    const result = runShortcut("change measure 2 to F", base);

    expect(result).not.toBeNull();
    const edited = result!;
    expect(edited[1].chord.name).toBe(buildNamedChord(cMajor, "F")!.name);
    expect(edited[0].chord.name).toBe(base[0].chord.name);
    expect(edited[2].chord.name).toBe(base[2].chord.name);
    expect(edited[3].chord.name).toBe(base[3].chord.name);
  });

  it("set the progression to F-G-C-G replaces all four measures", () => {
    const base = baseProgression();
    const result = runShortcut("set the progression to F-G-C-G", base);

    expect(result).not.toBeNull();
    expect(result!.map((chord) => chord.chord.name)).toEqual(
      ["F", "G", "C", "G"].map((name) => buildNamedChord(cMajor, name)!.name),
    );
  });

  it("copy measure 1 to measure 4 moves the first chord into the last", () => {
    const base = baseProgression();
    const result = runShortcut("copy measure 1 to measure 4", base);

    expect(result).not.toBeNull();
    const edited = result!;
    // Measure 4 now matches measure 1...
    expect(edited[3].chord.name).toBe(base[0].chord.name);
    // ...and is genuinely different from what was there before.
    expect(edited[3].chord.name).not.toBe(base[3].chord.name);
    // Untouched measures are preserved.
    expect(edited[1].chord.name).toBe(base[1].chord.name);
    expect(edited[2].chord.name).toBe(base[2].chord.name);
  });

  it("the edit is immutable — the original progression is unchanged", () => {
    const base = baseProgression();
    const originalNames = base.map((chord) => chord.chord.name);
    runShortcut("change measure 2 to F", base);
    expect(base.map((chord) => chord.chord.name)).toEqual(originalNames);
  });

  it("creative and mixed prompts defer to Groq (no shortcut)", () => {
    const base = baseProgression();
    expect(runShortcut("make it jazzier", base)).toBeNull();
    expect(
      runShortcut("make it jazzier and change measure 2 to C", base),
    ).toBeNull();
  });

  it("an edit past the progression length defers rather than throwing", () => {
    const base = baseProgression();
    expect(runShortcut("change measure 5 to F", base)).toBeNull();
  });

  // Safety invariant: every chord name the parser's gate ACCEPTS must be
  // buildable by the engine the shortcut hands off to. If this ever fails, the
  // shortcut would surface an error instead of applying an edit it accepted.
  it("every gate-accepted accidental/quality name is applied without throwing", () => {
    const names = ["Bb", "F#m", "Ebmaj7", "C#", "Ab7", "Bbdim", "Bo", "B°"];
    for (const name of names) {
      const result = runShortcut(`change measure 1 to ${name}`, baseProgression());
      expect(result, `"${name}" should apply via the shortcut`).not.toBeNull();
    }
  });

  it("applies a suspended chord via the shortcut (change measure 2 to Dsus4)", () => {
    const base = baseProgression();
    const result = runShortcut("change measure 2 to Dsus4", base);

    expect(result).not.toBeNull();
    expect(result![1].chord.absoluteSymbol).toBe("Dsus4");
    expect(result![1].chord.quality).toBe("sus4");
    // Neighbours untouched.
    expect(result![0].chord.name).toBe(base[0].chord.name);
    expect(result![2].chord.name).toBe(base[2].chord.name);
  });
});

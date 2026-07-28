import { describe, it, expect } from "vitest";
import { renderPitch, yToPitch } from "./pitchSpelling";
import { PITCHES_TOP_TO_BOTTOM } from "../../music/noteUtils";
import type { PlacedNote } from "../../music/types";

// Minimal note fixture: only pitch/kind/accidental affect spelling, so the
// timing fields are filled with valid-but-irrelevant values.
function makeNote(
  pitch: string,
  accidental: PlacedNote["accidental"] = null,
  kind: PlacedNote["kind"] = "note",
): PlacedNote {
  return { slot: 0, duration: "q", durationSlots: 2, pitch, kind, accidental };
}

describe("renderPitch", () => {
  it("lets an explicit accidental win over the key signature", () => {
    // F major would normally flatten B (b -> bb). An explicit # must override it.
    expect(renderPitch(makeNote("b/4", "#"), "F")).toBe("b#/4");
  });

  it("lets an explicit natural cancel a key-signature accidental", () => {
    // F major flattens B by default; a natural forces the plain letter.
    expect(renderPitch(makeNote("b/4", "n"), "F")).toBe("b/4");
  });

  it("applies the key signature when the note has no accidental", () => {
    // D major sharpens F, so a bare f/4 renders as f#/4.
    expect(renderPitch(makeNote("f/4"), "D")).toBe("f#/4");
  });

  it("leaves a note natural when the key signature does not touch it", () => {
    // C major has no accidentals.
    expect(renderPitch(makeNote("f/4"), "C")).toBe("f/4");
  });

  it("returns a rest's stored pitch unchanged, ignoring the key signature", () => {
    // Rests carry a placeholder pitch that must not be re-spelled.
    expect(renderPitch(makeNote("b/4", null, "rest"), "F")).toBe("b/4");
  });
});

describe("yToPitch", () => {
  // With the top staff line (f/5) at y=40 and the bottom (f/4) at y=80, each
  // pitch step is 5px. A click on the top line should read as f/5.
  it("maps the top staff line to its pitch", () => {
    expect(yToPitch(40, 40, 80)).toBe("f/5");
  });

  it("moves down a pitch step as y increases", () => {
    // 5px below the top line is the next space down (e/5).
    expect(yToPitch(45, 40, 80)).toBe("e/5");
  });

  it("clamps clicks far below the staff to the lowest pitch", () => {
    expect(yToPitch(10000, 40, 80)).toBe(
      PITCHES_TOP_TO_BOTTOM[PITCHES_TOP_TO_BOTTOM.length - 1],
    );
  });
});

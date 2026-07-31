import { describe, expect, it } from "vitest";
import { parsePureDirectEdits } from "./directEditParser";

// The staff is four measures in this pass.
const N = 4;

describe("parsePureDirectEdits — accepts pure exact edits", () => {
  it("change measure N to a chord (the report's motivating case)", () => {
    expect(parsePureDirectEdits("change measure 2 to F", N)).toEqual([
      { type: "replace_chord", measure: 2, chordName: "F" },
    ]);
  });

  it("set / replace / update variants and connectors", () => {
    expect(parsePureDirectEdits("set chord 3 to Am", N)).toEqual([
      { type: "replace_chord", measure: 3, chordName: "Am" },
    ]);
    expect(parsePureDirectEdits("replace measure 1 with G7", N)).toEqual([
      { type: "replace_chord", measure: 1, chordName: "G7" },
    ]);
    expect(parsePureDirectEdits("update bar 4 to Dm7.", N)).toEqual([
      { type: "replace_chord", measure: 4, chordName: "Dm7" },
    ]);
  });

  it("ordinal / number-word / ordinal-word measure references", () => {
    expect(parsePureDirectEdits("change the 2nd chord to F", N)).toEqual([
      { type: "replace_chord", measure: 2, chordName: "F" },
    ]);
    expect(parsePureDirectEdits("change the second chord to F", N)).toEqual([
      { type: "replace_chord", measure: 2, chordName: "F" },
    ]);
    expect(parsePureDirectEdits("set chord two to Am", N)).toEqual([
      { type: "replace_chord", measure: 2, chordName: "Am" },
    ]);
  });

  it("accepts suspended chord names (sus2 / sus4 / bare sus)", () => {
    expect(parsePureDirectEdits("change measure 2 to Dsus4", N)).toEqual([
      { type: "replace_chord", measure: 2, chordName: "Dsus4" },
    ]);
    expect(parsePureDirectEdits("set chord 1 to Gsus2", N)).toEqual([
      { type: "replace_chord", measure: 1, chordName: "Gsus2" },
    ]);
    expect(parsePureDirectEdits("replace measure 3 with Asus", N)).toEqual([
      { type: "replace_chord", measure: 3, chordName: "Asus" },
    ]);
  });

  it("copy one measure to another", () => {
    expect(parsePureDirectEdits("copy measure 1 to measure 4", N)).toEqual([
      { type: "copy_chord", fromMeasure: 1, toMeasure: 4 },
    ]);
    expect(
      parsePureDirectEdits("copy the first chord to the fourth chord", N),
    ).toEqual([{ type: "copy_chord", fromMeasure: 1, toMeasure: 4 }]);
  });

  it("set the whole progression (hyphen, comma, or space separated)", () => {
    const expected = [
      { type: "replace_chord", measure: 1, chordName: "F" },
      { type: "replace_chord", measure: 2, chordName: "G" },
      { type: "replace_chord", measure: 3, chordName: "C" },
      { type: "replace_chord", measure: 4, chordName: "G" },
    ];
    expect(parsePureDirectEdits("set the progression to F-G-C-G", N)).toEqual(
      expected,
    );
    expect(parsePureDirectEdits("use progression F, G, C, G", N)).toEqual(
      expected,
    );
    expect(parsePureDirectEdits("set the progression to F G C G", N)).toEqual(
      expected,
    );
  });

  it("parses multiple exact edits only when every clause is supported", () => {
    expect(
      parsePureDirectEdits(
        "change measure 2 to F and change measure 4 to Am",
        N,
      ),
    ).toEqual([
      { type: "replace_chord", measure: 2, chordName: "F" },
      { type: "replace_chord", measure: 4, chordName: "Am" },
    ]);
  });
});

describe("parsePureDirectEdits — defers to Groq (returns null)", () => {
  it("a pure creative/style request", () => {
    expect(parsePureDirectEdits("make it jazzier", N)).toBeNull();
    expect(parsePureDirectEdits("give me a progression", N)).toBeNull();
  });

  it("a mixed style + edit prompt (the total-parse guarantee)", () => {
    // The leftover 'make it jazzier and' means this is NOT a pure edit.
    expect(
      parsePureDirectEdits("make it jazzier and change measure 2 to C", N),
    ).toBeNull();
    expect(
      parsePureDirectEdits("change measure 2 to C and make it jazzier", N),
    ).toBeNull();
  });

  it("rejects a multi-edit when any clause is malformed", () => {
    expect(
      parsePureDirectEdits(
        "change measure 2 to F and change measure 4 to H",
        N,
      ),
    ).toBeNull();
  });

  it("out-of-range measures defer rather than error", () => {
    expect(parsePureDirectEdits("change measure 9 to F", N)).toBeNull();
    expect(parsePureDirectEdits("copy measure 1 to measure 9", N)).toBeNull();
  });

  it("copy to the same measure is not a real edit", () => {
    expect(parsePureDirectEdits("copy measure 2 to measure 2", N)).toBeNull();
  });

  it("wrong chord count for a whole-progression set", () => {
    expect(parsePureDirectEdits("set the progression to F-G-C", N)).toBeNull();
    expect(
      parsePureDirectEdits("set the progression to F-G-C-G-A", N),
    ).toBeNull();
  });

  it("invalid chord names", () => {
    expect(parsePureDirectEdits("change measure 2 to H", N)).toBeNull();
    expect(parsePureDirectEdits("set the progression to F-G-H-G", N)).toBeNull();
  });

  it("an explanation question is not an edit", () => {
    expect(
      parsePureDirectEdits("why did you choose measure 2?", N),
    ).toBeNull();
  });

  it("empty prompt", () => {
    expect(parsePureDirectEdits("   ", N)).toBeNull();
  });
});

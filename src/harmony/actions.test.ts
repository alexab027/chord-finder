import { describe, expect, it } from "vitest";
import { buildRequestedChord } from "../music/chords";
import type { KeyContext, ScoredChord } from "../music/types";
import { applyChordEdit, applyChordEdits } from "./actions";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function scored(degree: number): ScoredChord {
  return {
    chord: buildRequestedChord(
      cMajor,
      degree,
      degree === 2 || degree === 6 ? "minor" : "major",
    ),
    score: degree,
    reasons: [],
  };
}

describe("harmony edit actions", () => {
  it("replacing one chord changes only that chord", () => {
    const progression = [scored(1), scored(4), scored(5), scored(1)];
    const edited = applyChordEdit(
      progression,
      { type: "replace_chord", measure: 2, chordName: "Am" },
      { key: cMajor },
    );

    expect(edited[0].chord.name).toBe(progression[0].chord.name);
    expect(edited[1].chord.name).toBe("vi");
    expect(edited[2].chord.name).toBe(progression[2].chord.name);
    expect(edited[3].chord.name).toBe(progression[3].chord.name);
  });

  it("copying a chord still works", () => {
    const progression = [scored(1), scored(4), scored(5), scored(6)];
    const edited = applyChordEdit(
      progression,
      { type: "copy_chord", fromMeasure: 1, toMeasure: 4 },
      { key: cMajor },
    );

    expect(edited[3].chord.name).toBe(progression[0].chord.name);
    expect(edited[1].chord.name).toBe(progression[1].chord.name);
  });

  it("copying a chord creates independent mutable chord data", () => {
    const progression = [scored(1), scored(4), scored(5), scored(6)];
    const sourceChord = progression[0].chord;
    const originalPcs = [...sourceChord.pcs];
    const originalNoteNames = [...sourceChord.noteNames];
    const originalPitches = [...sourceChord.pitches];

    const edited = applyChordEdit(
      progression,
      { type: "copy_chord", fromMeasure: 1, toMeasure: 4 },
      { key: cMajor },
    );
    const copiedChord = edited[3].chord;

    expect(edited).not.toBe(progression);
    expect(copiedChord).not.toBe(sourceChord);
    expect(copiedChord.pcs).toEqual(sourceChord.pcs);
    expect(copiedChord.pcs).not.toBe(sourceChord.pcs);
    expect(copiedChord.noteNames).toEqual(sourceChord.noteNames);
    expect(copiedChord.noteNames).not.toBe(sourceChord.noteNames);
    expect(copiedChord.pitches).toEqual(sourceChord.pitches);
    expect(copiedChord.pitches).not.toBe(sourceChord.pitches);

    copiedChord.pcs[0] = 11;
    copiedChord.noteNames[0] = "b";
    copiedChord.pitches[0] = "b/4";

    expect(sourceChord.pcs).toEqual(originalPcs);
    expect(sourceChord.noteNames).toEqual(originalNoteNames);
    expect(sourceChord.pitches).toEqual(originalPitches);
    expect(progression[0].chord.pcs).toEqual(originalPcs);
    expect(progression[0].chord.noteNames).toEqual(originalNoteNames);
    expect(progression[0].chord.pitches).toEqual(originalPitches);
  });

  it("applies chord edits sequentially", () => {
    const progression = [scored(1), scored(4), scored(5), scored(1)];
    const originalSecondChordName = progression[1].chord.name;

    const edited = applyChordEdits(
      progression,
      [
        { type: "replace_chord", measure: 2, chordName: "Dm7" },
        { type: "copy_chord", fromMeasure: 2, toMeasure: 4 },
      ],
      { key: cMajor },
    );

    expect(edited[1].chord.name).toBe("iimin7");
    expect(edited[1].chord.romanNumeral).toBe("iimin7");
    expect(edited[1].chord.absoluteSymbol).toBe("Dm7");
    expect(edited[1].chord.rootName).toBe("D");
    expect(edited[1].chord.name).toBe(edited[1].chord.romanNumeral);
    expect(edited[3].chord.name).toBe(edited[1].chord.name);
    expect(edited[3].chord.name).not.toBe(originalSecondChordName);
  });

  it("unchanged replacement remains unchanged", () => {
    const progression = [scored(1), scored(4), scored(5), scored(1)];
    const edited = applyChordEdit(
      progression,
      { type: "replace_chord", measure: 1, chordName: "C" },
      { key: cMajor },
    );

    expect(edited.map((chord) => chord.chord.name)).toEqual(
      progression.map((chord) => chord.chord.name),
    );
  });
});

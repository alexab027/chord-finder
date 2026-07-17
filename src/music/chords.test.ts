import { describe, expect, it } from "vitest";
import { buildKeyChords, buildNamedChord } from "./chords";
import type { KeyContext } from "./types";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

const eMinor: KeyContext = {
  signature: "G",
  label: "E minor",
  tonicName: "e",
  tonicPc: 4,
  mode: "minor",
};

describe("chord identities", () => {
  it("carries absolute and Roman identities for C major Imaj7", () => {
    const chord = buildKeyChords(cMajor).find(
      ({ degree, quality, inversion }) =>
        degree === 1 && quality === "maj7" && inversion === 0,
    );

    expect(chord).toMatchObject({
      name: "Imaj7",
      romanNumeral: "Imaj7",
      absoluteSymbol: "Cmaj7",
      rootName: "C",
    });
    expect(chord?.name).toBe(chord?.romanNumeral);
  });

  it("carries absolute and Roman identities for E minor IIIadd9", () => {
    const chord = buildKeyChords(eMinor).find(
      ({ degree, quality, inversion }) =>
        degree === 3 && quality === "add9" && inversion === 0,
    );

    expect(chord).toMatchObject({
      name: "IIIadd9",
      romanNumeral: "IIIadd9",
      absoluteSymbol: "Gadd9",
      rootName: "G",
    });
    expect(chord?.name).toBe(chord?.romanNumeral);
  });

  it("preserves both identities for a literal Dm7 replacement candidate", () => {
    const chord = buildNamedChord(cMajor, "Dm7");

    expect(chord).toMatchObject({
      name: "iimin7",
      romanNumeral: "iimin7",
      absoluteSymbol: "Dm7",
      rootName: "D",
    });
    expect(chord?.name).toBe(chord?.romanNumeral);
  });
});

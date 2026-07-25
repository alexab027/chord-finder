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

  it("builds a suspended fourth from a literal name (Dsus4)", () => {
    const chord = buildNamedChord(cMajor, "Dsus4");

    expect(chord).toMatchObject({
      absoluteSymbol: "Dsus4",
      rootName: "D",
      quality: "sus4",
    });
    // sus4 = root, fourth, fifth → D, G, A (pitch classes 2, 7, 9).
    expect(chord?.pcs).toEqual([2, 9, 7]);
    expect(chord?.name).toBe(chord?.romanNumeral);
  });

  it("builds a suspended second from a literal name (Dsus2)", () => {
    const chord = buildNamedChord(cMajor, "Dsus2");

    expect(chord).toMatchObject({
      absoluteSymbol: "Dsus2",
      rootName: "D",
      quality: "sus2",
    });
    // sus2 = root, fifth, second → D, A, E (pitch classes 2, 9, 4).
    expect(chord?.pcs).toEqual([2, 9, 4]);
  });

  it("treats a bare 'sus' as sus4", () => {
    expect(buildNamedChord(cMajor, "Gsus")).toMatchObject({
      absoluteSymbol: "Gsus4",
      quality: "sus4",
    });
  });

  it("matches a generated suspended chord's identity", () => {
    // A user-named sus chord should be identical to the generator's.
    const generated = buildKeyChords(cMajor).find(
      ({ degree, quality }) => degree === 2 && quality === "sus4",
    );
    const named = buildNamedChord(cMajor, "Dsus4");

    expect(named?.absoluteSymbol).toBe(generated?.absoluteSymbol);
    expect(named?.pcs).toEqual(generated?.pcs);
    expect(named?.romanNumeral).toBe(generated?.romanNumeral);
  });
});

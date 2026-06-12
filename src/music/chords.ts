import type {
  ChordCandidate,
  KeyContext,
  KeyMode,
  SuspendedChordQuality,
} from "./types";
import {
  getCloseChordVoicingPitches,
  mod12,
  NOTE_LETTERS,
  SCALE_OFFSETS,
  spellPitchClassForLetter,
} from "./noteUtils";

export const TRIAD_QUALITIES: Record<
  KeyMode,
  ("major" | "minor" | "dim")[]
> = {
  major: ["major", "minor", "minor", "major", "major", "minor", "dim"],
  minor: ["minor", "dim", "major", "minor", "major", "major", "major"],
};

export const ROMAN_NUMERALS: Record<KeyMode, string[]> = {
  major: ["I", "ii", "iii", "IV", "V", "vi", "vii dim"],
  minor: ["i", "ii dim", "III", "iv", "V", "VI", "VII"],
};

const SUSPENDED_CHORD_QUALITIES: SuspendedChordQuality[] = [
  "sus",
  "sus2",
  "sus4",
];

function buildScaleSpellings(key: KeyContext) {
  const tonicLetterIndex = NOTE_LETTERS.indexOf(key.tonicName[0].toLowerCase());
  const scalePcs = SCALE_OFFSETS[key.mode].map((offset) =>
    mod12(key.tonicPc + offset)
  );

  return scalePcs.map((pc, degreeIndex) => {
    const letter =
      NOTE_LETTERS[(tonicLetterIndex + degreeIndex) % NOTE_LETTERS.length];

    return {
      pc,
      name: spellPitchClassForLetter(pc, letter),
    };
  });
}

function buildMajorKeyChords(key: KeyContext): ChordCandidate[] {
  const scaleSpellings = buildScaleSpellings(key);

  const romanNumerals = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

  return scaleSpellings.flatMap((degree, degreeIndex) => {
    const third = scaleSpellings[(degreeIndex + 2) % 7];
    const fifth = scaleSpellings[(degreeIndex + 4) % 7];
    const pcs = [degree.pc, third.pc, fifth.pc];
    const noteNames = [degree.name, third.name, fifth.name];
    const triad = {
      degree: degreeIndex + 1,
      name: romanNumerals[degreeIndex],
      rootPc: degree.pc,
      bassPc: degree.pc,
      pcs,
      noteNames,
      pitches: getCloseChordVoicingPitches(pcs[0], pcs[1], pcs[2], noteNames),
      quality: "triad" as const,
      keyFit: "diatonic" as const,
    };

    if (TRIAD_QUALITIES[key.mode][degreeIndex] === "dim") {
      return [triad];
    }

    return [
      triad,
      ...SUSPENDED_CHORD_QUALITIES.map((quality) =>
        buildSuspendedChordCandidate(
          degreeIndex + 1,
          romanNumerals[degreeIndex],
          degree.pc,
          degree.name,
          fifth.name,
          quality
        )
      ),
    ];
  });
}

function getTriadPcs(rootPc: number, quality: "major" | "minor" | "dim") {
  if (quality === "major") {
    return [rootPc, mod12(rootPc + 4), mod12(rootPc + 7)];
  }

  if (quality === "minor") {
    return [rootPc, mod12(rootPc + 3), mod12(rootPc + 7)];
  }

  return [rootPc, mod12(rootPc + 3), mod12(rootPc + 6)];
}

function getSuspendedChordPcs(rootPc: number, quality: SuspendedChordQuality) {
  if (quality === "sus2") {
    return [rootPc, mod12(rootPc + 2), mod12(rootPc + 7)];
  }

  return [rootPc, mod12(rootPc + 5), mod12(rootPc + 7)];
}

function buildSuspendedChordCandidate(
  degree: number,
  romanNumeral: string,
  rootPc: number,
  rootName: string,
  fifthName: string,
  quality: SuspendedChordQuality
): ChordCandidate {
  const pcs = getSuspendedChordPcs(rootPc, quality);
  const suspendedLetterOffset = quality === "sus2" ? 1 : 3;
  const rootLetterIndex = NOTE_LETTERS.indexOf(rootName[0].toLowerCase());
  const suspendedLetter =
    NOTE_LETTERS[(rootLetterIndex + suspendedLetterOffset) % NOTE_LETTERS.length];
  const noteNames = [
    spellPitchClassForLetter(pcs[0], rootName[0]),
    spellPitchClassForLetter(pcs[1], suspendedLetter),
    spellPitchClassForLetter(pcs[2], fifthName[0]),
  ];

  return {
    degree,
    name: `${romanNumeral}${quality}`,
    rootPc,
    bassPc: rootPc,
    pcs,
    noteNames,
    pitches: getCloseChordVoicingPitches(pcs[0], pcs[1], pcs[2], noteNames),
    quality,
    keyFit: "diatonic",
  };
}

export function buildKeyChords(key: KeyContext): ChordCandidate[] {
  if (key.mode === "major") {
    return buildMajorKeyChords(key);
  }

  const scaleSpellings = buildScaleSpellings(key);

  return scaleSpellings.flatMap((degree, degreeIndex) => {
    const quality = TRIAD_QUALITIES[key.mode][degreeIndex];
    const pcs = getTriadPcs(degree.pc, quality);
    const third = scaleSpellings[(degreeIndex + 2) % 7];
    const fifth = scaleSpellings[(degreeIndex + 4) % 7];
    const noteNames = [
      spellPitchClassForLetter(pcs[0], degree.name[0]),
      spellPitchClassForLetter(pcs[1], third.name[0]),
      spellPitchClassForLetter(pcs[2], fifth.name[0]),
    ];
    const triad = {
      degree: degreeIndex + 1,
      name: ROMAN_NUMERALS[key.mode][degreeIndex],
      rootPc: degree.pc,
      bassPc: degree.pc,
      pcs,
      noteNames,
      pitches: getCloseChordVoicingPitches(pcs[0], pcs[1], pcs[2], noteNames),
      quality: "triad" as const,
      keyFit: "diatonic" as const,
    };

    if (quality === "dim") {
      return [triad];
    }

    return [
      triad,
      ...SUSPENDED_CHORD_QUALITIES.map((susQuality) =>
        buildSuspendedChordCandidate(
          degreeIndex + 1,
          ROMAN_NUMERALS[key.mode][degreeIndex],
          degree.pc,
          degree.name,
          fifth.name,
          susQuality
        )
      ),
    ];
  });
}

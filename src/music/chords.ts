import type {
  ChordCandidate,
  KeyContext,
  KeyMode,
  SuspendedChordQuality,
} from "./types";
import {
  getCloseChordVoicingForPcs,
  getCloseChordVoicingPitches,
  mod12,
  NOTE_LABELS,
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

const BLUES_DOMINANT_DEGREES = [1, 4, 5];

function formatBassName(noteName: string) {
  return NOTE_LABELS[noteName.toLowerCase()] ?? noteName.toUpperCase();
}

function buildInversionCandidates(
  candidate: ChordCandidate,
  maxBassIndex = candidate.pcs.length - 1
) {
  const candidates = [
    {
      ...candidate,
      bassName: candidate.noteNames[0],
      inversion: 0,
    },
  ];

  for (let bassIndex = 1; bassIndex <= maxBassIndex; bassIndex++) {
    const pcs = [
      candidate.pcs[bassIndex],
      ...candidate.pcs.slice(0, bassIndex),
      ...candidate.pcs.slice(bassIndex + 1),
    ];
    const noteNames = [
      candidate.noteNames[bassIndex],
      ...candidate.noteNames.slice(0, bassIndex),
      ...candidate.noteNames.slice(bassIndex + 1),
    ];
    const bassName = noteNames[0];

    candidates.push({
      ...candidate,
      name: `${candidate.name}/${formatBassName(bassName)}`,
      bassPc: pcs[0],
      bassName,
      inversion: bassIndex,
      pcs,
      noteNames,
      pitches: getCloseChordVoicingForPcs(pcs, noteNames),
    });
  }

  return candidates;
}

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
    const triad: ChordCandidate = {
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
      buildAdd9ChordCandidate(
        degreeIndex + 1,
        romanNumerals[degreeIndex],
        pcs,
        degree.name
      ),
      ...buildSeventhChordCandidates(
        degreeIndex + 1,
        romanNumerals[degreeIndex],
        degree.pc,
        degree.name,
        pcs,
        TRIAD_QUALITIES[key.mode][degreeIndex],
        key.mode
      ),
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
    ].flatMap((candidate) =>
      buildInversionCandidates(
        candidate,
        candidate.quality === "add9" ? 2 : candidate.pcs.length - 1
      )
    );
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
    return [rootPc, mod12(rootPc + 7), mod12(rootPc + 2)];
  }

  return [rootPc, mod12(rootPc + 7), mod12(rootPc + 5)];
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
    spellPitchClassForLetter(pcs[1], fifthName[0]),
    spellPitchClassForLetter(pcs[2], suspendedLetter),
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

function getScaleLetter(rootName: string, letterOffset: number) {
  const rootLetterIndex = NOTE_LETTERS.indexOf(rootName[0].toLowerCase());
  return NOTE_LETTERS[(rootLetterIndex + letterOffset) % NOTE_LETTERS.length];
}

function buildAdd9ChordCandidate(
  degree: number,
  romanNumeral: string,
  triadPcs: number[],
  rootName: string
): ChordCandidate {
  const ninthPc = mod12(triadPcs[0] + 14);
  const ninthLetter = getScaleLetter(rootName, 1);
  const pcs = [...triadPcs, ninthPc];
  const noteNames = [
    spellPitchClassForLetter(pcs[0], rootName[0]),
    spellPitchClassForLetter(pcs[1], getScaleLetter(rootName, 2)),
    spellPitchClassForLetter(pcs[2], getScaleLetter(rootName, 4)),
    spellPitchClassForLetter(pcs[3], ninthLetter),
  ];

  return {
    degree,
    name: `${romanNumeral}add9`,
    rootPc: pcs[0],
    bassPc: pcs[0],
    pcs,
    noteNames,
    pitches: getCloseChordVoicingForPcs(pcs, noteNames),
    quality: "add9",
    keyFit: "diatonic",
  };
}

function getDiatonicSeventhQuality(
  triadQuality: "major" | "minor" | "dim",
  degree: number,
  mode: KeyMode
) {
  if (mode === "major" && degree === 5) return "dom7";
  if (mode === "minor" && (degree === 5 || degree === 7)) return "dom7";
  if (triadQuality === "major") return "maj7";
  if (triadQuality === "minor") return "min7";
  return undefined;
}

function buildSeventhChordCandidate(
  degree: number,
  romanNumeral: string,
  rootPc: number,
  rootName: string,
  triadPcs: number[],
  quality: "maj7" | "min7" | "dom7",
  keyFit: "diatonic" | "borrowed"
): ChordCandidate {
  const seventhPc = mod12(rootPc + (quality === "maj7" ? 11 : 10));
  const seventhLetter = getScaleLetter(rootName, 6);
  const pcs = [...triadPcs, seventhPc];
  const noteNames = [
    spellPitchClassForLetter(pcs[0], rootName[0]),
    spellPitchClassForLetter(pcs[1], getScaleLetter(rootName, 2)),
    spellPitchClassForLetter(pcs[2], getScaleLetter(rootName, 4)),
    spellPitchClassForLetter(pcs[3], seventhLetter),
  ];

  return {
    degree,
    name: `${romanNumeral}${quality}`,
    rootPc,
    bassPc: rootPc,
    pcs,
    noteNames,
    pitches: getCloseChordVoicingForPcs(pcs, noteNames),
    quality,
    keyFit,
  };
}

function buildSeventhChordCandidates(
  degree: number,
  romanNumeral: string,
  rootPc: number,
  rootName: string,
  triadPcs: number[],
  triadQuality: "major" | "minor" | "dim",
  mode: KeyMode
) {
  const diatonicQuality = getDiatonicSeventhQuality(triadQuality, degree, mode);
  const candidates: ChordCandidate[] = [];

  if (diatonicQuality) {
    candidates.push(
      buildSeventhChordCandidate(
        degree,
        romanNumeral,
        rootPc,
        rootName,
        triadPcs,
        diatonicQuality,
        "diatonic"
      )
    );
  }

  if (
    triadQuality !== "dim" &&
    BLUES_DOMINANT_DEGREES.includes(degree) &&
    diatonicQuality !== "dom7"
  ) {
    candidates.push(
      buildSeventhChordCandidate(
        degree,
        romanNumeral,
        rootPc,
        rootName,
        triadPcs,
        "dom7",
        "borrowed"
      )
    );
  }

  return candidates;
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
    const triad: ChordCandidate = {
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
      buildAdd9ChordCandidate(
        degreeIndex + 1,
        ROMAN_NUMERALS[key.mode][degreeIndex],
        pcs,
        degree.name
      ),
      ...buildSeventhChordCandidates(
        degreeIndex + 1,
        ROMAN_NUMERALS[key.mode][degreeIndex],
        degree.pc,
        degree.name,
        pcs,
        quality,
        key.mode
      ),
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
    ].flatMap((candidate) =>
      buildInversionCandidates(
        candidate,
        candidate.quality === "add9" ? 2 : candidate.pcs.length - 1
      )
    );
  });
}

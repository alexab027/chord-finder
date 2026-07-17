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
  NOTE_TO_PC,
  PC_TO_NOTE_SHARP,
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

function getAbsoluteTriadSuffix(quality: "major" | "minor" | "dim") {
  if (quality === "minor") return "m";
  if (quality === "dim") return "dim";
  return "";
}

function getAbsoluteSeventhSuffix(quality: "maj7" | "min7" | "dom7") {
  if (quality === "maj7") return "maj7";
  if (quality === "min7") return "m7";
  return "7";
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
      name: `${candidate.romanNumeral}/${formatBassName(bassName)}`,
      romanNumeral: `${candidate.romanNumeral}/${formatBassName(bassName)}`,
      absoluteSymbol: `${candidate.absoluteSymbol}/${formatBassName(bassName)}`,
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
      romanNumeral: romanNumerals[degreeIndex],
      absoluteSymbol: `${formatBassName(degree.name)}${getAbsoluteTriadSuffix(TRIAD_QUALITIES[key.mode][degreeIndex])}`,
      rootName: formatBassName(degree.name),
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
        degree.name,
        TRIAD_QUALITIES[key.mode][degreeIndex]
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
    romanNumeral: `${romanNumeral}${quality}`,
    absoluteSymbol: `${formatBassName(rootName)}${quality === "sus" ? "sus4" : quality}`,
    rootName: formatBassName(rootName),
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
  rootName: string,
  triadQuality: "major" | "minor" | "dim"
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
    romanNumeral: `${romanNumeral}add9`,
    absoluteSymbol: `${formatBassName(rootName)}${triadQuality === "minor" ? "m(add9)" : "add9"}`,
    rootName: formatBassName(rootName),
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
    romanNumeral: `${romanNumeral}${quality}`,
    absoluteSymbol: `${formatBassName(rootName)}${getAbsoluteSeventhSuffix(quality)}`,
    rootName: formatBassName(rootName),
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

// Quality vocabulary the model is allowed to request for a set_chord action.
export type RequestedChordQuality =
  | "major"
  | "minor"
  | "dominant"
  | "diminished";

// Deterministically resolve a single chord from a scale degree + requested
// quality (+ optional 7th) within the current key. The model never returns a
// ChordCandidate or pitch names — only degree/quality/extension/measure — and
// this function turns that into a concrete root-position chord using the same
// scale-spelling, triad, and voicing primitives the generator uses.
export function buildRequestedChord(
  key: KeyContext,
  degree: number,
  quality: RequestedChordQuality,
  extension?: 7
): ChordCandidate {
  const degreeIndex = ((degree - 1) % 7 + 7) % 7;
  const scaleSpellings = buildScaleSpellings(key);
  const root = scaleSpellings[degreeIndex];
  const romanBase = ROMAN_NUMERALS[key.mode][degreeIndex];

  const triadQuality: "major" | "minor" | "dim" =
    quality === "minor"
      ? "minor"
      : quality === "diminished"
        ? "dim"
        : "major"; // major + dominant both use a major triad
  const triadPcs = getTriadPcs(root.pc, triadQuality);

  const rootName = spellPitchClassForLetter(triadPcs[0], root.name[0]);
  const thirdName = spellPitchClassForLetter(
    triadPcs[1],
    getScaleLetter(root.name, 2)
  );
  const fifthName = spellPitchClassForLetter(
    triadPcs[2],
    getScaleLetter(root.name, 4)
  );

  if (extension !== 7) {
    const noteNames = [rootName, thirdName, fifthName];
    return {
      degree: degreeIndex + 1,
      name: romanBase,
      romanNumeral: romanBase,
      absoluteSymbol: `${formatBassName(rootName)}${getAbsoluteTriadSuffix(triadQuality)}`,
      rootName: formatBassName(rootName),
      rootPc: triadPcs[0],
      bassPc: triadPcs[0],
      pcs: triadPcs,
      noteNames,
      pitches: getCloseChordVoicingPitches(
        triadPcs[0],
        triadPcs[1],
        triadPcs[2],
        noteNames
      ),
      quality: "triad",
      keyFit: "diatonic",
    };
  }

  // maj7 = +11; minor/dominant b7 = +10; diminished + 7 = half-diminished (+10).
  const seventhInterval = quality === "major" ? 11 : 10;
  const engineQuality: "maj7" | "min7" | "dom7" =
    quality === "major" ? "maj7" : quality === "dominant" ? "dom7" : "min7";
  const suffix = quality === "diminished" ? "m7b5" : engineQuality;

  const seventhPc = mod12(triadPcs[0] + seventhInterval);
  const seventhName = spellPitchClassForLetter(
    seventhPc,
    getScaleLetter(root.name, 6)
  );
  const pcs = [...triadPcs, seventhPc];
  const noteNames = [rootName, thirdName, fifthName, seventhName];

  return {
    degree: degreeIndex + 1,
    name: `${romanBase}${suffix}`,
    romanNumeral: `${romanBase}${suffix}`,
    absoluteSymbol: `${formatBassName(rootName)}${quality === "diminished" ? "m7b5" : getAbsoluteSeventhSuffix(engineQuality)}`,
    rootName: formatBassName(rootName),
    rootPc: pcs[0],
    bassPc: pcs[0],
    pcs,
    noteNames,
    pitches: getCloseChordVoicingForPcs(pcs, noteNames),
    quality: engineQuality,
    keyFit: "diatonic",
  };
}

function getRomanForAbsoluteChord(
  key: KeyContext,
  degreeIndex: number,
  rootPc: number,
  quality: RequestedChordQuality
) {
  if (degreeIndex === -1) return NOTE_LABELS[PC_TO_NOTE_SHARP[rootPc]];

  const cleanRomanBase = ROMAN_NUMERALS[key.mode][degreeIndex]
    .replace(/\s*dim$/, "")
    .replace(/\u00b0/g, "");

  if (quality === "minor") return cleanRomanBase.toLowerCase();
  if (quality === "diminished") return `${cleanRomanBase.toLowerCase()}\u00b0`;
  return cleanRomanBase.toUpperCase();

  /*
  if (quality === "minor") {
    return ROMAN_NUMERALS[key.mode][degreeIndex]
      .replace(" dim", "")
      .replace("Â°", "")
      .toLowerCase();
  }

  if (quality === "diminished") {
    return `${ROMAN_NUMERALS[key.mode][degreeIndex]
      .replace(" dim", "")
      .replace("Â°", "")
      .toLowerCase()} dim`;
  }

  return ROMAN_NUMERALS[key.mode][degreeIndex]
    .replace(" dim", "")
    .replace("Â°", "")
    .toUpperCase();
  */
}

function parseNamedChord(chordName: string):
  | {
      rootName: string;
      rootPc: number;
      quality: RequestedChordQuality;
      extension?: 7;
    }
  | null {
  const normalized = chordName.trim().replace(/\s+/g, "");
  const match = /^([A-Ga-g])([#b]?)(maj|min|m|dim|o|°|dom)?(7)?$/.exec(
    normalized
  );
  if (!match) return null;

  const rootName = `${match[1].toLowerCase()}${match[2] ?? ""}`;
  const rootPc = NOTE_TO_PC[rootName];
  if (rootPc === undefined) return null;

  const rawQuality = match[3]?.toLowerCase();
  const quality: RequestedChordQuality =
    rawQuality === "m" || rawQuality === "min"
      ? "minor"
      : rawQuality === "dim" || rawQuality === "o" || rawQuality === "°"
        ? "diminished"
        : rawQuality === "dom"
          ? "dominant"
          : match[4] === "7"
            ? "dominant"
            : "major";

  return {
    rootName,
    rootPc,
    quality,
    ...(match[4] === "7" ? { extension: 7 as const } : {}),
  };
}

export function buildNamedChord(
  key: KeyContext,
  chordName: string
): ChordCandidate | null {
  const parsed = parseNamedChord(chordName);
  if (!parsed) return null;

  const triadQuality: "major" | "minor" | "dim" =
    parsed.quality === "minor"
      ? "minor"
      : parsed.quality === "diminished"
        ? "dim"
        : "major";
  const triadPcs = getTriadPcs(parsed.rootPc, triadQuality);
  const rootName = spellPitchClassForLetter(triadPcs[0], parsed.rootName[0]);
  const thirdName = spellPitchClassForLetter(
    triadPcs[1],
    getScaleLetter(rootName, 2)
  );
  const fifthName = spellPitchClassForLetter(
    triadPcs[2],
    getScaleLetter(rootName, 4)
  );
  const romanBase = getRomanForAbsoluteChord(
    key,
    SCALE_OFFSETS[key.mode].findIndex(
      (offset) => mod12(key.tonicPc + offset) === parsed.rootPc
    ),
    parsed.rootPc,
    parsed.quality
  );
  const degreeIndex = SCALE_OFFSETS[key.mode].findIndex(
    (offset) => mod12(key.tonicPc + offset) === parsed.rootPc
  );
  const degree = degreeIndex === -1 ? 0 : degreeIndex + 1;

  if (parsed.extension !== 7) {
    const noteNames = [rootName, thirdName, fifthName];
    return {
      degree,
      name: romanBase,
      romanNumeral: romanBase,
      absoluteSymbol: `${formatBassName(parsed.rootName)}${getAbsoluteTriadSuffix(triadQuality)}`,
      rootName: formatBassName(parsed.rootName),
      rootPc: triadPcs[0],
      bassPc: triadPcs[0],
      pcs: triadPcs,
      noteNames,
      pitches: getCloseChordVoicingPitches(
        triadPcs[0],
        triadPcs[1],
        triadPcs[2],
        noteNames
      ),
      quality: "triad",
      keyFit: "unrelated",
    };
  }

  const seventhInterval = parsed.quality === "major" ? 11 : 10;
  const engineQuality: "maj7" | "min7" | "dom7" =
    parsed.quality === "major"
      ? "maj7"
      : parsed.quality === "dominant"
        ? "dom7"
        : "min7";
  const seventhPc = mod12(triadPcs[0] + seventhInterval);
  const seventhName = spellPitchClassForLetter(
    seventhPc,
    getScaleLetter(rootName, 6)
  );
  const pcs = [...triadPcs, seventhPc];
  const noteNames = [rootName, thirdName, fifthName, seventhName];

  return {
    degree,
    name: `${romanBase}${engineQuality}`,
    romanNumeral: `${romanBase}${engineQuality}`,
    absoluteSymbol: `${formatBassName(parsed.rootName)}${getAbsoluteSeventhSuffix(engineQuality)}`,
    rootName: formatBassName(parsed.rootName),
    rootPc: pcs[0],
    bassPc: pcs[0],
    pcs,
    noteNames,
    pitches: getCloseChordVoicingForPcs(pcs, noteNames),
    quality: engineQuality,
    keyFit: "unrelated",
  };
}

function assertCmajorNamedChordMappings() {
  const cMajor: KeyContext = {
    signature: "C",
    label: "C major",
    tonicName: "c",
    tonicPc: 0,
    mode: "major",
  };
  const expected: Record<string, string> = {
    C: "I",
    Dm: "ii",
    Dm7: "iimin7",
    Em: "iii",
    F: "IV",
    G: "V",
    G7: "Vdom7",
    Am: "vi",
    Bdim: "vii\u00b0",
  };

  for (const [chordName, romanNumeral] of Object.entries(expected)) {
    const candidate = buildNamedChord(cMajor, chordName);
    if (candidate?.name !== romanNumeral) {
      throw new Error(
        `Named chord mapping failed: ${chordName} expected ${romanNumeral}, got ${candidate?.name ?? "null"}`
      );
    }
  }
}

if (process.env.NODE_ENV === "development") {
  assertCmajorNamedChordMappings();
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
      romanNumeral: ROMAN_NUMERALS[key.mode][degreeIndex],
      absoluteSymbol: `${formatBassName(degree.name)}${getAbsoluteTriadSuffix(quality)}`,
      rootName: formatBassName(degree.name),
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
        degree.name,
        quality
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

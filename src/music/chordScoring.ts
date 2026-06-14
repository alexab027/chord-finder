import type {
  ChordCandidate,
  ChordQuality,
  ChordScoreContext,
  KeyContext,
  PlacedNote,
  ScoreResult,
  ScoredChord,
  StyleOption,
} from "./types";
import {
  DEFAULT_TIME_SIGNATURE,
  getBeatSlots,
  getMetricWeight,
  getStrongBeatWeight,
  mod12,
  NOTE_LABELS,
  noteCoversSlot,
  PC_TO_NOTE_SHARP,
  pitchToPc,
} from "./noteUtils";

function getPcLabel(pc: number) {
  const noteName = PC_TO_NOTE_SHARP[mod12(pc)];
  return NOTE_LABELS[noteName] ?? noteName.toUpperCase();
}

function getNoteNameLabel(noteName: string) {
  return NOTE_LABELS[noteName.toLowerCase()] ?? noteName.toUpperCase();
}

function getMeasureMelodyPcs(
  measureNotes: PlacedNote[],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  const beatSlots = getBeatSlots(DEFAULT_TIME_SIGNATURE);

  return measureNotes.flatMap((note) => {
    if (note.kind === "rest") return [];

    const pc = pitchToPc(getRenderedPitchFn(note));
    if (pc === undefined) return [];

    const beatWeight = beatSlots.reduce((total, slot) => {
      if (!noteCoversSlot(note, slot)) return total;
      return total + getStrongBeatWeight(slot, DEFAULT_TIME_SIGNATURE);
    }, 0);

    return [
      {
        pc,
        label: getPcLabel(pc),
        weight:
          note.durationSlots * getMetricWeight(note.slot, DEFAULT_TIME_SIGNATURE) +
          beatWeight,
      },
    ];
  });
}

export function scoreMelodyFit(
  candidate: ChordCandidate,
  melodyNotes: PlacedNote[],
  getRenderedPitchFn: (note: PlacedNote) => string
): ScoreResult {
  const melodyPcs = getMeasureMelodyPcs(melodyNotes, getRenderedPitchFn);
  if (melodyPcs.length === 0) return { points: 0, reasons: [] };

  const mainMelody = melodyPcs
    .slice()
    .sort((a, b) => b.weight - a.weight)[0];
  const matchingNotes = melodyPcs.filter(({ pc }) => candidate.pcs.includes(pc));
  const reasons: string[] = [];
  let points = 0;

  if (candidate.pcs.includes(mainMelody.pc)) {
    points += 5;
    reasons.push(`Contains the main melody note ${mainMelody.label}`);
  } else {
    points -= 4;
    reasons.push(`Does not contain the main melody note ${mainMelody.label}`);
  }

  if (matchingNotes.length > 1) {
    points += 3;
    reasons.push("Contains multiple melody notes from the measure");
  }

  return { points, reasons };
}

export function scoreKeyFit(
  candidate: ChordCandidate,
  key: KeyContext
): ScoreResult {
  if (candidate.keyFit === "diatonic") {
    return {
      points: 4,
      reasons: [`Fits the key of ${key.label}`],
    };
  }

  if (candidate.keyFit === "borrowed") {
    return {
      points: 2,
      reasons: [`Uses a common borrowed color in ${key.label}`],
    };
  }

  return {
    points: -5,
    reasons: [`Feels unrelated to ${key.label}`],
  };
}

function isSeventhOrExtendedQuality(quality: ChordQuality) {
  return ["add9", "maj7", "min7", "dom7"].includes(quality);
}

export function scoreStyle(
  candidate: ChordCandidate,
  style: StyleOption,
  context: ChordScoreContext
): ScoreResult {
  const reasons: string[] = [];
  let points = 0;

  if (style === "simple") {
    if (candidate.quality === "triad") {
      points += 3;
      reasons.push("Keeps the harmony simple with a basic triad");
    }

    if ([1, 4, 5, 6].includes(candidate.degree)) {
      points += 2;
      reasons.push("Uses a familiar I, IV, V, or vi chord");
    }

    if (isSeventhOrExtendedQuality(candidate.quality)) {
      points -= 3;
      reasons.push("Avoids extra color for the simple style");
    }
  }

  if (style === "jazzy") {
    if (["maj7", "min7", "dom7"].includes(candidate.quality)) {
      points += 3;
      reasons.push(`Adds jazzy color with a ${candidate.quality} quality`);
    }

    if (
      (context.previousChord?.degree === 2 && candidate.degree === 5) ||
      (context.previousChord?.degree === 5 && candidate.degree === 1)
    ) {
      points += 2;
      reasons.push("Supports ii-V-I style movement");
    }
  }

  if (style === "bluesy") {
    if (candidate.quality === "dom7") {
      points += 4;
      reasons.push("Adds blues color with a dominant 7 chord");
    }

    if (candidate.quality === "dom7" && [1, 4, 5].includes(candidate.degree)) {
      points += 3;
      reasons.push("Uses a blues-friendly I7, IV7, or V7 chord");
    }
  }

  if (style === "descendingBass" && context.previousChord) {
    const downwardDistance = mod12(context.previousChord.bassPc - candidate.bassPc);
    const upwardDistance = mod12(candidate.bassPc - context.previousChord.bassPc);

    if (candidate.inversion && candidate.bassName) {
      reasons.push(
        `Uses an inversion to put ${getNoteNameLabel(candidate.bassName)} in the bass`
      );
    }

    if (downwardDistance > 0 && downwardDistance < upwardDistance) {
      points += 5;
      reasons.push("Moves the bass downward from the previous chord");
    }

    if (downwardDistance > 0 && downwardDistance <= 2) {
      points += 3;
      reasons.push("Creates smooth stepwise bass motion");
    }

    if (upwardDistance > 4 && upwardDistance < downwardDistance) {
      points -= 3;
      reasons.push("Creates an awkward upward bass jump");
    }
  }

  return { points, reasons };
}

export function scoreProgression(
  previousChord: ChordCandidate | undefined,
  candidate: ChordCandidate
): ScoreResult {
  if (!previousChord) return { points: 0, reasons: [] };

  const movement = `${previousChord.degree}-${candidate.degree}`;
  const commonPopMovements = new Set(["1-5", "5-6", "6-4", "4-1"]);

  if (movement === "5-1") {
    return { points: 5, reasons: ["Resolves V to I"] };
  }

  if (movement === "2-5") {
    return { points: 4, reasons: ["Sets up a strong ii to V movement"] };
  }

  if (movement === "4-5") {
    return { points: 3, reasons: ["Builds energy with IV to V movement"] };
  }

  if (commonPopMovements.has(movement)) {
    return {
      points: 2,
      reasons: ["Uses a familiar pop progression movement"],
    };
  }

  return { points: 0, reasons: [] };
}

export function scoreChord(
  candidate: ChordCandidate,
  context: ChordScoreContext
): ScoredChord {
  const scoreParts = [
    scoreMelodyFit(candidate, context.measureNotes, context.getRenderedPitchFn),
    scoreKeyFit(candidate, context.key),
    scoreStyle(candidate, context.style, context),
    scoreProgression(context.previousChord, candidate),
  ];

  return {
    chord: candidate,
    score: scoreParts.reduce((total, part) => total + part.points, 0),
    reasons: scoreParts.flatMap((part) => part.reasons),
  };
}

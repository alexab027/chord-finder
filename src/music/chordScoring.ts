import type {
  ChordCandidate,
  ChordQuality,
  ChordScoreContext,
  GenerationPreferences,
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
  getRenderedPitchFn: (note: PlacedNote) => string,
  // Scales the penalty for clashing with the main melody note. 1 = full
  // penalty (default / dropdown path); higher dissonance tolerance lowers it.
  clashMultiplier = 1
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
    points -= 4 * clashMultiplier;
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

function isSeventhQuality(quality: ChordQuality) {
  return ["maj7", "min7", "dom7"].includes(quality);
}

function isSuspendedQuality(quality: ChordQuality) {
  return quality === "sus" || quality === "sus2" || quality === "sus4";
}

// Scores how the candidate's bass relates to the previous chord's bass.
// `weight` scales every reward/penalty: at weight 1 this reproduces the
// engine's original "descendingBass" scoring exactly.
function scoreBassMotion(
  candidate: ChordCandidate,
  previousChord: ChordCandidate,
  weight: number
): ScoreResult {
  const reasons: string[] = [];
  let points = 0;

  const downwardDistance = mod12(previousChord.bassPc - candidate.bassPc);
  const upwardDistance = mod12(candidate.bassPc - previousChord.bassPc);

  if (candidate.inversion && candidate.bassName) {
    reasons.push(
      `Uses an inversion to put ${getNoteNameLabel(candidate.bassName)} in the bass`
    );
  }

  if (downwardDistance > 0 && downwardDistance < upwardDistance) {
    points += 5 * weight;
    reasons.push("Moves the bass downward from the previous chord");
  }

  if (downwardDistance > 0 && downwardDistance <= 2) {
    points += 3 * weight;
    reasons.push("Creates smooth stepwise bass motion");
  }

  if (upwardDistance > 4 && upwardDistance < downwardDistance) {
    points -= 3 * weight;
    reasons.push("Creates an awkward upward bass jump");
  }

  return { points, reasons };
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

  // Bass motion is driven by descendingBassWeight on the AI path. On the
  // dropdown path it is gated on the "descendingBass" style at full strength,
  // preserving the engine's original behavior.
  const descendingBassWeight = context.preferences
    ? context.preferences.descendingBassWeight
    : style === "descendingBass"
      ? 1
      : 0;

  if (descendingBassWeight > 0 && context.previousChord) {
    const bassMotion = scoreBassMotion(
      candidate,
      context.previousChord,
      descendingBassWeight
    );
    points += bassMotion.points;
    reasons.push(...bassMotion.reasons);
  }

  return { points, reasons };
}

// Rewards/penalizes a candidate against the interpreted complexity preferences.
// Only used on the AI path (see scoreChord).
export function scorePreferences(
  candidate: ChordCandidate,
  preferences: GenerationPreferences
): ScoreResult {
  const reasons: string[] = [];
  let points = 0;

  if (preferences.preferSevenths && isSeventhQuality(candidate.quality)) {
    points += 3;
    reasons.push("Uses a seventh chord to add the requested harmonic color.");
  }

  if (preferences.preferSuspensions && isSuspendedQuality(candidate.quality)) {
    points += 3;
    reasons.push("Uses a suspension for gentle tension.");
  }

  if (preferences.complexity <= 0.3) {
    if (candidate.quality === "triad") {
      points += 2;
      reasons.push("Keeps the harmony simple and direct.");
    } else if (isSeventhOrExtendedQuality(candidate.quality)) {
      points -= 2;
      reasons.push("Avoids extra complexity for a simpler sound.");
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
  // dissonanceTolerance softens the melody-clash penalty: 0 -> full penalty,
  // 1 -> only 20% of it. Never reaches zero. Dropdown path keeps full penalty.
  const clashMultiplier = context.preferences
    ? 1 - 0.8 * context.preferences.dissonanceTolerance
    : 1;

  const scoreParts: ScoreResult[] = [
    scoreMelodyFit(
      candidate,
      context.measureNotes,
      context.getRenderedPitchFn,
      clashMultiplier
    ),
    scoreKeyFit(candidate, context.key),
    scoreStyle(candidate, context.style, context),
    scoreProgression(context.previousChord, candidate),
  ];

  if (context.preferences) {
    scoreParts.push(scorePreferences(candidate, context.preferences));
  }

  return {
    chord: candidate,
    score: scoreParts.reduce((total, part) => total + part.points, 0),
    reasons: scoreParts.flatMap((part) => part.reasons),
  };
}

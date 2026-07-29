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
  SCALE_OFFSETS,
} from "./noteUtils";

const MEASURE_SLOT_COUNT = 8;

const INTERVAL_DISSONANCE_PENALTIES: Record<number, number> = {
  0: 0,
  1: 5,
  2: 1.2,
  3: 0,
  4: 0,
  5: 0.8,
  6: 3.2,
  7: 0,
  8: 0.8,
  9: 0,
  10: 1.4,
  11: 5,
};

export type MelodyFitOptions = {
  melodyFitPriority?: number;
  consonancePriority?: number;
  dissonanceTolerance?: number;
  isFinalMeasure?: boolean;
};

export type MelodyEvent = {
  note: PlacedNote;
  pc: number;
  label: string;
  importance: number;
  index: number;
};

function getPcLabel(pc: number) {
  const noteName = PC_TO_NOTE_SHARP[mod12(pc)];
  return NOTE_LABELS[noteName] ?? noteName.toUpperCase();
}

function getNoteNameLabel(noteName: string) {
  return NOTE_LABELS[noteName.toLowerCase()] ?? noteName.toUpperCase();
}

export function getMelodyNoteImportance(
  note: PlacedNote,
  measureNotes: PlacedNote[],
  isFinalMeasure = false,
) {
  const beatSlots = getBeatSlots(DEFAULT_TIME_SIGNATURE);
  const coveredBeatWeight = beatSlots.reduce((total, slot) => {
    if (!noteCoversSlot(note, slot)) return total;
    return total + getStrongBeatWeight(slot, DEFAULT_TIME_SIGNATURE);
  }, 0);
  const metricWeight = getMetricWeight(note.slot, DEFAULT_TIME_SIGNATURE);
  const durationWeight = Math.min(2.2, note.durationSlots / 2);
  const measureEnd = note.slot + note.durationSlots >= MEASURE_SLOT_COUNT;
  const latestNoteEnd = Math.max(
    ...measureNotes
      .filter((measureNote) => measureNote.kind === "note")
      .map((measureNote) => measureNote.slot + measureNote.durationSlots),
    0,
  );
  const isFinalMelodicEvent =
    isFinalMeasure && note.slot + note.durationSlots >= latestNoteEnd;

  let importance =
    1 + durationWeight + metricWeight * 0.45 + coveredBeatWeight * 0.25;

  if (measureEnd) importance += 0.25;
  if (isFinalMeasure) importance += 0.3;
  if (isFinalMelodicEvent && note.durationSlots >= 2) importance += 0.7;

  return importance;
}

function getMeasureMelodyEvents(
  measureNotes: PlacedNote[],
  getRenderedPitchFn: (note: PlacedNote) => string,
  isFinalMeasure = false,
) {
  return measureNotes.flatMap((note, index) => {
    if (note.kind === "rest") return [];

    const pc = pitchToPc(getRenderedPitchFn(note));
    if (pc === undefined) return [];

    return [
      {
        note,
        pc,
        label: getPcLabel(pc),
        importance: getMelodyNoteImportance(note, measureNotes, isFinalMeasure),
        index,
      },
    ];
  });
}

function getIntervalDistance(a: number, b: number) {
  const interval = mod12(a - b);
  return Math.min(interval, 12 - interval);
}

export function getIntervalDissonancePenalty(
  melodyPc: number,
  chordPc: number,
) {
  return (
    INTERVAL_DISSONANCE_PENALTIES[getIntervalDistance(melodyPc, chordPc)] ?? 0
  );
}

export function isStepwiseResolution(
  event: MelodyEvent,
  melodyEvents: MelodyEvent[],
) {
  const nextEvent = melodyEvents.find(
    (candidate) => candidate.index > event.index,
  );
  if (!nextEvent) return false;
  const distance = getIntervalDistance(event.pc, nextEvent.pc);
  return distance === 1 || distance === 2;
}

function isWeakMetricPosition(note: PlacedNote) {
  return getMetricWeight(note.slot, DEFAULT_TIME_SIGNATURE) < 1;
}

function getScalePcs(key: KeyContext) {
  return SCALE_OFFSETS[key.mode].map((offset) => mod12(key.tonicPc + offset));
}

export function scoreMelodyNoteAgainstChord(
  event: MelodyEvent,
  melodyEvents: MelodyEvent[],
  candidate: ChordCandidate,
  key: KeyContext,
  options: MelodyFitOptions = {},
): ScoreResult {
  const melodyFitPriority = options.melodyFitPriority ?? 1;
  const consonancePriority = options.consonancePriority ?? 1;
  const dissonanceTolerance = options.dissonanceTolerance ?? 0;
  const toleranceMultiplier = 1 - 0.65 * dissonanceTolerance;
  const reasons: string[] = [];
  let points = 0;

  if (candidate.pcs.includes(event.pc)) {
    points += 2.4 * event.importance * melodyFitPriority;
    if (event.importance >= 4) {
      reasons.push(`Supports important melody note ${event.label}`);
    }
    return { points, reasons };
  }

  const strongestPenalty = Math.max(
    ...candidate.pcs.map((pc) => getIntervalDissonancePenalty(event.pc, pc)),
  );
  const resolvesByStep = isStepwiseResolution(event, melodyEvents);
  const scaleCompatible = getScalePcs(key).includes(event.pc);
  const weakResolvingNonChordTone =
    scaleCompatible && isWeakMetricPosition(event.note) && resolvesByStep;
  const sustained = event.note.durationSlots >= 4;

  let penalty =
    strongestPenalty *
    event.importance *
    consonancePriority *
    toleranceMultiplier;

  if (weakResolvingNonChordTone) penalty *= 0.3;
  else if (resolvesByStep) penalty *= 0.55;
  if (sustained) penalty *= 1.2;

  if (penalty > 0) {
    points -= penalty;
    if (strongestPenalty >= 4) {
      reasons.push(`${event.label} creates an exposed semitone clash`);
    } else if (strongestPenalty >= 3) {
      reasons.push(`${event.label} creates a strong non-chord dissonance`);
    }
  } else {
    points -= 0.35 * event.importance * melodyFitPriority;
  }

  if (resolvesByStep && strongestPenalty > 0) {
    points += 0.6 * event.importance * melodyFitPriority;
    reasons.push(`${event.label} resolves by step as a non-chord tone`);
  }

  return { points, reasons };
}

export function scoreMelodyFit(
  candidate: ChordCandidate,
  melodyNotes: PlacedNote[],
  getRenderedPitchFn: (note: PlacedNote) => string,
  key: KeyContext,
  options: MelodyFitOptions = {},
): ScoreResult {
  const melodyEvents = getMeasureMelodyEvents(
    melodyNotes,
    getRenderedPitchFn,
    options.isFinalMeasure,
  );
  if (melodyEvents.length === 0) return { points: 0, reasons: [] };

  const reasons: string[] = [];
  const scoreParts = melodyEvents.map((event) =>
    scoreMelodyNoteAgainstChord(event, melodyEvents, candidate, key, options),
  );
  const matchingNotes = melodyEvents.filter(({ pc }) =>
    candidate.pcs.includes(pc),
  );
  const importantMatch = matchingNotes.some((event) => event.importance >= 4);

  if (importantMatch) {
    reasons.push("Contains an important melody note from the measure");
  }
  if (matchingNotes.length > 1) {
    reasons.push("Contains multiple melody notes from the measure");
  }

  const points =
    scoreParts.reduce((total, part) => total + part.points, 0) +
    (matchingNotes.length > 1 ? 1.5 : 0);

  for (const part of scoreParts) {
    reasons.push(...part.reasons);
  }

  if (options.isFinalMeasure && importantMatch) {
    reasons.push("Supports the final-measure melody");
  }

  return { points, reasons };
}

export function scoreKeyFit(
  candidate: ChordCandidate,
  key: KeyContext,
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
  weight: number,
): ScoreResult {
  const reasons: string[] = [];
  let points = 0;

  const downwardDistance = mod12(previousChord.bassPc - candidate.bassPc);
  const upwardDistance = mod12(candidate.bassPc - previousChord.bassPc);

  if (candidate.inversion && candidate.bassName) {
    reasons.push(
      `Uses an inversion to put ${getNoteNameLabel(candidate.bassName)} in the bass`,
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
  context: ChordScoreContext,
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

  // Bass motion is driven by descendingBassWeight on the AI path.
  // Descending bass is a generation constraint, not a style.
  const descendingBassWeight = context.preferences?.descendingBassWeight ?? 0;
  if (descendingBassWeight > 0 && context.previousChord) {
    const bassMotion = scoreBassMotion(
      candidate,
      context.previousChord,
      descendingBassWeight,
    );
    points += bassMotion.points;
    reasons.push(...bassMotion.reasons);
  }

  return { points, reasons };
}

// Rewards a candidate for matching the progression the user is revising. The
// model never picks chords; it only sets how strongly similarity is rewarded
// (via preserveOverallProgression / changeAmount / locked positions).
export function scoreRevisionSimilarity(
  candidate: ChordCandidate,
  context: ChordScoreContext,
): ScoreResult {
  const target = context.revisionTarget;
  const revision = context.revision;
  if (!target || !revision) return { points: 0, reasons: [] };

  const reasons: string[] = [];
  let points = 0;

  const degreeMatch = candidate.degree === target.degree;
  const qualityMatch = candidate.quality === target.quality;
  const bassMatch = candidate.bassPc === target.bassPc;
  // 0 (large change requested) .. 1 (keep as-is). Scales the soft reward.
  const similarityWeight = 1 - revision.changeAmount;

  if (context.revisionLocked) {
    // This position was explicitly requested to stay the same: dominate scoring
    // so the search effectively locks the chord at this measure.
    if (degreeMatch) {
      points += 30;
      reasons.push("Preserves the previous chord as requested.");
    }
    if (qualityMatch) points += 8;
    if (bassMatch) points += 4;
    return { points, reasons };
  }

  if (revision.preserveOverallProgression && degreeMatch) {
    // A base reward keeps the same harmonic root even for large changes; the
    // scaled part rewards staying close when only a small change was asked for.
    points += 4 + 8 * similarityWeight;

    if (qualityMatch) {
      points += 3 * similarityWeight;
      reasons.push("Keeps the previous chord on the same scale degree.");
    } else if (isSeventhQuality(candidate.quality)) {
      reasons.push("Adds a seventh while keeping the same harmonic root.");
    } else {
      reasons.push("Keeps the same harmonic root as the previous version.");
    }
  }

  return { points, reasons };
}

// Rewards/penalizes a candidate against the interpreted complexity preferences.
// Only used on the AI path (see scoreChord).
export function scorePreferences(
  candidate: ChordCandidate,
  preferences: GenerationPreferences,
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
  candidate: ChordCandidate,
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
  context: ChordScoreContext,
): ScoredChord {
  const melodyFitOptions: MelodyFitOptions = context.preferences
    ? {
        melodyFitPriority: context.preferences.melodyFitPriority,
        consonancePriority: context.preferences.consonancePriority,
        dissonanceTolerance: context.preferences.dissonanceTolerance,
        isFinalMeasure: context.measureIndex === context.measureCount - 1,
      }
    : {
        isFinalMeasure: context.measureIndex === context.measureCount - 1,
      };

  const scoreParts: ScoreResult[] = [
    scoreMelodyFit(
      candidate,
      context.measureNotes,
      context.getRenderedPitchFn,
      context.key,
      melodyFitOptions,
    ),
    scoreKeyFit(candidate, context.key),
    scoreStyle(candidate, context.style, context),
    scoreProgression(context.previousChord, candidate),
  ];

  if (context.preferences) {
    scoreParts.push(scorePreferences(candidate, context.preferences));
  }

  if (context.revision) {
    scoreParts.push(scoreRevisionSimilarity(candidate, context));
  }

  return {
    chord: candidate,
    score: scoreParts.reduce((total, part) => total + part.points, 0),
    reasons: scoreParts.flatMap((part) => part.reasons),
  };
}

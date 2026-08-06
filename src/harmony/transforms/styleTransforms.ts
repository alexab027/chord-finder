import { buildKeyChords } from "../../music/chords";
import { scoreFullProgression } from "../../music/chordGeneration";
import type {
  ChordCandidate,
  ChordQuality,
  ScoredChord,
  StyleIntensity,
} from "../../music/types";
import {
  candidateHash,
  deduplicateCandidates,
} from "../candidates/candidateHash";
import type {
  CandidateGenerationContext,
  CandidatePoolEntry,
} from "../candidates/types";

const COMPLEXITY: Record<ChordQuality, number> = {
  triad: 0,
  sus: 1,
  sus2: 1,
  sus4: 1,
  add9: 2,
  maj7: 2,
  min7: 2,
  dom7: 2,
};

const JAZZ_COLOR: Record<ChordQuality, number> = {
  triad: 0,
  sus: 0.5,
  sus2: 0.5,
  sus4: 0.5,
  add9: 2,
  maj7: 2,
  min7: 2,
  dom7: 2,
};

export function chordComplexity(chord: ChordCandidate) {
  return COMPLEXITY[chord.quality] + ((chord.inversion ?? 0) > 0 ? 0.5 : 0);
}

export function progressionComplexity(progression: readonly ScoredChord[]) {
  return progression.reduce(
    (total, { chord }) => total + chordComplexity(chord),
    0,
  );
}

export function jazzColorScore(progression: readonly ScoredChord[]) {
  return progression.reduce(
    (total, { chord }) => total + JAZZ_COLOR[chord.quality],
    0,
  );
}

function changeBudget(level: StyleIntensity, measureCount: number) {
  if (level === 0) return 0;
  if (level === 1) return Math.min(1, measureCount);
  if (level === 2) return Math.min(2, measureCount);
  return measureCount;
}

function rootPositionOptions(
  chord: ChordCandidate,
  keyChords: readonly ChordCandidate[],
) {
  return keyChords.filter(
    (candidate) =>
      candidate.degree === chord.degree &&
      candidate.rootPc === chord.rootPc &&
      candidate.bassPc === candidate.rootPc &&
      (candidate.inversion ?? 0) === 0,
  );
}

function transformWithQuality(
  progression: readonly ScoredChord[],
  keyChords: readonly ChordCandidate[],
  level: StyleIntensity,
  acceptedQualities: readonly ChordQuality[],
) {
  let remaining = changeBudget(level, progression.length);
  return progression.map(({ chord }) => {
    if (remaining === 0 || acceptedQualities.includes(chord.quality)) {
      return chord;
    }
    const replacement = rootPositionOptions(chord, keyChords).find(
      (candidate) => acceptedQualities.includes(candidate.quality),
    );
    if (!replacement) return chord;
    remaining -= 1;
    return replacement;
  });
}

function scoreTransform(
  chords: readonly ChordCandidate[],
  context: CandidateGenerationContext,
): CandidatePoolEntry {
  const scored = scoreFullProgression(
    chords,
    context.key,
    context.measures,
    context.getRenderedPitchFn,
    context.style,
    context.preferences,
    context.revision,
  );
  return {
    ...scored,
    symbolicHash: candidateHash(scored.progression),
    source: "style_transform",
  };
}

export function buildStyleTransformCandidates(
  seeds: readonly CandidatePoolEntry[],
  context: CandidateGenerationContext,
  maxCandidates: number,
): CandidatePoolEntry[] {
  const limit = Math.max(0, Math.floor(maxCandidates));
  if (limit === 0) return [];

  const keyChords = buildKeyChords(context.key);
  const preferences = context.preferences;
  if (!preferences) return [];
  const candidates = seeds.flatMap((seed) => {
    if (context.style === "simple") {
      const level = preferences.simplicityLevel ?? 1;
      const chords = transformWithQuality(
        seed.progression,
        keyChords,
        level,
        ["triad"],
      );
      const transformed = scoreTransform(chords, context);
      return progressionComplexity(transformed.progression) <
        progressionComplexity(seed.progression)
        ? [transformed]
        : [];
    }

    const level = preferences.jazzLevel ?? 1;
    const seventh = scoreTransform(
      transformWithQuality(seed.progression, keyChords, level, [
        "maj7",
        "min7",
        "dom7",
      ]),
      context,
    );
    const add9 = scoreTransform(
      transformWithQuality(seed.progression, keyChords, level, ["add9"]),
      context,
    );
    return [seventh, add9].filter(
      (candidate) =>
        jazzColorScore(candidate.progression) >
        jazzColorScore(seed.progression),
    );
  });

  return deduplicateCandidates(candidates)
    .sort((left, right) => right.totalScore - left.totalScore)
    .slice(0, limit);
}

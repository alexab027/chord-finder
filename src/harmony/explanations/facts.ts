import type { ChordEditAction } from "../actions";
import { candidateHash } from "../candidates/candidateHash";
import { jazzColorScore, progressionComplexity } from "../transforms/styleTransforms";
import type { ScoredChord } from "../../music/types";

export const HARMONY_FACTS_SCHEMA_VERSION = 1 as const;

export type ExactEditProvenance = {
  kind: "user_exact_edit";
  actionType: ChordEditAction["type"];
  targetMeasure: number;
  sourceMeasure?: number;
  resultingSymbol: string;
  statement: string;
};

export type CandidateExplanationFacts = {
  schemaVersion: typeof HARMONY_FACTS_SCHEMA_VERSION;
  progressionId: string;
  activeKey: string;
  requestSummary: string;
  candidateRole?: "closest" | "moderate" | "distinct";
  candidateSource?:
    | "ranked_engine"
    | "base_rescored"
    | "base_quality_alternative"
    | "style_transform";
  chordFacts: Array<{
    measure: number;
    symbol: string;
    romanNumeral: string;
    degree: number;
    rootPc: number;
    bassPc: number;
    quality: string;
    score: number;
    reasons: string[];
  }>;
  relationToBase?: {
    baseProgressionId: string;
    changedMeasures: number[];
    exactPositionMatches: number;
    distance: number;
  };
  styleFacts: {
    complexity: number;
    jazzColor: number;
    complexityDeltaFromBase?: number;
    jazzColorDeltaFromBase?: number;
  };
  exactEdits: ExactEditProvenance[];
};

function sameChordIdentity(a: ScoredChord, b: ScoredChord) {
  return (
    a.chord.degree === b.chord.degree &&
    a.chord.rootPc === b.chord.rootPc &&
    a.chord.quality === b.chord.quality &&
    a.chord.bassPc === b.chord.bassPc &&
    (a.chord.inversion ?? 0) === (b.chord.inversion ?? 0)
  );
}

export function buildExactEditProvenance(
  actions: readonly ChordEditAction[],
  progression: readonly ScoredChord[],
): ExactEditProvenance[] {
  return actions.flatMap((action) => {
    const targetMeasure =
      action.type === "copy_chord" ? action.toMeasure : action.measure;
    const result = progression[targetMeasure - 1];
    if (!result) return [];

    const sourceMeasure =
      action.type === "copy_chord" ? action.fromMeasure : undefined;
    const statement = sourceMeasure
      ? `Measure ${targetMeasure} is ${result.chord.absoluteSymbol} because you explicitly requested a copy of measure ${sourceMeasure}.`
      : `Measure ${targetMeasure} is ${result.chord.absoluteSymbol} because you explicitly requested that chord there.`;

    return [{
      kind: "user_exact_edit" as const,
      actionType: action.type,
      targetMeasure,
      sourceMeasure,
      resultingSymbol: result.chord.absoluteSymbol,
      statement,
    }];
  });
}

export function buildCandidateExplanationFacts({
  progression,
  activeKey,
  requestSummary,
  candidateRole,
  candidateSource,
  baseProgression,
  exactActions = [],
}: {
  progression: readonly ScoredChord[];
  activeKey: string;
  requestSummary: string;
  candidateRole?: CandidateExplanationFacts["candidateRole"];
  candidateSource?: CandidateExplanationFacts["candidateSource"];
  baseProgression?: readonly ScoredChord[] | null;
  exactActions?: readonly ChordEditAction[];
}): CandidateExplanationFacts {
  const complexity = progressionComplexity(progression);
  const jazzColor = jazzColorScore(progression);
  const relationToBase = baseProgression
    ? {
        baseProgressionId: candidateHash(baseProgression),
        changedMeasures: progression.flatMap((chord, index) =>
          baseProgression[index] && sameChordIdentity(chord, baseProgression[index])
            ? []
            : [index + 1],
        ),
        exactPositionMatches: progression.filter(
          (chord, index) =>
            baseProgression[index] && sameChordIdentity(chord, baseProgression[index]),
        ).length,
        distance: progression.reduce((total, chord, index) => {
          const base = baseProgression[index];
          if (!base) return total + 4;
          return total +
            (chord.chord.rootPc === base.chord.rootPc ? 0 : 2) +
            (chord.chord.quality === base.chord.quality ? 0 : 1) +
            (chord.chord.bassPc === base.chord.bassPc ? 0 : 1);
        }, 0),
      }
    : undefined;

  return {
    schemaVersion: HARMONY_FACTS_SCHEMA_VERSION,
    progressionId: candidateHash(progression),
    activeKey,
    requestSummary,
    candidateRole,
    candidateSource,
    chordFacts: progression.map(({ chord, score, reasons }, index) => ({
      measure: index + 1,
      symbol: chord.absoluteSymbol,
      romanNumeral: chord.romanNumeral,
      degree: chord.degree,
      rootPc: chord.rootPc,
      bassPc: chord.bassPc,
      quality: chord.quality,
      score,
      reasons: [...reasons],
    })),
    relationToBase,
    styleFacts: {
      complexity,
      jazzColor,
      complexityDeltaFromBase: baseProgression
        ? complexity - progressionComplexity(baseProgression)
        : undefined,
      jazzColorDeltaFromBase: baseProgression
        ? jazzColor - jazzColorScore(baseProgression)
        : undefined,
    },
    exactEdits: buildExactEditProvenance(exactActions, progression),
  };
}

export type TransitionFact = {
  fromMeasure: number;
  toMeasure: number;
  fromSymbol: string;
  toSymbol: string;
  fromRomanNumeral: string;
  toRomanNumeral: string;
  relationship: "dominant_to_tonic" | "supertonic_to_dominant" | "subdominant_to_dominant" | "shared_tones" | "root_motion";
  sharedPitchClasses: number[];
  explanation: string;
};

export function buildTransitionFacts(
  progression: readonly ScoredChord[],
): TransitionFact[] {
  return progression.slice(0, -1).map((from, index) => {
    const to = progression[index + 1];
    const sharedPitchClasses = [...new Set(from.chord.pcs)].filter((pc) =>
      to.chord.pcs.includes(pc),
    );
    const fromMeasure = index + 1;
    const toMeasure = index + 2;
    let relationship: TransitionFact["relationship"] = "root_motion";
    let explanation = `The root moves from ${from.chord.absoluteSymbol} to ${to.chord.absoluteSymbol}.`;

    if (from.chord.degree === 5 && to.chord.degree === 1) {
      relationship = "dominant_to_tonic";
      explanation = "This is a V-to-I dominant-to-tonic resolution.";
    } else if (from.chord.degree === 2 && to.chord.degree === 5) {
      relationship = "supertonic_to_dominant";
      explanation = "This is a ii-to-V move toward the dominant.";
    } else if (from.chord.degree === 4 && to.chord.degree === 5) {
      relationship = "subdominant_to_dominant";
      explanation = "This is a IV-to-V move from the subdominant toward the dominant.";
    } else if (sharedPitchClasses.length > 0) {
      relationship = "shared_tones";
      explanation = `The adjacent chords share ${sharedPitchClasses.length} pitch class${sharedPitchClasses.length === 1 ? "" : "es"}.`;
    }

    return {
      fromMeasure,
      toMeasure,
      fromSymbol: from.chord.absoluteSymbol,
      toSymbol: to.chord.absoluteSymbol,
      fromRomanNumeral: from.chord.romanNumeral,
      toRomanNumeral: to.chord.romanNumeral,
      relationship,
      sharedPitchClasses,
      explanation,
    };
  });
}

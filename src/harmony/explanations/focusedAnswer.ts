import type { ScoredChord } from "../../music/types";
import { buildTransitionFacts, type CandidateExplanationFacts } from "./facts";

export type FocusedHarmonyAnswer = {
  overview: string;
  measures: Array<{ measure: number; chord: string; explanation: string }>;
};

const MEASURE_TOKEN = "\\d+|one|two|three|four|first|second|third|fourth";

function measureNumber(token: string) {
  const words: Record<string, number> = {
    one: 1,
    first: 1,
    two: 2,
    second: 2,
    three: 3,
    third: 3,
    four: 4,
    fourth: 4,
  };
  return words[token.toLowerCase()] ?? Number(token);
}

function candidateOverview(facts: CandidateExplanationFacts) {
  const relation = facts.relationToBase;
  const changed = relation?.changedMeasures ?? [];
  const roleText =
    facts.candidateRole === "closest"
      ? relation
        ? "This is the closest option to the comparison progression."
        : "This is the best-fitting candidate in this set."
      : facts.candidateRole === "moderate"
        ? "This option makes a moderate structural change."
        : facts.candidateRole === "distinct"
          ? "This is the most structurally distinct valid option in this candidate set."
          : "This is the current progression.";
  const changes = relation
    ? changed.length > 0
      ? ` It changes measure${changed.length === 1 ? "" : "s"} ${changed.join(", ")}.`
      : " It preserves every chord position."
    : "";
  const style = ` Its measured complexity is ${facts.styleFacts.complexity} and its jazz-color score is ${facts.styleFacts.jazzColor}.`;
  return `${roleText}${changes}${style}`;
}

export function explainCandidateFacts(
  facts: CandidateExplanationFacts,
): FocusedHarmonyAnswer {
  return { overview: candidateOverview(facts), measures: [] };
}

export function answerFocusedHarmonyQuestion({
  question,
  progression,
  facts,
}: {
  question: string;
  progression: readonly ScoredChord[];
  facts: CandidateExplanationFacts;
}): FocusedHarmonyAnswer | null {
  const normalized = question.toLowerCase();
  if (/\b(option|candidate)\b/.test(normalized)) {
    return explainCandidateFacts(facts);
  }

  const transitionMatch = normalized.match(
    new RegExp(
      `(?:measure|chord)s?\\s*(${MEASURE_TOKEN})\\s*(?:to|through|and|into|between)\\s*(?:measure|chord)?s?\\s*(${MEASURE_TOKEN})`,
    ),
  );
  if (transitionMatch) {
    const fromMeasure = measureNumber(transitionMatch[1]);
    const toMeasure = measureNumber(transitionMatch[2]);
    const transition = buildTransitionFacts(progression).find(
      (fact) =>
        fact.fromMeasure === Math.min(fromMeasure, toMeasure) &&
        fact.toMeasure === Math.max(fromMeasure, toMeasure),
    );
    if (transition) {
      return {
        overview: `Measures ${transition.fromMeasure}–${transition.toMeasure}: ${transition.explanation}`,
        measures: [],
      };
    }
  }

  const measureMatch = normalized.match(
    new RegExp(`(?:measure|chord)\\s*(${MEASURE_TOKEN})`),
  );
  if (!measureMatch) return null;
  const measure = measureNumber(measureMatch[1]);
  const chordFact = facts.chordFacts.find((fact) => fact.measure === measure);
  if (!chordFact) return null;
  const provenance = facts.exactEdits.find(
    (edit) => edit.targetMeasure === measure,
  );
  const explanation = provenance?.statement ??
    chordFact.reasons[0] ??
    `${chordFact.symbol} is ${chordFact.romanNumeral} in ${facts.activeKey}.`;

  return {
    overview: "",
    measures: [{ measure, chord: chordFact.symbol, explanation }],
  };
}

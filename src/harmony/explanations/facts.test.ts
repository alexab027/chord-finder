import { describe, expect, it } from "vitest";
import { buildNamedChord } from "../../music/chords";
import type { KeyContext, ScoredChord } from "../../music/types";
import {
  buildCandidateExplanationFacts,
  buildTransitionFacts,
} from "./facts";
import { answerFocusedHarmonyQuestion } from "./focusedAnswer";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function progression(symbols: string[]): ScoredChord[] {
  return symbols.map((symbol) => ({
    chord: buildNamedChord(cMajor, symbol)!,
    score: 1,
    reasons: [`Deterministic score fact for ${symbol}`],
  }));
}

describe("candidate explanation facts", () => {
  it("records role, base relation, style metrics, identity, and exact-edit provenance", () => {
    const base = progression(["C", "F", "G", "C"]);
    const candidate = progression(["C", "Dm", "G", "C"]);
    const facts = buildCandidateExplanationFacts({
      progression: candidate,
      activeKey: "C major",
      requestSummary: "Put Dm in measure 2",
      candidateRole: "closest",
      candidateSource: "ranked_engine",
      baseProgression: base,
      exactActions: [{ type: "replace_chord", measure: 2, chordName: "Dm" }],
    });

    expect(facts.schemaVersion).toBe(1);
    expect(facts.progressionId).toMatch(/^symbolic:v1:/);
    expect(facts.relationToBase?.changedMeasures).toEqual([2]);
    expect(facts.styleFacts.complexity).toBeTypeOf("number");
    expect(facts.exactEdits[0]).toMatchObject({
      kind: "user_exact_edit",
      targetMeasure: 2,
      resultingSymbol: "Dm",
    });
    expect(facts.exactEdits[0].statement).toContain("explicitly requested");
    expect(() => JSON.stringify(facts)).not.toThrow();
  });

  it("only labels ii-V and V-I when adjacent scale degrees prove them", () => {
    const transitions = buildTransitionFacts(
      progression(["C", "Dm", "G", "C"]),
    );

    expect(transitions[1].relationship).toBe("supertonic_to_dominant");
    expect(transitions[2].relationship).toBe("dominant_to_tonic");
    expect(transitions[0].relationship).not.toBe("dominant_to_tonic");
  });

  it("answers exact measure and transition questions from deterministic facts", () => {
    const chords = progression(["C", "Dm", "G", "C"]);
    const facts = buildCandidateExplanationFacts({
      progression: chords,
      activeKey: "C major",
      requestSummary: "Put Dm in measure 2",
      exactActions: [{ type: "replace_chord", measure: 2, chordName: "Dm" }],
    });

    const measureAnswer = answerFocusedHarmonyQuestion({
      question: "Why is measure 2 Dm?",
      progression: chords,
      facts,
    });
    const transitionAnswer = answerFocusedHarmonyQuestion({
      question: "What happens from measure 3 to measure 4?",
      progression: chords,
      facts,
    });

    expect(measureAnswer?.measures[0].explanation).toContain(
      "explicitly requested",
    );
    expect(transitionAnswer?.overview).toContain("dominant-to-tonic");
  });
});

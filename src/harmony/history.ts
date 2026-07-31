import type { InterpretedStyle } from "../ai/types";
import type { PlacedChord, ScoredChord } from "../music/types";
import { candidateHash } from "./candidates/candidateHash";
import type { CandidateExplanationFacts } from "./explanations/facts";

export type HarmonyCommitSource =
  | "candidate_selection"
  | "direct_edit"
  | "generated";

export type HarmonyHistoryEntry = {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  requestId: string;
  progressionId: string;
  progression: ScoredChord[];
  voicedProgression: PlacedChord[][];
  interpretation: InterpretedStyle | null;
  source: HarmonyCommitSource;
  explanationFacts?: CandidateExplanationFacts;
};

export type HarmonyHistory = {
  entries: HarmonyHistoryEntry[];
  seenHashes: string[];
};

export type HarmonyPersistenceSnapshotV1 = {
  schemaVersion: 1;
  sessionIds: string[];
  commitIds: string[];
  progressionIds: string[];
  history: HarmonyHistory;
};

export const EMPTY_HARMONY_HISTORY: HarmonyHistory = {
  entries: [],
  seenHashes: [],
};

export type RecordHarmonyCommitInput = Omit<
  HarmonyHistoryEntry,
  "id" | "progressionId" | "schemaVersion"
>;

function cloneVoicing(voicedProgression: readonly PlacedChord[][]) {
  return voicedProgression.map((measure) =>
    measure.map((chord) => ({ ...chord, pitches: [...chord.pitches] })),
  );
}

function cloneProgression(progression: readonly ScoredChord[]) {
  return progression.map(({ chord, reasons, ...scored }) => ({
    ...scored,
    reasons: [...reasons],
    chord: {
      ...chord,
      pcs: [...chord.pcs],
      noteNames: [...chord.noteNames],
      pitches: [...chord.pitches],
    },
  }));
}

function cloneExplanationFacts(facts?: CandidateExplanationFacts) {
  if (!facts) return undefined;
  return {
    ...facts,
    chordFacts: facts.chordFacts.map((fact) => ({
      ...fact,
      reasons: [...fact.reasons],
    })),
    relationToBase: facts.relationToBase
      ? {
          ...facts.relationToBase,
          changedMeasures: [...facts.relationToBase.changedMeasures],
        }
      : undefined,
    styleFacts: { ...facts.styleFacts },
    exactEdits: facts.exactEdits.map((edit) => ({ ...edit })),
  };
}

export function recordHarmonyCommit(
  history: HarmonyHistory,
  input: RecordHarmonyCommitInput,
): HarmonyHistory {
  const id = `${input.sessionId}:${input.requestId}`;
  if (history.entries.some((entry) => entry.id === id)) return history;

  const progressionId = candidateHash(input.progression);
  const entry: HarmonyHistoryEntry = {
    ...input,
    schemaVersion: 1,
    id,
    progressionId,
    progression: cloneProgression(input.progression),
    voicedProgression: cloneVoicing(input.voicedProgression),
    interpretation: input.interpretation
      ? { ...input.interpretation, mood: [...input.interpretation.mood] }
      : null,
    explanationFacts: cloneExplanationFacts(input.explanationFacts),
  };

  return {
    entries: [...history.entries, entry],
    seenHashes: history.seenHashes.includes(progressionId)
      ? history.seenHashes
      : [...history.seenHashes, progressionId],
  };
}

export function buildHarmonyPersistenceSnapshot(
  history: HarmonyHistory,
): HarmonyPersistenceSnapshotV1 {
  return {
    schemaVersion: 1,
    sessionIds: [...new Set(history.entries.map((entry) => entry.sessionId))],
    commitIds: history.entries.map((entry) => entry.id),
    progressionIds: [...history.seenHashes],
    history: {
      entries: [...history.entries],
      seenHashes: [...history.seenHashes],
    },
  };
}

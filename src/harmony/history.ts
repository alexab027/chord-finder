import type { InterpretedStyle } from "../ai/types";
import type { PlacedChord, ScoredChord } from "../music/types";
import { candidateHash } from "./candidates/candidateHash";

export type HarmonyCommitSource =
  | "candidate_selection"
  | "direct_edit"
  | "generated";

export type HarmonyHistoryEntry = {
  id: string;
  sessionId: string;
  requestId: string;
  progressionId: string;
  progression: ScoredChord[];
  voicedProgression: PlacedChord[][];
  interpretation: InterpretedStyle | null;
  source: HarmonyCommitSource;
};

export type HarmonyHistory = {
  entries: HarmonyHistoryEntry[];
  seenHashes: string[];
};

export const EMPTY_HARMONY_HISTORY: HarmonyHistory = {
  entries: [],
  seenHashes: [],
};

export type RecordHarmonyCommitInput = Omit<
  HarmonyHistoryEntry,
  "id" | "progressionId"
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

export function recordHarmonyCommit(
  history: HarmonyHistory,
  input: RecordHarmonyCommitInput,
): HarmonyHistory {
  const id = `${input.sessionId}:${input.requestId}`;
  if (history.entries.some((entry) => entry.id === id)) return history;

  const progressionId = candidateHash(input.progression);
  const entry: HarmonyHistoryEntry = {
    ...input,
    id,
    progressionId,
    progression: cloneProgression(input.progression),
    voicedProgression: cloneVoicing(input.voicedProgression),
    interpretation: input.interpretation
      ? { ...input.interpretation, mood: [...input.interpretation.mood] }
      : null,
  };

  return {
    entries: [...history.entries, entry],
    seenHashes: history.seenHashes.includes(progressionId)
      ? history.seenHashes
      : [...history.seenHashes, progressionId],
  };
}

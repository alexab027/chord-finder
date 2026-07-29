import type {
  ChordCandidate,
  GenerationPreferences,
  KeyContext,
  KeyMode,
  PlacedNote,
  RevisionChordTarget,
  RevisionContext,
  ScoredChord,
  StyleOption,
} from "./types";
import { buildKeyChords } from "./chords";
import { scoreChord } from "./chordScoring";

// general for now, may have to edit or add alt fn later if user requests dissonance
const CHORD_TRANSITIONS: Record<KeyMode, Record<number, number[]>> = {
  major: {
    1: [4, 5, 6, 2],
    2: [5, 4],
    3: [6, 4],
    4: [1, 5, 2],
    5: [1, 6],
    6: [4, 2, 5],
    7: [1],
  },
  minor: {
    1: [4, 5, 6, 7],
    2: [5],
    3: [6, 7, 4],
    4: [5, 1],
    5: [1, 6],
    6: [7, 3, 4],
    7: [3, 1],
  },
};

//ranks the transitions, rankings may change as user preference is updated
//future: plan to add helper fn that changes rankings based on user preference for
// commonality vs surprise, and also add some less common transitions to the list
const TRANSITION_SCORES: Record<KeyMode, Record<string, number>> = {
  major: {
    "5-1": 6,
    "2-5": 5,
    "4-5": 4,
    "1-5": 4,
    "1-6": 3,
    "6-4": 4,
    "4-1": 3,
    "5-6": 2,
  },
  minor: {
    "5-1": 6,
    "4-5": 5,
    "7-3": 4,
    "6-7": 4,
    "1-6": 3,
    "1-4": 3,
    "5-6": 2,
  },
};

//default transition scores for any not listed above
// note: scores are based on gen music theory but late can be adjusted for culture/genre
function getTransitionScore(mode: KeyMode, from: number, to: number) {
  return TRANSITION_SCORES[mode][`${from}-${to}`] ?? 1;
}

// ******WEIGHTS for scoring chord patterns*********//
const MELODY_WEIGHT = 1.3;
const TRANSITION_WEIGHT = 1.0;
const CADENCE_WEIGHT = 1.0;
const OPENING_TONIC_BONUS = 2;

function buildChordPaths(
  mode: KeyMode,
  currentPath: number[],
  targetLength: number,
): number[][] {
  if (currentPath.length === targetLength) {
    return [currentPath];
  }

  const currentDegree = currentPath[currentPath.length - 1];
  const nextDegrees = CHORD_TRANSITIONS[mode][currentDegree] ?? [];

  return nextDegrees.flatMap((nextDegree) =>
    buildChordPaths(mode, [...currentPath, nextDegree], targetLength),
  );
}

function getChordCandidatesForDegree(chords: ChordCandidate[], degree: number) {
  return chords.filter((chord) => chord.degree === degree);
}

function getBestScoredChordForMeasure(
  degree: number,
  chords: ChordCandidate[],
  context: {
    key: KeyContext;
    style: StyleOption;
    measureNotes: PlacedNote[];
    measureIndex: number;
    measureCount: number;
    getRenderedPitchFn: (note: PlacedNote) => string;
    previousChord?: ChordCandidate;
    preferences?: GenerationPreferences;
    revision?: {
      preserveOverallProgression: boolean;
      changeAmount: number;
    };
    revisionTarget?: RevisionChordTarget;
    revisionLocked?: boolean;
  },
) {
  const candidates = getChordCandidatesForDegree(chords, degree);

  return (
    candidates
      .map((candidate) => scoreChord(candidate, context))
      .sort((a, b) => b.score - a.score)[0] ?? scoreChord(chords[0], context)
  );
}

function scoreChordPath(
  path: number[],
  chords: ChordCandidate[],
  key: KeyContext,
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string,
  style: StyleOption,
  preferences?: GenerationPreferences,
  revision?: RevisionContext,
) {
  const revisionFlags = revision
    ? {
        preserveOverallProgression: revision.preserveOverallProgression,
        changeAmount: revision.changeAmount,
      }
    : undefined;
  const scoredChords: ScoredChord[] = [];
  let candidateScore = 0;
  let transitionScore = 0;
  let cadenceScore = 0;
  let openingScore = 0;
  let previousChord: ChordCandidate | undefined;

  path.forEach((degree, measureIndex) => {
    const measureNotes = measures[measureIndex] ?? [];
    const scoredChord = getBestScoredChordForMeasure(degree, chords, {
      key,
      style,
      measureNotes,
      measureIndex,
      measureCount: measures.length,
      getRenderedPitchFn,
      previousChord,
      preferences,
      revision: revisionFlags,
      revisionTarget: revision?.targets[measureIndex],
      revisionLocked:
        revision?.preserveChordPositions.includes(measureIndex + 1) ?? false,
    });

    scoredChords.push(scoredChord);
    candidateScore += scoredChord.score;
    previousChord = scoredChord.chord;
  });

  for (let i = 0; i < path.length - 1; i++) {
    transitionScore += getTransitionScore(key.mode, path[i], path[i + 1]);
  }

  const lastDegree = path[path.length - 1];
  const firstDegree = path[0];

  if (firstDegree === 1) openingScore += OPENING_TONIC_BONUS;

  if (lastDegree === 1) cadenceScore += 8;
  else if (lastDegree === 5) cadenceScore += 3;
  else if (lastDegree === 2) cadenceScore -= 3;
  else if (lastDegree === 3) cadenceScore -= 3;
  else if (lastDegree === 7) cadenceScore -= 5;

  // cadenceStrength scales the strength of the resolution bonus and the
  // weak-ending penalties. Centered so 0 halves it and 1 boosts it by 1.5x.
  // Dropdown path (no preferences) leaves the original scores untouched.
  const cadenceMultiplier = preferences ? 0.5 + preferences.cadenceStrength : 1;

  return {
    path,
    scoredChords,
    score:
      candidateScore * MELODY_WEIGHT +
      transitionScore * TRANSITION_WEIGHT +
      cadenceScore * CADENCE_WEIGHT * cadenceMultiplier +
      openingScore,
  };
}

export function chooseProgression(
  key: KeyContext,
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string,
  style: StyleOption,
  preferences?: GenerationPreferences,
  revision?: RevisionContext,
) {
  const chords = buildKeyChords(key);
  const startDegrees = key.mode === "major" ? [1, 6, 4] : [1, 6, 3];
  const paths = startDegrees.flatMap((degree) =>
    buildChordPaths(key.mode, [degree], 4),
  );

  const rankedPaths = paths
    .map((path) =>
      scoreChordPath(
        path,
        chords,
        key,
        measures,
        getRenderedPitchFn,
        style,
        preferences,
        revision,
      ),
    )
    .sort((a, b) => b.score - a.score);

  // Deterministic: always return the highest-scored path. This previously
  // picked randomly from a top-scoring window, which made identical requests
  // produce different progressions. Array.sort is stable, so score ties resolve
  // to the first-generated path and the result is reproducible across calls.
  // (Exposing the full ranked pool for multi-candidate previews is a separate,
  // later change; today's callers want a single best progression.)
  return rankedPaths[0]?.scoredChords ?? [];
}
